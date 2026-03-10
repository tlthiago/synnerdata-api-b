import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { logger } from "@/lib/logger";

type VacationJobResult = {
  processed: number;
  updated: string[];
};

export abstract class VacationJobsService {
  private static async syncEmployeeStatus(
    employeeId: string,
    organizationId: string
  ): Promise<void> {
    const activeVacations = await db
      .select({ status: schema.vacations.status })
      .from(schema.vacations)
      .where(
        and(
          eq(schema.vacations.employeeId, employeeId),
          eq(schema.vacations.organizationId, organizationId),
          isNull(schema.vacations.deletedAt),
          sql`${schema.vacations.status} NOT IN ('canceled', 'completed')`
        )
      );

    let employeeStatus: "ACTIVE" | "ON_VACATION" | "VACATION_SCHEDULED" =
      "ACTIVE";

    if (activeVacations.some((v) => v.status === "in_progress")) {
      employeeStatus = "ON_VACATION";
    } else if (activeVacations.some((v) => v.status === "scheduled")) {
      employeeStatus = "VACATION_SCHEDULED";
    }

    await db
      .update(schema.employees)
      .set({ status: employeeStatus })
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );
  }

  static async activateScheduledVacations(): Promise<VacationJobResult> {
    const today = new Date().toISOString().split("T")[0];

    const vacationsToActivate = await db
      .select({
        id: schema.vacations.id,
        employeeId: schema.vacations.employeeId,
        organizationId: schema.vacations.organizationId,
      })
      .from(schema.vacations)
      .where(
        and(
          eq(schema.vacations.status, "scheduled"),
          lte(schema.vacations.startDate, today),
          isNull(schema.vacations.deletedAt)
        )
      );

    const updated: string[] = [];

    for (const vacation of vacationsToActivate) {
      try {
        await db
          .update(schema.vacations)
          .set({ status: "in_progress" })
          .where(eq(schema.vacations.id, vacation.id));

        await VacationJobsService.syncEmployeeStatus(
          vacation.employeeId,
          vacation.organizationId
        );

        updated.push(vacation.id);
      } catch (error) {
        logger.error({
          type: "job:activate-vacation:failed",
          vacationId: vacation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:activate-scheduled-vacations:complete",
      processed: vacationsToActivate.length,
      updated: updated.length,
    });

    return { processed: vacationsToActivate.length, updated };
  }

  static async completeExpiredVacations(): Promise<VacationJobResult> {
    const today = new Date().toISOString().split("T")[0];

    const vacationsToComplete = await db
      .select({
        id: schema.vacations.id,
        employeeId: schema.vacations.employeeId,
        organizationId: schema.vacations.organizationId,
      })
      .from(schema.vacations)
      .where(
        and(
          eq(schema.vacations.status, "in_progress"),
          sql`${schema.vacations.endDate} < ${today}`,
          isNull(schema.vacations.deletedAt)
        )
      );

    const updated: string[] = [];

    for (const vacation of vacationsToComplete) {
      try {
        await db
          .update(schema.vacations)
          .set({ status: "completed" })
          .where(eq(schema.vacations.id, vacation.id));

        await VacationJobsService.syncEmployeeStatus(
          vacation.employeeId,
          vacation.organizationId
        );

        updated.push(vacation.id);
      } catch (error) {
        logger.error({
          type: "job:complete-vacation:failed",
          vacationId: vacation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:complete-expired-vacations:complete",
      processed: vacationsToComplete.length,
      updated: updated.length,
    });

    return { processed: vacationsToComplete.length, updated };
  }
}
