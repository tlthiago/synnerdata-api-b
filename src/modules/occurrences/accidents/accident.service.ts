import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import {
  buildAuditChanges,
  IGNORED_AUDIT_FIELDS,
} from "@/modules/audit/pii-redaction";
import { ensureEmployeeActive } from "@/modules/employees/status";
import type {
  AccidentData,
  CreateAccidentInput,
  DeletedAccidentData,
  UpdateAccidentInput,
} from "./accident.model";
import {
  AccidentAlreadyDeletedError,
  AccidentCatAlreadyExistsError,
  AccidentInvalidEmployeeError,
  AccidentNotFoundError,
} from "./errors";

const ACCIDENT_IGNORED_FIELDS = new Set([
  ...IGNORED_AUDIT_FIELDS,
  "employee",
  "employeeId",
]);

export abstract class AccidentService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<AccidentData | null> {
    const [result] = await db
      .select({
        id: schema.accidents.id,
        organizationId: schema.accidents.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        date: schema.accidents.date,
        description: schema.accidents.description,
        nature: schema.accidents.nature,
        cat: schema.accidents.cat,
        measuresTaken: schema.accidents.measuresTaken,
        notes: schema.accidents.notes,
        createdAt: schema.accidents.createdAt,
        updatedAt: schema.accidents.updatedAt,
      })
      .from(schema.accidents)
      .innerJoin(
        schema.employees,
        eq(schema.accidents.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.accidents.id, id),
          eq(schema.accidents.organizationId, organizationId),
          isNull(schema.accidents.deletedAt)
        )
      )
      .limit(1);

    return (result as AccidentData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(AccidentData & { deletedAt: Date | null }) | null> {
    const [result] = await db
      .select({
        id: schema.accidents.id,
        organizationId: schema.accidents.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        date: schema.accidents.date,
        description: schema.accidents.description,
        nature: schema.accidents.nature,
        cat: schema.accidents.cat,
        measuresTaken: schema.accidents.measuresTaken,
        notes: schema.accidents.notes,
        createdAt: schema.accidents.createdAt,
        updatedAt: schema.accidents.updatedAt,
        deletedAt: schema.accidents.deletedAt,
      })
      .from(schema.accidents)
      .innerJoin(
        schema.employees,
        eq(schema.accidents.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.accidents.id, id),
          eq(schema.accidents.organizationId, organizationId)
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
      throw new AccidentInvalidEmployeeError(employeeId);
    }

    return employee;
  }

  private static async ensureCatNotExists(
    organizationId: string,
    cat: string | null | undefined,
    excludeId?: string
  ): Promise<void> {
    if (!cat) {
      return;
    }

    const [existing] = await db
      .select({ id: schema.accidents.id })
      .from(schema.accidents)
      .where(
        and(
          eq(schema.accidents.organizationId, organizationId),
          eq(schema.accidents.cat, cat),
          isNull(schema.accidents.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new AccidentCatAlreadyExistsError(cat);
    }
  }

  static async create(input: CreateAccidentInput): Promise<AccidentData> {
    const { organizationId, userId, ...data } = input;

    const employee = await AccidentService.getEmployeeReference(
      data.employeeId,
      organizationId
    );

    await ensureEmployeeActive(data.employeeId, organizationId);
    await AccidentService.ensureCatNotExists(organizationId, data.cat);

    const accidentId = `accident-${crypto.randomUUID()}`;

    const [accident] = await db
      .insert(schema.accidents)
      .values({
        id: accidentId,
        organizationId,
        employeeId: data.employeeId,
        date: data.date,
        description: data.description,
        nature: data.nature,
        cat: data.cat,
        measuresTaken: data.measuresTaken,
        notes: data.notes,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "accident",
      resourceId: accident.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, accident, {
        ignoredFields: ACCIDENT_IGNORED_FIELDS,
      }),
    });

    return {
      id: accident.id,
      organizationId: accident.organizationId,
      employee,
      date: accident.date,
      description: accident.description,
      nature: accident.nature,
      cat: accident.cat,
      measuresTaken: accident.measuresTaken,
      notes: accident.notes,
      createdAt: accident.createdAt,
      updatedAt: accident.updatedAt,
    } as AccidentData;
  }

  static async findAll(organizationId: string): Promise<AccidentData[]> {
    const results = await db
      .select({
        id: schema.accidents.id,
        organizationId: schema.accidents.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        date: schema.accidents.date,
        description: schema.accidents.description,
        nature: schema.accidents.nature,
        cat: schema.accidents.cat,
        measuresTaken: schema.accidents.measuresTaken,
        notes: schema.accidents.notes,
        createdAt: schema.accidents.createdAt,
        updatedAt: schema.accidents.updatedAt,
      })
      .from(schema.accidents)
      .innerJoin(
        schema.employees,
        eq(schema.accidents.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.accidents.organizationId, organizationId),
          isNull(schema.accidents.deletedAt)
        )
      )
      .orderBy(schema.accidents.date);

    return results as AccidentData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<AccidentData> {
    const accident = await AccidentService.findById(id, organizationId);
    if (!accident) {
      throw new AccidentNotFoundError(id);
    }
    return accident;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateAccidentInput
  ): Promise<AccidentData> {
    const { userId, ...data } = input;

    const existing = await AccidentService.findById(id, organizationId);
    if (!existing) {
      throw new AccidentNotFoundError(id);
    }

    if (data.cat !== undefined && data.cat !== existing.cat) {
      await AccidentService.ensureCatNotExists(organizationId, data.cat, id);
    }

    const updateData: Record<string, unknown> = {
      updatedBy: userId,
    };

    if (data.date !== undefined) {
      updateData.date = data.date;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.nature !== undefined) {
      updateData.nature = data.nature;
    }
    if (data.cat !== undefined) {
      updateData.cat = data.cat;
    }
    if (data.measuresTaken !== undefined) {
      updateData.measuresTaken = data.measuresTaken;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    const [updated] = await db
      .update(schema.accidents)
      .set(updateData)
      .where(
        and(
          eq(schema.accidents.id, id),
          eq(schema.accidents.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "accident",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        ignoredFields: ACCIDENT_IGNORED_FIELDS,
      }),
    });

    return AccidentService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedAccidentData> {
    const existing = await AccidentService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new AccidentNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new AccidentAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.accidents)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.accidents.id, id),
          eq(schema.accidents.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "accident",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        { ignoredFields: ACCIDENT_IGNORED_FIELDS }
      ),
    });

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
    } as DeletedAccidentData;
  }
}
