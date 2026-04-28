import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import {
  buildAuditChanges,
  IGNORED_AUDIT_FIELDS,
} from "@/modules/audit/pii-redaction";
import { ensureEmployeeActive } from "@/modules/employees/status";
import type {
  AbsenceData,
  CreateAbsenceInput,
  DeletedAbsenceData,
  UpdateAbsenceInput,
} from "./absence.model";
import {
  AbsenceAlreadyDeletedError,
  AbsenceInvalidDateRangeError,
  AbsenceInvalidEmployeeError,
  AbsenceNotFoundError,
  AbsenceOverlapError,
} from "./errors";

const ABSENCE_IGNORED_FIELDS = new Set([
  ...IGNORED_AUDIT_FIELDS,
  "employee",
  "employeeId",
]);

export abstract class AbsenceService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<AbsenceData | null> {
    const [result] = await db
      .select({
        id: schema.absences.id,
        organizationId: schema.absences.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.absences.startDate,
        endDate: schema.absences.endDate,
        type: schema.absences.type,
        reason: schema.absences.reason,
        notes: schema.absences.notes,
        createdAt: schema.absences.createdAt,
        updatedAt: schema.absences.updatedAt,
      })
      .from(schema.absences)
      .innerJoin(
        schema.employees,
        eq(schema.absences.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.absences.id, id),
          eq(schema.absences.organizationId, organizationId),
          isNull(schema.absences.deletedAt)
        )
      )
      .limit(1);

    return (result as AbsenceData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<
    (AbsenceData & { deletedAt: Date | null; deletedBy: string | null }) | null
  > {
    const [result] = await db
      .select({
        id: schema.absences.id,
        organizationId: schema.absences.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.absences.startDate,
        endDate: schema.absences.endDate,
        type: schema.absences.type,
        reason: schema.absences.reason,
        notes: schema.absences.notes,
        createdAt: schema.absences.createdAt,
        updatedAt: schema.absences.updatedAt,
        deletedAt: schema.absences.deletedAt,
        deletedBy: schema.absences.deletedBy,
      })
      .from(schema.absences)
      .innerJoin(
        schema.employees,
        eq(schema.absences.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.absences.id, id),
          eq(schema.absences.organizationId, organizationId)
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
      throw new AbsenceInvalidEmployeeError(employeeId);
    }

    return employee;
  }

  private static async ensureNoOverlap(params: {
    organizationId: string;
    employeeId: string;
    startDate: string;
    endDate: string;
    type: string;
    excludeId?: string;
  }): Promise<void> {
    const { organizationId, employeeId, startDate, endDate, type, excludeId } =
      params;

    const [existing] = await db
      .select({ id: schema.absences.id })
      .from(schema.absences)
      .where(
        and(
          eq(schema.absences.organizationId, organizationId),
          eq(schema.absences.employeeId, employeeId),
          eq(schema.absences.type, type),
          sql`${schema.absences.startDate} <= ${endDate}`,
          sql`${schema.absences.endDate} >= ${startDate}`,
          isNull(schema.absences.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new AbsenceOverlapError(employeeId, startDate, endDate);
    }
  }

  static async create(input: CreateAbsenceInput): Promise<AbsenceData> {
    const {
      organizationId,
      userId,
      employeeId,
      startDate,
      endDate,
      type,
      reason,
      notes,
    } = input;

    if (new Date(startDate) > new Date(endDate)) {
      throw new AbsenceInvalidDateRangeError();
    }

    const employee = await AbsenceService.getEmployeeReference(
      employeeId,
      organizationId
    );

    await ensureEmployeeActive(employeeId, organizationId);

    await AbsenceService.ensureNoOverlap({
      organizationId,
      employeeId,
      startDate,
      endDate,
      type,
    });

    const absenceId = `absence-${crypto.randomUUID()}`;

    const [absence] = await db
      .insert(schema.absences)
      .values({
        id: absenceId,
        organizationId,
        employeeId,
        startDate,
        endDate,
        type,
        reason,
        notes,
        createdBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "absence",
      resourceId: absence.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, absence, {
        ignoredFields: ABSENCE_IGNORED_FIELDS,
      }),
    });

    return {
      id: absence.id,
      organizationId: absence.organizationId,
      employee,
      startDate: absence.startDate,
      endDate: absence.endDate,
      type: absence.type,
      reason: absence.reason,
      notes: absence.notes,
      createdAt: absence.createdAt,
      updatedAt: absence.updatedAt,
    } as AbsenceData;
  }

  static async findAll(organizationId: string): Promise<AbsenceData[]> {
    const results = await db
      .select({
        id: schema.absences.id,
        organizationId: schema.absences.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.absences.startDate,
        endDate: schema.absences.endDate,
        type: schema.absences.type,
        reason: schema.absences.reason,
        notes: schema.absences.notes,
        createdAt: schema.absences.createdAt,
        updatedAt: schema.absences.updatedAt,
      })
      .from(schema.absences)
      .innerJoin(
        schema.employees,
        eq(schema.absences.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.absences.organizationId, organizationId),
          isNull(schema.absences.deletedAt)
        )
      )
      .orderBy(schema.absences.startDate);

    return results as AbsenceData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<AbsenceData> {
    const absence = await AbsenceService.findById(id, organizationId);
    if (!absence) {
      throw new AbsenceNotFoundError(id);
    }
    return absence;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateAbsenceInput
  ): Promise<AbsenceData> {
    const { userId, startDate, endDate, ...data } = input;

    const existing = await AbsenceService.findById(id, organizationId);
    if (!existing) {
      throw new AbsenceNotFoundError(id);
    }

    const finalStartDate = startDate ?? existing.startDate;
    const finalEndDate = endDate ?? existing.endDate;
    const finalType = data.type ?? existing.type;

    if (new Date(finalStartDate) > new Date(finalEndDate)) {
      throw new AbsenceInvalidDateRangeError();
    }

    if (
      data.type !== undefined ||
      startDate !== undefined ||
      endDate !== undefined
    ) {
      await AbsenceService.ensureNoOverlap({
        organizationId,
        employeeId: existing.employee.id,
        startDate: finalStartDate,
        endDate: finalEndDate,
        type: finalType,
        excludeId: id,
      });
    }

    const [updated] = await db
      .update(schema.absences)
      .set({
        ...data,
        startDate: finalStartDate,
        endDate: finalEndDate,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.absences.id, id),
          eq(schema.absences.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "absence",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        ignoredFields: ABSENCE_IGNORED_FIELDS,
      }),
    });

    return AbsenceService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedAbsenceData> {
    const existing = await AbsenceService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new AbsenceNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new AbsenceAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.absences)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.absences.id, id),
          eq(schema.absences.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "absence",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        { ignoredFields: ABSENCE_IGNORED_FIELDS }
      ),
    });

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedAbsenceData;
  }
}
