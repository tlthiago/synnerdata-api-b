import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  VacationAlreadyDeletedError,
  VacationInvalidDateRangeError,
  VacationInvalidDaysError,
  VacationInvalidEmployeeError,
  VacationNotFoundError,
} from "./errors";
import type {
  CreateVacationInput,
  DeletedVacationData,
  UpdateVacationInput,
  VacationData,
} from "./vacation.model";

export abstract class VacationService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<VacationData | null> {
    const [result] = await db
      .select({
        id: schema.vacations.id,
        organizationId: schema.vacations.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.vacations.startDate,
        endDate: schema.vacations.endDate,
        daysTotal: schema.vacations.daysTotal,
        daysUsed: schema.vacations.daysUsed,
        acquisitionPeriodStart: schema.vacations.acquisitionPeriodStart,
        acquisitionPeriodEnd: schema.vacations.acquisitionPeriodEnd,
        status: schema.vacations.status,
        notes: schema.vacations.notes,
        createdAt: schema.vacations.createdAt,
        updatedAt: schema.vacations.updatedAt,
      })
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
        id: schema.vacations.id,
        organizationId: schema.vacations.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.vacations.startDate,
        endDate: schema.vacations.endDate,
        daysTotal: schema.vacations.daysTotal,
        daysUsed: schema.vacations.daysUsed,
        acquisitionPeriodStart: schema.vacations.acquisitionPeriodStart,
        acquisitionPeriodEnd: schema.vacations.acquisitionPeriodEnd,
        status: schema.vacations.status,
        notes: schema.vacations.notes,
        createdAt: schema.vacations.createdAt,
        updatedAt: schema.vacations.updatedAt,
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

  private static validateDays(daysUsed: number, daysTotal: number): void {
    if (daysTotal <= 0) {
      throw new VacationInvalidDaysError("Total days must be positive");
    }

    if (daysUsed < 0) {
      throw new VacationInvalidDaysError("Days used cannot be negative");
    }

    if (daysUsed > daysTotal) {
      throw new VacationInvalidDaysError("Days used cannot exceed total days");
    }
  }

  static async create(input: CreateVacationInput): Promise<VacationData> {
    const { organizationId, userId, ...data } = input;

    const employee = await VacationService.getEmployeeReference(
      data.employeeId,
      organizationId
    );

    VacationService.validateDates(data.startDate, data.endDate);
    VacationService.validateDays(data.daysUsed, data.daysTotal);

    const vacationId = `vacation-${crypto.randomUUID()}`;

    const [vacation] = await db
      .insert(schema.vacations)
      .values({
        id: vacationId,
        organizationId,
        employeeId: data.employeeId,
        startDate: data.startDate,
        endDate: data.endDate,
        daysTotal: data.daysTotal,
        daysUsed: data.daysUsed,
        acquisitionPeriodStart: data.acquisitionPeriodStart,
        acquisitionPeriodEnd: data.acquisitionPeriodEnd,
        status: data.status,
        notes: data.notes,
        createdBy: userId,
      })
      .returning();

    return {
      id: vacation.id,
      organizationId: vacation.organizationId,
      employee,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      daysTotal: vacation.daysTotal,
      daysUsed: vacation.daysUsed,
      acquisitionPeriodStart: vacation.acquisitionPeriodStart,
      acquisitionPeriodEnd: vacation.acquisitionPeriodEnd,
      status: vacation.status,
      notes: vacation.notes,
      createdAt: vacation.createdAt,
      updatedAt: vacation.updatedAt,
    } as VacationData;
  }

  static async findAll(organizationId: string): Promise<VacationData[]> {
    const results = await db
      .select({
        id: schema.vacations.id,
        organizationId: schema.vacations.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.vacations.startDate,
        endDate: schema.vacations.endDate,
        daysTotal: schema.vacations.daysTotal,
        daysUsed: schema.vacations.daysUsed,
        acquisitionPeriodStart: schema.vacations.acquisitionPeriodStart,
        acquisitionPeriodEnd: schema.vacations.acquisitionPeriodEnd,
        status: schema.vacations.status,
        notes: schema.vacations.notes,
        createdAt: schema.vacations.createdAt,
        updatedAt: schema.vacations.updatedAt,
      })
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

    if (data.startDate || data.endDate) {
      const newStartDate = data.startDate ?? existing.startDate;
      const newEndDate = data.endDate ?? existing.endDate;
      VacationService.validateDates(newStartDate, newEndDate);
    }

    if (data.daysUsed !== undefined || data.daysTotal !== undefined) {
      const newDaysUsed = data.daysUsed ?? existing.daysUsed;
      const newDaysTotal = data.daysTotal ?? existing.daysTotal;
      VacationService.validateDays(newDaysUsed, newDaysTotal);
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
