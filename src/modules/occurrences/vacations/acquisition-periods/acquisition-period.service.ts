import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type {
  AcquisitionPeriodData,
  CreateAcquisitionPeriodInput,
  DeletedAcquisitionPeriodData,
  UpdateAcquisitionPeriodInput,
} from "./acquisition-period.model";
import {
  AcquisitionPeriodAlreadyDeletedError,
  AcquisitionPeriodInvalidEmployeeError,
  AcquisitionPeriodNotFoundError,
  HireDateUpdateBlockedError,
} from "./errors";

export abstract class AcquisitionPeriodService {
  private static addMonths(dateStr: string, months: number): string {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split("T")[0];
  }

  private static addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }

  private static today(): string {
    return new Date().toISOString().split("T")[0];
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<AcquisitionPeriodData | null> {
    const [result] = await db
      .select({
        id: schema.vacationAcquisitionPeriods.id,
        organizationId: schema.vacationAcquisitionPeriods.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        acquisitionStart: schema.vacationAcquisitionPeriods.acquisitionStart,
        acquisitionEnd: schema.vacationAcquisitionPeriods.acquisitionEnd,
        concessionStart: schema.vacationAcquisitionPeriods.concessionStart,
        concessionEnd: schema.vacationAcquisitionPeriods.concessionEnd,
        daysEntitled: schema.vacationAcquisitionPeriods.daysEntitled,
        daysUsed: schema.vacationAcquisitionPeriods.daysUsed,
        status: schema.vacationAcquisitionPeriods.status,
        notes: schema.vacationAcquisitionPeriods.notes,
        createdAt: schema.vacationAcquisitionPeriods.createdAt,
        updatedAt: schema.vacationAcquisitionPeriods.updatedAt,
      })
      .from(schema.vacationAcquisitionPeriods)
      .innerJoin(
        schema.employees,
        eq(schema.vacationAcquisitionPeriods.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.id, id),
          eq(schema.vacationAcquisitionPeriods.organizationId, organizationId),
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .limit(1);

    if (!result) {
      return null;
    }

    return {
      ...result,
      daysRemaining: result.daysEntitled - result.daysUsed,
    } as AcquisitionPeriodData;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<
    | (AcquisitionPeriodData & {
        deletedAt: Date | null;
        deletedBy: string | null;
      })
    | null
  > {
    const [result] = await db
      .select({
        id: schema.vacationAcquisitionPeriods.id,
        organizationId: schema.vacationAcquisitionPeriods.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        acquisitionStart: schema.vacationAcquisitionPeriods.acquisitionStart,
        acquisitionEnd: schema.vacationAcquisitionPeriods.acquisitionEnd,
        concessionStart: schema.vacationAcquisitionPeriods.concessionStart,
        concessionEnd: schema.vacationAcquisitionPeriods.concessionEnd,
        daysEntitled: schema.vacationAcquisitionPeriods.daysEntitled,
        daysUsed: schema.vacationAcquisitionPeriods.daysUsed,
        status: schema.vacationAcquisitionPeriods.status,
        notes: schema.vacationAcquisitionPeriods.notes,
        createdAt: schema.vacationAcquisitionPeriods.createdAt,
        updatedAt: schema.vacationAcquisitionPeriods.updatedAt,
        deletedAt: schema.vacationAcquisitionPeriods.deletedAt,
        deletedBy: schema.vacationAcquisitionPeriods.deletedBy,
      })
      .from(schema.vacationAcquisitionPeriods)
      .innerJoin(
        schema.employees,
        eq(schema.vacationAcquisitionPeriods.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.id, id),
          eq(schema.vacationAcquisitionPeriods.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!result) {
      return null;
    }

    return {
      ...result,
      daysRemaining: result.daysEntitled - result.daysUsed,
    };
  }

  private static async getEmployeeReference(
    employeeId: string,
    organizationId: string
  ): Promise<{ id: string; name: string }> {
    const [employee] = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .limit(1);

    if (!employee) {
      throw new AcquisitionPeriodInvalidEmployeeError(employeeId);
    }

    return employee;
  }

  static async create(
    input: CreateAcquisitionPeriodInput
  ): Promise<AcquisitionPeriodData> {
    const { organizationId, userId, ...data } = input;

    const employee = await AcquisitionPeriodService.getEmployeeReference(
      data.employeeId,
      organizationId
    );

    const periodId = `acquisition-period-${crypto.randomUUID()}`;

    const [period] = await db
      .insert(schema.vacationAcquisitionPeriods)
      .values({
        id: periodId,
        organizationId,
        employeeId: data.employeeId,
        acquisitionStart: data.acquisitionStart,
        acquisitionEnd: data.acquisitionEnd,
        concessionStart: data.concessionStart,
        concessionEnd: data.concessionEnd,
        daysEntitled: data.daysEntitled,
        status: data.status,
        notes: data.notes,
        createdBy: userId,
      })
      .returning();

    return {
      id: period.id,
      organizationId: period.organizationId,
      employee,
      acquisitionStart: period.acquisitionStart,
      acquisitionEnd: period.acquisitionEnd,
      concessionStart: period.concessionStart,
      concessionEnd: period.concessionEnd,
      daysEntitled: period.daysEntitled,
      daysUsed: period.daysUsed,
      daysRemaining: period.daysEntitled - period.daysUsed,
      status: period.status,
      notes: period.notes,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
    } as AcquisitionPeriodData;
  }

  static async findAvailable(
    organizationId: string,
    employeeId: string
  ): Promise<AcquisitionPeriodData[]> {
    const results = await db
      .select({
        id: schema.vacationAcquisitionPeriods.id,
        organizationId: schema.vacationAcquisitionPeriods.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        acquisitionStart: schema.vacationAcquisitionPeriods.acquisitionStart,
        acquisitionEnd: schema.vacationAcquisitionPeriods.acquisitionEnd,
        concessionStart: schema.vacationAcquisitionPeriods.concessionStart,
        concessionEnd: schema.vacationAcquisitionPeriods.concessionEnd,
        daysEntitled: schema.vacationAcquisitionPeriods.daysEntitled,
        daysUsed: schema.vacationAcquisitionPeriods.daysUsed,
        status: schema.vacationAcquisitionPeriods.status,
        notes: schema.vacationAcquisitionPeriods.notes,
        createdAt: schema.vacationAcquisitionPeriods.createdAt,
        updatedAt: schema.vacationAcquisitionPeriods.updatedAt,
      })
      .from(schema.vacationAcquisitionPeriods)
      .innerJoin(
        schema.employees,
        eq(schema.vacationAcquisitionPeriods.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.organizationId, organizationId),
          eq(schema.vacationAcquisitionPeriods.employeeId, employeeId),
          eq(schema.vacationAcquisitionPeriods.status, "available"),
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .orderBy(schema.vacationAcquisitionPeriods.acquisitionStart);

    return results.map((r) => ({
      ...r,
      daysRemaining: r.daysEntitled - r.daysUsed,
    })) as AcquisitionPeriodData[];
  }

  static async findByEmployee(
    organizationId: string,
    employeeId: string
  ): Promise<AcquisitionPeriodData[]> {
    const results = await db
      .select({
        id: schema.vacationAcquisitionPeriods.id,
        organizationId: schema.vacationAcquisitionPeriods.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        acquisitionStart: schema.vacationAcquisitionPeriods.acquisitionStart,
        acquisitionEnd: schema.vacationAcquisitionPeriods.acquisitionEnd,
        concessionStart: schema.vacationAcquisitionPeriods.concessionStart,
        concessionEnd: schema.vacationAcquisitionPeriods.concessionEnd,
        daysEntitled: schema.vacationAcquisitionPeriods.daysEntitled,
        daysUsed: schema.vacationAcquisitionPeriods.daysUsed,
        status: schema.vacationAcquisitionPeriods.status,
        notes: schema.vacationAcquisitionPeriods.notes,
        createdAt: schema.vacationAcquisitionPeriods.createdAt,
        updatedAt: schema.vacationAcquisitionPeriods.updatedAt,
      })
      .from(schema.vacationAcquisitionPeriods)
      .innerJoin(
        schema.employees,
        eq(schema.vacationAcquisitionPeriods.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.organizationId, organizationId),
          eq(schema.vacationAcquisitionPeriods.employeeId, employeeId),
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .orderBy(schema.vacationAcquisitionPeriods.acquisitionStart);

    return results.map((r) => ({
      ...r,
      daysRemaining: r.daysEntitled - r.daysUsed,
    })) as AcquisitionPeriodData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<AcquisitionPeriodData> {
    const period = await AcquisitionPeriodService.findById(id, organizationId);
    if (!period) {
      throw new AcquisitionPeriodNotFoundError(id);
    }
    return period;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateAcquisitionPeriodInput
  ): Promise<AcquisitionPeriodData> {
    const { userId, ...data } = input;

    const existing = await AcquisitionPeriodService.findById(
      id,
      organizationId
    );
    if (!existing) {
      throw new AcquisitionPeriodNotFoundError(id);
    }

    await db
      .update(schema.vacationAcquisitionPeriods)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.id, id),
          eq(schema.vacationAcquisitionPeriods.organizationId, organizationId)
        )
      );

    return AcquisitionPeriodService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedAcquisitionPeriodData> {
    const existing = await AcquisitionPeriodService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new AcquisitionPeriodNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new AcquisitionPeriodAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.vacationAcquisitionPeriods)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.id, id),
          eq(schema.vacationAcquisitionPeriods.organizationId, organizationId)
        )
      )
      .returning();

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedAcquisitionPeriodData;
  }

  static async generateForEmployee(
    employeeId: string,
    organizationId: string,
    hireDate: string
  ): Promise<void> {
    const today = AcquisitionPeriodService.today();
    let currentStart = hireDate;

    while (true) {
      const acquisitionEnd = AcquisitionPeriodService.addDays(
        AcquisitionPeriodService.addMonths(currentStart, 12),
        -1
      );
      const concessionStart = AcquisitionPeriodService.addDays(
        acquisitionEnd,
        1
      );
      const concessionEnd = AcquisitionPeriodService.addDays(
        AcquisitionPeriodService.addMonths(concessionStart, 12),
        -1
      );

      let status: "pending" | "available" | "expired";

      if (acquisitionEnd <= today) {
        status = concessionEnd < today ? "expired" : "available";
      } else {
        status = "pending";
      }

      await db.insert(schema.vacationAcquisitionPeriods).values({
        id: `acquisition-period-${crypto.randomUUID()}`,
        organizationId,
        employeeId,
        acquisitionStart: currentStart,
        acquisitionEnd,
        concessionStart,
        concessionEnd,
        daysEntitled: 30,
        daysUsed: 0,
        status,
      });

      if (status === "pending") {
        break;
      }

      currentStart = AcquisitionPeriodService.addDays(acquisitionEnd, 1);
    }
  }

  static async recalculateForEmployee(
    employeeId: string,
    organizationId: string,
    newHireDate: string
  ): Promise<void> {
    await db
      .delete(schema.vacationAcquisitionPeriods)
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.employeeId, employeeId),
          eq(schema.vacationAcquisitionPeriods.organizationId, organizationId)
        )
      );

    await AcquisitionPeriodService.generateForEmployee(
      employeeId,
      organizationId,
      newHireDate
    );
  }

  static async ensureRecalculationAllowed(employeeId: string): Promise<void> {
    const periodsWithVacations = await db
      .select({ id: schema.vacationAcquisitionPeriods.id })
      .from(schema.vacationAcquisitionPeriods)
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.employeeId, employeeId),
          sql`${schema.vacationAcquisitionPeriods.daysUsed} > 0`,
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .limit(1);

    if (periodsWithVacations.length > 0) {
      throw new HireDateUpdateBlockedError(employeeId);
    }
  }

  static async updatePeriodStatuses(): Promise<{
    activated: number;
    expired: number;
    generated: number;
  }> {
    const today = AcquisitionPeriodService.today();

    const activated = await db
      .update(schema.vacationAcquisitionPeriods)
      .set({ status: "available" })
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.status, "pending"),
          sql`${schema.vacationAcquisitionPeriods.acquisitionEnd} <= ${today}`,
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .returning();

    const expired = await db
      .update(schema.vacationAcquisitionPeriods)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.status, "available"),
          sql`${schema.vacationAcquisitionPeriods.concessionEnd} < ${today}`,
          sql`${schema.vacationAcquisitionPeriods.daysUsed} < ${schema.vacationAcquisitionPeriods.daysEntitled}`,
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .returning();

    const employeesNeedingNewPeriod = await db
      .selectDistinct({
        employeeId: schema.vacationAcquisitionPeriods.employeeId,
        organizationId: schema.vacationAcquisitionPeriods.organizationId,
      })
      .from(schema.vacationAcquisitionPeriods)
      .where(
        and(
          isNull(schema.vacationAcquisitionPeriods.deletedAt),
          sql`NOT EXISTS (
            SELECT 1 FROM vacation_acquisition_periods vap2
            WHERE vap2.employee_id = ${schema.vacationAcquisitionPeriods.employeeId}
            AND vap2.status = 'pending'
            AND vap2.deleted_at IS NULL
          )`
        )
      );

    let generated = 0;

    for (const emp of employeesNeedingNewPeriod) {
      const [lastPeriod] = await db
        .select({
          acquisitionEnd: schema.vacationAcquisitionPeriods.acquisitionEnd,
        })
        .from(schema.vacationAcquisitionPeriods)
        .where(
          and(
            eq(schema.vacationAcquisitionPeriods.employeeId, emp.employeeId),
            isNull(schema.vacationAcquisitionPeriods.deletedAt)
          )
        )
        .orderBy(desc(schema.vacationAcquisitionPeriods.acquisitionStart))
        .limit(1);

      if (lastPeriod) {
        const nextStart = AcquisitionPeriodService.addDays(
          lastPeriod.acquisitionEnd,
          1
        );
        const nextEnd = AcquisitionPeriodService.addDays(
          AcquisitionPeriodService.addMonths(nextStart, 12),
          -1
        );
        const concStart = AcquisitionPeriodService.addDays(nextEnd, 1);
        const concEnd = AcquisitionPeriodService.addDays(
          AcquisitionPeriodService.addMonths(concStart, 12),
          -1
        );

        const status = nextEnd <= today ? "available" : "pending";

        await db.insert(schema.vacationAcquisitionPeriods).values({
          id: `acquisition-period-${crypto.randomUUID()}`,
          organizationId: emp.organizationId,
          employeeId: emp.employeeId,
          acquisitionStart: nextStart,
          acquisitionEnd: nextEnd,
          concessionStart: concStart,
          concessionEnd: concEnd,
          daysEntitled: 30,
          daysUsed: 0,
          status,
        });

        generated += 1;
      }
    }

    return {
      activated: activated.length,
      expired: expired.length,
      generated,
    };
  }
}
