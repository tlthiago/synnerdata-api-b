import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { ensureEmployeeNotTerminated } from "@/lib/helpers/employee-status";
import { calculateDaysBetween } from "@/lib/schemas/date-helpers";
import {
  VacationAlreadyDeletedError,
  VacationInvalidDateRangeError,
  VacationInvalidDaysError,
  VacationInvalidEmployeeError,
  VacationNotFoundError,
  VacationOverlapError,
} from "./errors";
import type {
  CreateVacationInput,
  DeletedVacationData,
  UpdateVacationInput,
  VacationData,
} from "./vacation.model";

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
  ): Promise<
    (VacationData & { deletedAt: Date | null; deletedBy: string | null }) | null
  > {
    const [result] = await db
      .select({
        ...SELECT_FIELDS,
        deletedAt: schema.vacations.deletedAt,
        deletedBy: schema.vacations.deletedBy,
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
    VacationService.validateDays(
      data.startDate,
      data.endDate,
      data.daysEntitled,
      data.daysUsed
    );

    await VacationService.ensureNoOverlap({
      organizationId,
      employeeId: data.employeeId,
      startDate: data.startDate,
      endDate: data.endDate,
    });

    const vacationId = `vacation-${crypto.randomUUID()}`;

    await db.insert(schema.vacations).values({
      id: vacationId,
      organizationId,
      employeeId: data.employeeId,
      startDate: data.startDate,
      endDate: data.endDate,
      acquisitionPeriodStart: data.acquisitionPeriodStart,
      acquisitionPeriodEnd: data.acquisitionPeriodEnd,
      concessivePeriodStart: data.concessivePeriodStart,
      concessivePeriodEnd: data.concessivePeriodEnd,
      daysEntitled: data.daysEntitled,
      daysUsed: data.daysUsed,
      status: data.status,
      notes: data.notes,
      createdBy: userId,
    });

    return {
      id: vacationId,
      organizationId,
      employee,
      startDate: data.startDate,
      endDate: data.endDate,
      acquisitionPeriodStart: data.acquisitionPeriodStart ?? null,
      acquisitionPeriodEnd: data.acquisitionPeriodEnd ?? null,
      concessivePeriodStart: data.concessivePeriodStart ?? null,
      concessivePeriodEnd: data.concessivePeriodEnd ?? null,
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

    const finalStartDate = data.startDate ?? existing.startDate;
    const finalEndDate = data.endDate ?? existing.endDate;
    const finalDaysEntitled = data.daysEntitled ?? existing.daysEntitled;
    const finalDaysUsed = data.daysUsed ?? existing.daysUsed;

    if (data.startDate || data.endDate) {
      VacationService.validateDates(finalStartDate, finalEndDate);
    }

    if (
      data.startDate !== undefined ||
      data.endDate !== undefined ||
      data.daysEntitled !== undefined ||
      data.daysUsed !== undefined
    ) {
      VacationService.validateDays(
        finalStartDate,
        finalEndDate,
        finalDaysEntitled,
        finalDaysUsed
      );
    }

    if (data.startDate !== undefined || data.endDate !== undefined) {
      await VacationService.ensureNoOverlap({
        organizationId,
        employeeId: existing.employee.id,
        startDate: finalStartDate,
        endDate: finalEndDate,
        excludeId: id,
      });
    }

    await db
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
      );

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
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.vacations.id, id),
          eq(schema.vacations.organizationId, organizationId)
        )
      )
      .returning();

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedVacationData;
  }
}
