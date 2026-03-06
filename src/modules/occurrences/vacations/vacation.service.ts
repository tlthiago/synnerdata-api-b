import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { ensureEmployeeNotTerminated } from "@/lib/helpers/employee-status";
import {
  VacationAlreadyDeletedError,
  VacationInvalidDateRangeError,
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
        daysUsed: schema.vacations.daysUsed,
        acquisitionPeriodId: schema.vacations.acquisitionPeriodId,
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
        daysUsed: schema.vacations.daysUsed,
        acquisitionPeriodId: schema.vacations.acquisitionPeriodId,
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

    // Validate acquisition period
    const { AcquisitionPeriodService } = await import(
      "./acquisition-periods/acquisition-period.service"
    );

    const period = await AcquisitionPeriodService.findByIdOrThrow(
      data.acquisitionPeriodId,
      organizationId
    );

    // Period must belong to same employee
    if (period.employee.id !== data.employeeId) {
      throw new VacationInvalidEmployeeError(data.employeeId);
    }

    // Period must be available
    if (period.status !== "available") {
      const { AcquisitionPeriodNotAvailableError } = await import(
        "./acquisition-periods/errors"
      );
      throw new AcquisitionPeriodNotAvailableError(
        data.acquisitionPeriodId,
        period.status
      );
    }

    // daysUsed cannot exceed remaining days in period
    if (data.daysUsed > period.daysRemaining) {
      const { AcquisitionPeriodInsufficientDaysError } = await import(
        "./acquisition-periods/errors"
      );
      throw new AcquisitionPeriodInsufficientDaysError(
        data.acquisitionPeriodId,
        data.daysUsed,
        period.daysRemaining
      );
    }

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
        daysUsed: data.daysUsed,
        acquisitionPeriodId: data.acquisitionPeriodId,
        status: data.status,
        notes: data.notes,
        createdBy: userId,
      })
      .returning();

    // Update days used on acquisition period
    await db
      .update(schema.vacationAcquisitionPeriods)
      .set({
        daysUsed: sql`${schema.vacationAcquisitionPeriods.daysUsed} + ${data.daysUsed}`,
        status: sql`CASE WHEN ${schema.vacationAcquisitionPeriods.daysUsed} + ${data.daysUsed} >= ${schema.vacationAcquisitionPeriods.daysEntitled} THEN 'used'::acquisition_period_status ELSE ${schema.vacationAcquisitionPeriods.status} END`,
      })
      .where(
        eq(schema.vacationAcquisitionPeriods.id, data.acquisitionPeriodId)
      );

    return {
      id: vacation.id,
      organizationId: vacation.organizationId,
      employee,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      daysUsed: vacation.daysUsed,
      acquisitionPeriodId: vacation.acquisitionPeriodId,
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
        daysUsed: schema.vacations.daysUsed,
        acquisitionPeriodId: schema.vacations.acquisitionPeriodId,
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

  static async findByEmployee(
    organizationId: string,
    employeeId: string
  ): Promise<VacationData[]> {
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
        daysUsed: schema.vacations.daysUsed,
        acquisitionPeriodId: schema.vacations.acquisitionPeriodId,
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

    if (data.startDate || data.endDate) {
      const newStartDate = data.startDate ?? existing.startDate;
      const newEndDate = data.endDate ?? existing.endDate;
      VacationService.validateDates(newStartDate, newEndDate);
    }

    if (data.startDate !== undefined || data.endDate !== undefined) {
      const finalStartDate = data.startDate ?? existing.startDate;
      const finalEndDate = data.endDate ?? existing.endDate;

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

    // Decrement days used on acquisition period
    const vacationDaysUsed = existing.daysUsed;
    if (vacationDaysUsed > 0) {
      await db
        .update(schema.vacationAcquisitionPeriods)
        .set({
          daysUsed: sql`GREATEST(${schema.vacationAcquisitionPeriods.daysUsed} - ${vacationDaysUsed}, 0)`,
          status: sql`CASE WHEN ${schema.vacationAcquisitionPeriods.status}::text = 'used' THEN 'available'::acquisition_period_status ELSE ${schema.vacationAcquisitionPeriods.status} END`,
        })
        .where(
          eq(schema.vacationAcquisitionPeriods.id, existing.acquisitionPeriodId)
        );
    }

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedVacationData;
  }
}
