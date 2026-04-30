import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { auditUserAliases } from "@/lib/schemas/audit-users";
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges } from "@/modules/audit/pii-redaction";
import {
  JobPositionAlreadyDeletedError,
  JobPositionAlreadyExistsError,
  JobPositionNotFoundError,
} from "./errors";
import type {
  CreateJobPositionInput,
  DeletedJobPositionData,
  JobPositionData,
  UpdateJobPositionInput,
} from "./job-position.model";

export abstract class JobPositionService {
  private static async ensureNameNotExists(
    organizationId: string,
    name: string,
    excludeId?: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.jobPositions.id })
      .from(schema.jobPositions)
      .where(
        and(
          eq(schema.jobPositions.organizationId, organizationId),
          sql`lower(${schema.jobPositions.name}) = lower(${name})`,
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new JobPositionAlreadyExistsError(name);
    }
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<JobPositionData | null> {
    const { creator, updater } = auditUserAliases();

    const [jobPosition] = await db
      .select({
        id: schema.jobPositions.id,
        organizationId: schema.jobPositions.organizationId,
        name: schema.jobPositions.name,
        description: schema.jobPositions.description,
        createdAt: schema.jobPositions.createdAt,
        updatedAt: schema.jobPositions.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.jobPositions)
      .innerJoin(creator, eq(schema.jobPositions.createdBy, creator.id))
      .innerJoin(updater, eq(schema.jobPositions.updatedBy, updater.id))
      .where(
        and(
          eq(schema.jobPositions.id, id),
          eq(schema.jobPositions.organizationId, organizationId),
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .limit(1);

    return jobPosition ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(JobPositionData & { deletedAt: Date | null }) | null> {
    const { creator, updater } = auditUserAliases();

    const [jobPosition] = await db
      .select({
        id: schema.jobPositions.id,
        organizationId: schema.jobPositions.organizationId,
        name: schema.jobPositions.name,
        description: schema.jobPositions.description,
        createdAt: schema.jobPositions.createdAt,
        updatedAt: schema.jobPositions.updatedAt,
        deletedAt: schema.jobPositions.deletedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.jobPositions)
      .innerJoin(creator, eq(schema.jobPositions.createdBy, creator.id))
      .innerJoin(updater, eq(schema.jobPositions.updatedBy, updater.id))
      .where(
        and(
          eq(schema.jobPositions.id, id),
          eq(schema.jobPositions.organizationId, organizationId)
        )
      )
      .limit(1);

    return jobPosition ?? null;
  }

  static async create(input: CreateJobPositionInput): Promise<JobPositionData> {
    const { organizationId, userId, ...data } = input;

    await JobPositionService.ensureNameNotExists(organizationId, data.name);

    const jobPositionId = `job-position-${crypto.randomUUID()}`;

    const [jobPosition] = await db
      .insert(schema.jobPositions)
      .values({
        id: jobPositionId,
        organizationId,
        name: data.name,
        description: data.description ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "job_position",
      resourceId: jobPosition.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, jobPosition),
    });

    return JobPositionService.findByIdOrThrow(jobPosition.id, organizationId);
  }

  static async findAll(organizationId: string): Promise<JobPositionData[]> {
    const { creator, updater } = auditUserAliases();

    const jobPositions = await db
      .select({
        id: schema.jobPositions.id,
        organizationId: schema.jobPositions.organizationId,
        name: schema.jobPositions.name,
        description: schema.jobPositions.description,
        createdAt: schema.jobPositions.createdAt,
        updatedAt: schema.jobPositions.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.jobPositions)
      .innerJoin(creator, eq(schema.jobPositions.createdBy, creator.id))
      .innerJoin(updater, eq(schema.jobPositions.updatedBy, updater.id))
      .where(
        and(
          eq(schema.jobPositions.organizationId, organizationId),
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .orderBy(schema.jobPositions.name);

    return jobPositions;
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<JobPositionData> {
    const jobPosition = await JobPositionService.findById(id, organizationId);
    if (!jobPosition) {
      throw new JobPositionNotFoundError(id);
    }
    return jobPosition;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateJobPositionInput
  ): Promise<JobPositionData> {
    const { userId, ...data } = input;

    const existing = await JobPositionService.findById(id, organizationId);
    if (!existing) {
      throw new JobPositionNotFoundError(id);
    }

    if (data.name !== undefined) {
      await JobPositionService.ensureNameNotExists(
        organizationId,
        data.name,
        id
      );
    }

    const [updated] = await db
      .update(schema.jobPositions)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.jobPositions.id, id),
          eq(schema.jobPositions.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "job_position",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated),
    });

    return JobPositionService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedJobPositionData> {
    const existing = await JobPositionService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new JobPositionNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new JobPositionAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.jobPositions)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.jobPositions.id, id),
          eq(schema.jobPositions.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "job_position",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, {}),
    });

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
    };
  }
}
