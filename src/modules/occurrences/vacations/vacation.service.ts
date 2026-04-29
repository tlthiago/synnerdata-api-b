import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { calculateDaysBetween } from "@/lib/schemas/date-helpers";
import { AuditService } from "@/modules/audit/audit.service";
import {
  buildAuditChanges,
  IGNORED_AUDIT_FIELDS,
} from "@/modules/audit/pii-redaction";
import { ensureEmployeeNotTerminated } from "@/modules/employees/status";
import {
  resolveNextCycle,
  type VacationPeriods,
} from "@/modules/occurrences/vacations/period-calculation";
import {
  VacationAlreadyDeletedError,
  VacationAquisitivoExceededError,
  VacationDateBeforeHireError,
  VacationInvalidDateRangeError,
  VacationInvalidDaysError,
  VacationInvalidEmployeeError,
  VacationNotFoundError,
  VacationOverlapError,
  VacationStartDateBeforeConcessiveError,
} from "./errors";
import type {
  CreateVacationInput,
  DeletedVacationData,
  UpdateVacationInput,
  VacationData,
} from "./vacation.model";

type CycleWithBalance = VacationPeriods & {
  daysUsed: number;
  daysRemaining: number;
};

const MAX_VACATION_DAYS_PER_AQUISITIVO = 30;

const VACATION_IGNORED_FIELDS = new Set([
  ...IGNORED_AUDIT_FIELDS,
  "employee",
  "employeeId",
]);

const SELECT_FIELDS = {
  id: schema.vacations.id,
  organizationId: schema.vacations.organizationId,
  employee: {
    id: schema.employees.id,
    name: schema.employees.name,
  },
  startDate: schema.vacations.startDate,
  endDate: schema.vacations.endDate,
  acquisitionPeriodStart: schema.vacations.acquisitionPeriodStart,
  acquisitionPeriodEnd: schema.vacations.acquisitionPeriodEnd,
  concessivePeriodStart: schema.vacations.concessivePeriodStart,
  concessivePeriodEnd: schema.vacations.concessivePeriodEnd,
  daysEntitled: schema.vacations.daysEntitled,
  daysUsed: schema.vacations.daysUsed,
  status: schema.vacations.status,
  notes: schema.vacations.notes,
  createdAt: schema.vacations.createdAt,
  updatedAt: schema.vacations.updatedAt,
} as const;

export abstract class VacationService {
  private static async ensureAquisitivoLimit(args: {
    employeeId: string;
    organizationId: string;
    acquisitionPeriodStart: string | null;
    acquisitionPeriodEnd: string | null;
    requestedDays: number;
    excludeId?: string;
  }): Promise<void> {
    // Legacy records may have null aquisitivo snapshots. The sum is
    // unanchored — skip the check. Per-record Zod .max(30) still
    // protects against obviously-invalid payloads.
    if (
      args.acquisitionPeriodStart === null ||
      args.acquisitionPeriodEnd === null
    ) {
      return;
    }

    const conditions = [
      eq(schema.vacations.organizationId, args.organizationId),
      eq(schema.vacations.employeeId, args.employeeId),
      eq(schema.vacations.acquisitionPeriodStart, args.acquisitionPeriodStart),
      sql`${schema.vacations.status} != 'canceled'`,
      isNull(schema.vacations.deletedAt),
    ];
    if (args.excludeId) {
      conditions.push(sql`${schema.vacations.id} != ${args.excludeId}`);
    }

    const [row] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.vacations.daysEntitled}), 0)::int`,
      })
      .from(schema.vacations)
      .where(and(...conditions));

    const currentTotal = row?.total ?? 0;
    const projectedTotal = currentTotal + args.requestedDays;

    if (projectedTotal > MAX_VACATION_DAYS_PER_AQUISITIVO) {
      throw new VacationAquisitivoExceededError({
        acquisitionPeriodStart: args.acquisitionPeriodStart,
        acquisitionPeriodEnd: args.acquisitionPeriodEnd,
        currentTotal,
        requestedDays: args.requestedDays,
        daysRemaining: Math.max(
          0,
          MAX_VACATION_DAYS_PER_AQUISITIVO - currentTotal
        ),
      });
    }
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<VacationData | null> {
    const [result] = await db
      .select(SELECT_FIELDS)
      .from(schema.vacations)
      .innerJoin(
        schema.employees,
        eq(schema.vacations.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.vacations.id, id),
          eq(schema.vacations.organizationId, organizationId),
          isNull(schema.vacations.deletedAt)
        )
      )
      .limit(1);

    return (result as VacationData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(VacationData & { deletedAt: Date | null }) | null> {
    const [result] = await db
      .select({
        ...SELECT_FIELDS,
        deletedAt: schema.vacations.deletedAt,
      })
      .from(schema.vacations)
      .innerJoin(
        schema.employees,
        eq(schema.vacations.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.vacations.id, id),
          eq(schema.vacations.organizationId, organizationId)
        )
      )
      .limit(1);

    return result ?? null;
  }

  private static async getEmployeeReference(
    employeeId: string,
    organizationId: string
  ): Promise<{ id: string; name: string; hireDate: string }> {
    const [employee] = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
        hireDate: schema.employees.hireDate,
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
      throw new VacationInvalidEmployeeError(employeeId);
    }

    return employee;
  }

  private static validateDates(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new VacationInvalidDateRangeError(startDate, endDate);
    }
  }

  private static validateDays(
    startDate: string,
    endDate: string,
    daysEntitled: number,
    daysUsed: number
  ): void {
    const expected = calculateDaysBetween(startDate, endDate);
    if (daysEntitled !== expected) {
      throw new VacationInvalidDaysError(
        `Dias (${daysEntitled}) deve corresponder ao intervalo de datas (${expected})`
      );
    }
    if (daysUsed > daysEntitled) {
      throw new VacationInvalidDaysError(
        `Dias utilizados (${daysUsed}) não pode exceder dias (${daysEntitled})`
      );
    }
  }

  private static validateDatesNotBeforeHire(
    hireDate: string,
    dates: { startDate: string; endDate: string }
  ): void {
    const fields: [string, string][] = [
      ["startDate", dates.startDate],
      ["endDate", dates.endDate],
    ];

    for (const [field, value] of fields) {
      if (value < hireDate) {
        throw new VacationDateBeforeHireError(field, value, hireDate);
      }
    }
  }

  private static validateStartDateNotBeforeConcessive(
    startDate: string,
    cycle: { concessivePeriodStart: string }
  ): void {
    if (startDate < cycle.concessivePeriodStart) {
      throw new VacationStartDateBeforeConcessiveError({
        startDate,
        concessivePeriodStart: cycle.concessivePeriodStart,
      });
    }
  }

  private static async resolveCycleForEmployee(
    employeeId: string,
    organizationId: string,
    hireDate: string
  ): Promise<CycleWithBalance> {
    const rows = await db
      .select({
        acquisitionPeriodStart: sql<string>`${schema.vacations.acquisitionPeriodStart}`,
        daysEntitled: schema.vacations.daysEntitled,
      })
      .from(schema.vacations)
      .where(
        and(
          eq(schema.vacations.organizationId, organizationId),
          eq(schema.vacations.employeeId, employeeId),
          sql`${schema.vacations.status} != 'canceled'`,
          isNull(schema.vacations.deletedAt),
          sql`${schema.vacations.acquisitionPeriodStart} IS NOT NULL`
        )
      );

    const vacationsInCycles = rows.map((row) => ({
      acquisitionPeriodStart: row.acquisitionPeriodStart,
      daysEntitled: row.daysEntitled,
    }));

    const periods = resolveNextCycle({ hireDate, vacationsInCycles });

    const daysUsed = vacationsInCycles
      .filter(
        (row) => row.acquisitionPeriodStart === periods.acquisitionPeriodStart
      )
      .reduce((sum, row) => sum + row.daysEntitled, 0);
    const daysRemaining = MAX_VACATION_DAYS_PER_AQUISITIVO - daysUsed;

    return { ...periods, daysUsed, daysRemaining };
  }

  static async getNextCycle(
    employeeId: string,
    organizationId: string
  ): Promise<CycleWithBalance> {
    const employee = await VacationService.getEmployeeReference(
      employeeId,
      organizationId
    );

    await ensureEmployeeNotTerminated(employeeId, organizationId);

    return VacationService.resolveCycleForEmployee(
      employeeId,
      organizationId,
      employee.hireDate
    );
  }

  private static async syncEmployeeStatus(
    employeeId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    const [employeeBefore] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

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
      .set({ status: employeeStatus, updatedBy: userId })
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    if (employeeBefore && employeeBefore.status !== employeeStatus) {
      await AuditService.log({
        action: "update",
        resource: "employee",
        resourceId: employeeId,
        userId,
        organizationId,
        changes: buildAuditChanges(
          { status: employeeBefore.status },
          { status: employeeStatus }
        ),
      });
    }
  }

  private static async ensureNoOverlap(params: {
    organizationId: string;
    employeeId: string;
    startDate: string;
    endDate: string;
    excludeId?: string;
  }): Promise<void> {
    const { organizationId, employeeId, startDate, endDate, excludeId } =
      params;

    const [existing] = await db
      .select({ id: schema.vacations.id })
      .from(schema.vacations)
      .where(
        and(
          eq(schema.vacations.organizationId, organizationId),
          eq(schema.vacations.employeeId, employeeId),
          sql`${schema.vacations.startDate} <= ${endDate}`,
          sql`${schema.vacations.endDate} >= ${startDate}`,
          sql`${schema.vacations.status} != 'canceled'`,
          isNull(schema.vacations.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new VacationOverlapError(employeeId, startDate, endDate);
    }
  }

  static async create(input: CreateVacationInput): Promise<VacationData> {
    const { organizationId, userId, ...data } = input;

    const employee = await VacationService.getEmployeeReference(
      data.employeeId,
      organizationId
    );

    await ensureEmployeeNotTerminated(data.employeeId, organizationId);

    VacationService.validateDates(data.startDate, data.endDate);

    const activeCycle = await VacationService.resolveCycleForEmployee(
      data.employeeId,
      organizationId,
      employee.hireDate
    );

    VacationService.validateStartDateNotBeforeConcessive(
      data.startDate,
      activeCycle
    );

    VacationService.validateDays(
      data.startDate,
      data.endDate,
      data.daysEntitled,
      data.daysUsed
    );

    await VacationService.ensureAquisitivoLimit({
      employeeId: data.employeeId,
      organizationId,
      acquisitionPeriodStart: activeCycle.acquisitionPeriodStart,
      acquisitionPeriodEnd: activeCycle.acquisitionPeriodEnd,
      requestedDays: data.daysEntitled,
    });

    await VacationService.ensureNoOverlap({
      organizationId,
      employeeId: data.employeeId,
      startDate: data.startDate,
      endDate: data.endDate,
    });

    const vacationId = `vacation-${crypto.randomUUID()}`;

    const [vacation] = await db
      .insert(schema.vacations)
      .values({
        id: vacationId,
        organizationId,
        employeeId: data.employeeId,
        startDate: data.startDate,
        endDate: data.endDate,
        acquisitionPeriodStart: activeCycle.acquisitionPeriodStart,
        acquisitionPeriodEnd: activeCycle.acquisitionPeriodEnd,
        concessivePeriodStart: activeCycle.concessivePeriodStart,
        concessivePeriodEnd: activeCycle.concessivePeriodEnd,
        daysEntitled: data.daysEntitled,
        daysUsed: data.daysUsed,
        status: data.status,
        notes: data.notes,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "vacation",
      resourceId: vacation.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, vacation, {
        ignoredFields: VACATION_IGNORED_FIELDS,
      }),
    });

    await VacationService.syncEmployeeStatus(
      data.employeeId,
      organizationId,
      userId
    );

    return {
      id: vacationId,
      organizationId,
      employee,
      startDate: data.startDate,
      endDate: data.endDate,
      acquisitionPeriodStart: activeCycle.acquisitionPeriodStart,
      acquisitionPeriodEnd: activeCycle.acquisitionPeriodEnd,
      concessivePeriodStart: activeCycle.concessivePeriodStart,
      concessivePeriodEnd: activeCycle.concessivePeriodEnd,
      daysEntitled: data.daysEntitled,
      daysUsed: data.daysUsed,
      status: data.status,
      notes: data.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as VacationData;
  }

  static async findAll(organizationId: string): Promise<VacationData[]> {
    const results = await db
      .select(SELECT_FIELDS)
      .from(schema.vacations)
      .innerJoin(
        schema.employees,
        eq(schema.vacations.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.vacations.organizationId, organizationId),
          isNull(schema.vacations.deletedAt)
        )
      )
      .orderBy(schema.vacations.startDate);

    return results as VacationData[];
  }

  static async findByEmployee(
    organizationId: string,
    employeeId: string
  ): Promise<VacationData[]> {
    const results = await db
      .select(SELECT_FIELDS)
      .from(schema.vacations)
      .innerJoin(
        schema.employees,
        eq(schema.vacations.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.vacations.organizationId, organizationId),
          eq(schema.vacations.employeeId, employeeId),
          isNull(schema.vacations.deletedAt)
        )
      )
      .orderBy(schema.vacations.startDate);

    return results as VacationData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<VacationData> {
    const vacation = await VacationService.findById(id, organizationId);
    if (!vacation) {
      throw new VacationNotFoundError(id);
    }
    return vacation;
  }

  private static resolveField<T>(incoming: T | undefined, existing: T): T {
    return incoming !== undefined ? incoming : existing;
  }

  private static mergeWithExisting(
    data: Omit<UpdateVacationInput, "userId">,
    existing: VacationData
  ) {
    return {
      startDate: VacationService.resolveField(
        data.startDate,
        existing.startDate
      ),
      endDate: VacationService.resolveField(data.endDate, existing.endDate),
      daysEntitled: VacationService.resolveField(
        data.daysEntitled,
        existing.daysEntitled
      ),
      daysUsed: VacationService.resolveField(data.daysUsed, existing.daysUsed),
    };
  }

  private static async validateUpdateDates(
    data: Omit<UpdateVacationInput, "userId">,
    merged: ReturnType<typeof VacationService.mergeWithExisting>,
    existing: VacationData,
    organizationId: string
  ): Promise<void> {
    if (data.startDate !== undefined || data.endDate !== undefined) {
      VacationService.validateDates(merged.startDate, merged.endDate);
    }

    const hasDateChange =
      data.startDate !== undefined || data.endDate !== undefined;

    if (hasDateChange) {
      const employee = await VacationService.getEmployeeReference(
        existing.employee.id,
        organizationId
      );
      VacationService.validateDatesNotBeforeHire(employee.hireDate, merged);
    }
  }

  private static async validateUpdate(
    data: Omit<UpdateVacationInput, "userId">,
    existing: VacationData,
    organizationId: string,
    id: string
  ): Promise<void> {
    const merged = VacationService.mergeWithExisting(data, existing);

    await VacationService.validateUpdateDates(
      data,
      merged,
      existing,
      organizationId
    );

    if (
      data.startDate !== undefined ||
      data.endDate !== undefined ||
      data.daysEntitled !== undefined ||
      data.daysUsed !== undefined
    ) {
      VacationService.validateDays(
        merged.startDate,
        merged.endDate,
        merged.daysEntitled,
        merged.daysUsed
      );
    }

    if (data.daysEntitled !== undefined) {
      await VacationService.ensureAquisitivoLimit({
        employeeId: existing.employee.id,
        organizationId,
        acquisitionPeriodStart: existing.acquisitionPeriodStart,
        acquisitionPeriodEnd: existing.acquisitionPeriodEnd,
        requestedDays: merged.daysEntitled,
        excludeId: id,
      });
    }

    if (data.startDate !== undefined || data.endDate !== undefined) {
      await VacationService.ensureNoOverlap({
        organizationId,
        employeeId: existing.employee.id,
        startDate: merged.startDate,
        endDate: merged.endDate,
        excludeId: id,
      });
    }
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateVacationInput
  ): Promise<VacationData> {
    const { userId, ...data } = input;

    const existing = await VacationService.findById(id, organizationId);
    if (!existing) {
      throw new VacationNotFoundError(id);
    }

    await VacationService.validateUpdate(data, existing, organizationId, id);

    const [updated] = await db
      .update(schema.vacations)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.vacations.id, id),
          eq(schema.vacations.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "vacation",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        ignoredFields: VACATION_IGNORED_FIELDS,
      }),
    });

    if (data.status !== undefined) {
      await VacationService.syncEmployeeStatus(
        existing.employee.id,
        organizationId,
        userId
      );
    }

    return VacationService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedVacationData> {
    const existing = await VacationService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new VacationNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new VacationAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.vacations)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.vacations.id, id),
          eq(schema.vacations.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "vacation",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        {
          ignoredFields: VACATION_IGNORED_FIELDS,
        }
      ),
    });

    await VacationService.syncEmployeeStatus(
      existing.employee.id,
      organizationId,
      userId
    );

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
    } as DeletedVacationData;
  }
}
