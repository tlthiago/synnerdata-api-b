import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
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

    await db
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
      );

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

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedTerminationData;
  }
}
