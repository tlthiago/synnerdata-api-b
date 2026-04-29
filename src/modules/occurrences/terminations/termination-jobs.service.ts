import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { logger } from "@/lib/logger";

type TerminationJobResult = {
  processed: number;
  updated: string[];
};

export abstract class TerminationJobsService {
  static async processScheduledTerminations(): Promise<TerminationJobResult> {
    const today = new Date().toISOString().split("T")[0];

    const toComplete = await db
      .select({
        id: schema.terminations.id,
        employeeId: schema.terminations.employeeId,
        organizationId: schema.terminations.organizationId,
      })
      .from(schema.terminations)
      .where(
        and(
          eq(schema.terminations.status, "scheduled"),
          lte(schema.terminations.terminationDate, today),
          isNull(schema.terminations.deletedAt)
        )
      );

    const updated: string[] = [];

    for (const termination of toComplete) {
      try {
        await db
          .update(schema.terminations)
          .set({ status: "completed" })
          .where(eq(schema.terminations.id, termination.id));

        await db
          .update(schema.employees)
          .set({ status: "TERMINATED" })
          .where(eq(schema.employees.id, termination.employeeId));

        updated.push(termination.id);
      } catch (error) {
        logger.error({
          type: "job:process-scheduled-termination:failed",
          terminationId: termination.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:process-scheduled-terminations:complete",
      processed: toComplete.length,
      updated: updated.length,
    });

    return { processed: toComplete.length, updated };
  }
}
