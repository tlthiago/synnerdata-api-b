import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import {
  buildAuditChanges,
  IGNORED_AUDIT_FIELDS,
} from "@/modules/audit/pii-redaction";
import {
  TerminationAlreadyDeletedError,
  TerminationAlreadyExistsError,
  TerminationInvalidEmployeeError,
  TerminationNotFoundError,
} from "./errors";
import type {
  CreateTerminationInput,
  DeletedTerminationData,
  TerminationData,
  UpdateTerminationInput,
} from "./termination.model";

const TERMINATION_IGNORED_FIELDS = new Set([
  ...IGNORED_AUDIT_FIELDS,
  "employee",
  "employeeId",
]);

export abstract class TerminationService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<TerminationData | null> {
    const [result] = await db
      .select({
        id: schema.terminations.id,
        organizationId: schema.terminations.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        terminationDate: schema.terminations.terminationDate,
        type: schema.terminations.type,
        reason: schema.terminations.reason,
        noticePeriodDays: schema.terminations.noticePeriodDays,
        noticePeriodWorked: schema.terminations.noticePeriodWorked,
        lastWorkingDay: schema.terminations.lastWorkingDay,
        notes: schema.terminations.notes,
        status: schema.terminations.status,
        createdAt: schema.terminations.createdAt,
        updatedAt: schema.terminations.updatedAt,
      })
      .from(schema.terminations)
      .innerJoin(
        schema.employees,
        eq(schema.terminations.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.terminations.id, id),
          eq(schema.terminations.organizationId, organizationId),
          isNull(schema.terminations.deletedAt)
        )
      )
      .limit(1);

    return (result as TerminationData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<
    | (TerminationData & { deletedAt: Date | null; deletedBy: string | null })
    | null
  > {
    const [result] = await db
      .select({
        id: schema.terminations.id,
        organizationId: schema.terminations.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        terminationDate: schema.terminations.terminationDate,
        type: schema.terminations.type,
        reason: schema.terminations.reason,
        noticePeriodDays: schema.terminations.noticePeriodDays,
        noticePeriodWorked: schema.terminations.noticePeriodWorked,
        lastWorkingDay: schema.terminations.lastWorkingDay,
        notes: schema.terminations.notes,
        status: schema.terminations.status,
        createdAt: schema.terminations.createdAt,
        updatedAt: schema.terminations.updatedAt,
        deletedAt: schema.terminations.deletedAt,
        deletedBy: schema.terminations.deletedBy,
      })
      .from(schema.terminations)
      .innerJoin(
        schema.employees,
        eq(schema.terminations.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.terminations.id, id),
          eq(schema.terminations.organizationId, organizationId)
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
      throw new TerminationInvalidEmployeeError(employeeId);
    }

    return employee;
  }

  private static async ensureNoActiveTermination(
    organizationId: string,
    employeeId: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.terminations.id })
      .from(schema.terminations)
      .where(
        and(
          eq(schema.terminations.organizationId, organizationId),
          eq(schema.terminations.employeeId, employeeId),
          isNull(schema.terminations.deletedAt)
        )
      )
      .limit(1);

    if (existing) {
      throw new TerminationAlreadyExistsError(employeeId);
    }
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: wired in subsequent tasks
  private static async syncEmployeeStatusForTermination(
    employeeId: string,
    organizationId: string,
    userId: string,
    tx?: typeof db
  ): Promise<{ before: string | null; after: string }> {
    const executor = tx ?? db;

    const [activeTermination] = await executor
      .select({ status: schema.terminations.status })
      .from(schema.terminations)
      .where(
        and(
          eq(schema.terminations.employeeId, employeeId),
          eq(schema.terminations.organizationId, organizationId),
          isNull(schema.terminations.deletedAt)
        )
      )
      .limit(1);

    let nextStatus: "ACTIVE" | "TERMINATED" | "TERMINATION_SCHEDULED" =
      "ACTIVE";
    if (activeTermination?.status === "completed") {
      nextStatus = "TERMINATED";
    } else if (activeTermination?.status === "scheduled") {
      nextStatus = "TERMINATION_SCHEDULED";
    }

    const [employeeBefore] = await executor
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    if (employeeBefore?.status === nextStatus) {
      return { before: employeeBefore.status, after: nextStatus };
    }

    await executor
      .update(schema.employees)
      .set({ status: nextStatus, updatedBy: userId })
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    return { before: employeeBefore?.status ?? null, after: nextStatus };
  }

  static async create(input: CreateTerminationInput): Promise<TerminationData> {
    const { organizationId, userId, employeeId, ...data } = input;

    const employee = await TerminationService.getEmployeeReference(
      employeeId,
      organizationId
    );

    await TerminationService.ensureNoActiveTermination(
      organizationId,
      employeeId
    );

    const terminationId = `termination-${crypto.randomUUID()}`;

    const [termination] = await db
      .insert(schema.terminations)
      .values({
        id: terminationId,
        organizationId,
        employeeId,
        terminationDate: data.terminationDate,
        type: data.type,
        reason: data.reason ?? null,
        noticePeriodDays: data.noticePeriodDays ?? null,
        noticePeriodWorked: data.noticePeriodWorked,
        lastWorkingDay: data.lastWorkingDay,
        notes: data.notes ?? null,
        createdBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "termination",
      resourceId: termination.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, termination, {
        ignoredFields: TERMINATION_IGNORED_FIELDS,
      }),
    });

    const [employeeBefore] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    await db
      .update(schema.employees)
      .set({ status: "TERMINATED", updatedBy: userId })
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    await AuditService.log({
      action: "update",
      resource: "employee",
      resourceId: employeeId,
      userId,
      organizationId,
      changes: buildAuditChanges(
        { status: employeeBefore?.status ?? null },
        { status: "TERMINATED" }
      ),
    });

    return {
      id: termination.id,
      organizationId: termination.organizationId,
      employee,
      terminationDate: termination.terminationDate,
      type: termination.type,
      reason: termination.reason,
      noticePeriodDays: termination.noticePeriodDays,
      noticePeriodWorked: termination.noticePeriodWorked,
      lastWorkingDay: termination.lastWorkingDay,
      notes: termination.notes,
      createdAt: termination.createdAt,
      updatedAt: termination.updatedAt,
    } as TerminationData;
  }

  static async findAll(organizationId: string): Promise<TerminationData[]> {
    const results = await db
      .select({
        id: schema.terminations.id,
        organizationId: schema.terminations.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        terminationDate: schema.terminations.terminationDate,
        type: schema.terminations.type,
        reason: schema.terminations.reason,
        noticePeriodDays: schema.terminations.noticePeriodDays,
        noticePeriodWorked: schema.terminations.noticePeriodWorked,
        lastWorkingDay: schema.terminations.lastWorkingDay,
        notes: schema.terminations.notes,
        status: schema.terminations.status,
        createdAt: schema.terminations.createdAt,
        updatedAt: schema.terminations.updatedAt,
      })
      .from(schema.terminations)
      .innerJoin(
        schema.employees,
        eq(schema.terminations.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.terminations.organizationId, organizationId),
          isNull(schema.terminations.deletedAt)
        )
      )
      .orderBy(schema.terminations.terminationDate);

    return results as TerminationData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<TerminationData> {
    const termination = await TerminationService.findById(id, organizationId);
    if (!termination) {
      throw new TerminationNotFoundError(id);
    }
    return termination;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateTerminationInput
  ): Promise<TerminationData> {
    const { userId, ...data } = input;

    const existing = await TerminationService.findById(id, organizationId);
    if (!existing) {
      throw new TerminationNotFoundError(id);
    }

    const [updated] = await db
      .update(schema.terminations)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.terminations.id, id),
          eq(schema.terminations.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "termination",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        ignoredFields: TERMINATION_IGNORED_FIELDS,
      }),
    });

    return TerminationService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedTerminationData> {
    const existing = await TerminationService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new TerminationNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new TerminationAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.terminations)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.terminations.id, id),
          eq(schema.terminations.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "termination",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        { ignoredFields: TERMINATION_IGNORED_FIELDS }
      ),
    });

    const [employeeBefore] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, existing.employee.id),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    await db
      .update(schema.employees)
      .set({ status: "ACTIVE", updatedBy: userId })
      .where(
        and(
          eq(schema.employees.id, existing.employee.id),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    await AuditService.log({
      action: "update",
      resource: "employee",
      resourceId: existing.employee.id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        { status: employeeBefore?.status ?? null },
        { status: "ACTIVE" }
      ),
    });

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedTerminationData;
  }
}
