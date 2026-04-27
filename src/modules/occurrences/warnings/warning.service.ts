import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import {
  buildAuditChanges,
  IGNORED_AUDIT_FIELDS,
} from "@/modules/audit/pii-redaction";
import { ensureEmployeeActive } from "@/modules/employees/status";
import {
  WarningAcknowledgedBeforeDateError,
  WarningAlreadyDeletedError,
  WarningDuplicateError,
  WarningInvalidEmployeeError,
  WarningNotFoundError,
} from "./errors";
import type {
  CreateWarningInput,
  DeletedWarningData,
  UpdateWarningInput,
  WarningData,
} from "./warning.model";

const WARNING_IGNORED_FIELDS = new Set([
  ...IGNORED_AUDIT_FIELDS,
  "employee",
  "employeeId",
]);

export abstract class WarningService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<WarningData | null> {
    const [result] = await db
      .select({
        id: schema.warnings.id,
        organizationId: schema.warnings.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        date: schema.warnings.date,
        type: schema.warnings.type,
        reason: schema.warnings.reason,
        description: schema.warnings.description,
        witnessName: schema.warnings.witnessName,
        acknowledged: schema.warnings.acknowledged,
        acknowledgedAt: schema.warnings.acknowledgedAt,
        notes: schema.warnings.notes,
        createdAt: schema.warnings.createdAt,
        updatedAt: schema.warnings.updatedAt,
      })
      .from(schema.warnings)
      .innerJoin(
        schema.employees,
        eq(schema.warnings.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.warnings.id, id),
          eq(schema.warnings.organizationId, organizationId),
          isNull(schema.warnings.deletedAt)
        )
      )
      .limit(1);

    return (result as WarningData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<
    (WarningData & { deletedAt: Date | null; deletedBy: string | null }) | null
  > {
    const [result] = await db
      .select({
        id: schema.warnings.id,
        organizationId: schema.warnings.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        date: schema.warnings.date,
        type: schema.warnings.type,
        reason: schema.warnings.reason,
        description: schema.warnings.description,
        witnessName: schema.warnings.witnessName,
        acknowledged: schema.warnings.acknowledged,
        acknowledgedAt: schema.warnings.acknowledgedAt,
        notes: schema.warnings.notes,
        createdAt: schema.warnings.createdAt,
        updatedAt: schema.warnings.updatedAt,
        deletedAt: schema.warnings.deletedAt,
        deletedBy: schema.warnings.deletedBy,
      })
      .from(schema.warnings)
      .innerJoin(
        schema.employees,
        eq(schema.warnings.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.warnings.id, id),
          eq(schema.warnings.organizationId, organizationId)
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
      throw new WarningInvalidEmployeeError(employeeId);
    }

    return employee;
  }

  private static validateAcknowledgedAtNotBeforeDate(
    acknowledgedAt: string | Date | null | undefined,
    date: string
  ): void {
    if (!acknowledgedAt) {
      return;
    }
    if (new Date(acknowledgedAt) < new Date(date)) {
      throw new WarningAcknowledgedBeforeDateError();
    }
  }

  private static buildUpdateData(
    data: Omit<UpdateWarningInput, "userId">,
    userId: string
  ): Record<string, unknown> {
    const updateData: Record<string, unknown> = { updatedBy: userId };

    if (data.date !== undefined) {
      updateData.date = data.date;
    }
    if (data.type !== undefined) {
      updateData.type = data.type;
    }
    if (data.reason !== undefined) {
      updateData.reason = data.reason;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.witnessName !== undefined) {
      updateData.witnessName = data.witnessName;
    }
    if (data.acknowledged !== undefined) {
      updateData.acknowledged = data.acknowledged;
    }
    if (data.acknowledgedAt !== undefined) {
      updateData.acknowledgedAt = data.acknowledgedAt
        ? new Date(data.acknowledgedAt)
        : null;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    return updateData;
  }

  private static async ensureNoDuplicate(params: {
    organizationId: string;
    employeeId: string;
    date: string;
    type: "verbal" | "written" | "suspension";
    excludeId?: string;
  }): Promise<void> {
    const { organizationId, employeeId, date, type, excludeId } = params;

    const [existing] = await db
      .select({ id: schema.warnings.id })
      .from(schema.warnings)
      .where(
        and(
          eq(schema.warnings.organizationId, organizationId),
          eq(schema.warnings.employeeId, employeeId),
          eq(schema.warnings.date, date),
          eq(schema.warnings.type, type),
          isNull(schema.warnings.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new WarningDuplicateError(employeeId, date, type);
    }
  }

  static async create(input: CreateWarningInput): Promise<WarningData> {
    const { organizationId, userId, ...data } = input;

    const employee = await WarningService.getEmployeeReference(
      data.employeeId,
      organizationId
    );

    await ensureEmployeeActive(data.employeeId, organizationId);

    await WarningService.ensureNoDuplicate({
      organizationId,
      employeeId: data.employeeId,
      date: data.date,
      type: data.type,
    });

    const warningId = `warning-${crypto.randomUUID()}`;

    const [warning] = await db
      .insert(schema.warnings)
      .values({
        id: warningId,
        organizationId,
        employeeId: data.employeeId,
        date: data.date,
        type: data.type,
        reason: data.reason,
        description: data.description,
        witnessName: data.witnessName,
        acknowledged: data.acknowledged ?? false,
        acknowledgedAt: data.acknowledgedAt
          ? new Date(data.acknowledgedAt)
          : null,
        notes: data.notes,
        createdBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "warning",
      resourceId: warning.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, warning, {
        ignoredFields: WARNING_IGNORED_FIELDS,
      }),
    });

    return {
      id: warning.id,
      organizationId: warning.organizationId,
      employee,
      date: warning.date,
      type: warning.type,
      reason: warning.reason,
      description: warning.description,
      witnessName: warning.witnessName,
      acknowledged: warning.acknowledged,
      acknowledgedAt: warning.acknowledgedAt,
      notes: warning.notes,
      createdAt: warning.createdAt,
      updatedAt: warning.updatedAt,
    } as WarningData;
  }

  static async findAll(organizationId: string): Promise<WarningData[]> {
    const results = await db
      .select({
        id: schema.warnings.id,
        organizationId: schema.warnings.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        date: schema.warnings.date,
        type: schema.warnings.type,
        reason: schema.warnings.reason,
        description: schema.warnings.description,
        witnessName: schema.warnings.witnessName,
        acknowledged: schema.warnings.acknowledged,
        acknowledgedAt: schema.warnings.acknowledgedAt,
        notes: schema.warnings.notes,
        createdAt: schema.warnings.createdAt,
        updatedAt: schema.warnings.updatedAt,
      })
      .from(schema.warnings)
      .innerJoin(
        schema.employees,
        eq(schema.warnings.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.warnings.organizationId, organizationId),
          isNull(schema.warnings.deletedAt)
        )
      )
      .orderBy(schema.warnings.date);

    return results as WarningData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<WarningData> {
    const warning = await WarningService.findById(id, organizationId);
    if (!warning) {
      throw new WarningNotFoundError(id);
    }
    return warning;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateWarningInput
  ): Promise<WarningData> {
    const { userId, ...data } = input;

    const existing = await WarningService.findById(id, organizationId);
    if (!existing) {
      throw new WarningNotFoundError(id);
    }

    const effectiveDate = data.date ?? existing.date;
    const effectiveAcknowledgedAt =
      data.acknowledgedAt !== undefined
        ? data.acknowledgedAt
        : existing.acknowledgedAt;
    WarningService.validateAcknowledgedAtNotBeforeDate(
      effectiveAcknowledgedAt,
      effectiveDate
    );

    if (data.date !== undefined || data.type !== undefined) {
      const effectiveType = data.type ?? existing.type;

      await WarningService.ensureNoDuplicate({
        organizationId,
        employeeId: existing.employee.id,
        date: effectiveDate,
        type: effectiveType,
        excludeId: id,
      });
    }

    if (data.employeeId !== undefined) {
      await WarningService.getEmployeeReference(
        data.employeeId,
        organizationId
      );
    }

    const updateData = WarningService.buildUpdateData(data, userId);
    if (data.employeeId !== undefined) {
      updateData.employeeId = data.employeeId;
    }

    const [updated] = await db
      .update(schema.warnings)
      .set(updateData)
      .where(
        and(
          eq(schema.warnings.id, id),
          eq(schema.warnings.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "warning",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        ignoredFields: WARNING_IGNORED_FIELDS,
      }),
    });

    return WarningService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedWarningData> {
    const existing = await WarningService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new WarningNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new WarningAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.warnings)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.warnings.id, id),
          eq(schema.warnings.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "warning",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        { ignoredFields: WARNING_IGNORED_FIELDS }
      ),
    });

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedWarningData;
  }
}
