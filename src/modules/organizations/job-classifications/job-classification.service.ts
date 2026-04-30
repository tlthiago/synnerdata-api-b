import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { auditUserAliases } from "@/lib/schemas/audit-users";
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges } from "@/modules/audit/pii-redaction";
import { CboOccupationService } from "@/modules/cbo-occupations/cbo-occupation.service";
import { CboOccupationNotFoundError } from "@/modules/cbo-occupations/errors";
import {
  InvalidCboOccupationError,
  JobClassificationAlreadyDeletedError,
  JobClassificationAlreadyExistsError,
  JobClassificationError,
  JobClassificationNotFoundError,
} from "./errors";
import type {
  CreateJobClassificationInput,
  DeletedJobClassificationData,
  JobClassificationData,
  UpdateJobClassificationInput,
} from "./job-classification.model";

export abstract class JobClassificationService {
  private static async ensureNameNotExists(
    organizationId: string,
    name: string,
    excludeId?: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.jobClassifications.id })
      .from(schema.jobClassifications)
      .where(
        and(
          eq(schema.jobClassifications.organizationId, organizationId),
          sql`lower(${schema.jobClassifications.name}) = lower(${name})`,
          isNull(schema.jobClassifications.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new JobClassificationAlreadyExistsError(name);
    }
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<JobClassificationData | null> {
    const { creator, updater } = auditUserAliases();

    const [jobClassification] = await db
      .select({
        id: schema.jobClassifications.id,
        organizationId: schema.jobClassifications.organizationId,
        name: schema.jobClassifications.name,
        cboOccupationId: schema.jobClassifications.cboOccupationId,
        createdAt: schema.jobClassifications.createdAt,
        updatedAt: schema.jobClassifications.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.jobClassifications)
      .innerJoin(creator, eq(schema.jobClassifications.createdBy, creator.id))
      .innerJoin(updater, eq(schema.jobClassifications.updatedBy, updater.id))
      .where(
        and(
          eq(schema.jobClassifications.id, id),
          eq(schema.jobClassifications.organizationId, organizationId),
          isNull(schema.jobClassifications.deletedAt)
        )
      )
      .limit(1);

    return jobClassification ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(JobClassificationData & { deletedAt: Date | null }) | null> {
    const { creator, updater } = auditUserAliases();

    const [jobClassification] = await db
      .select({
        id: schema.jobClassifications.id,
        organizationId: schema.jobClassifications.organizationId,
        name: schema.jobClassifications.name,
        cboOccupationId: schema.jobClassifications.cboOccupationId,
        createdAt: schema.jobClassifications.createdAt,
        updatedAt: schema.jobClassifications.updatedAt,
        deletedAt: schema.jobClassifications.deletedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.jobClassifications)
      .innerJoin(creator, eq(schema.jobClassifications.createdBy, creator.id))
      .innerJoin(updater, eq(schema.jobClassifications.updatedBy, updater.id))
      .where(
        and(
          eq(schema.jobClassifications.id, id),
          eq(schema.jobClassifications.organizationId, organizationId)
        )
      )
      .limit(1);

    return jobClassification ?? null;
  }

  static async create(
    input: CreateJobClassificationInput
  ): Promise<JobClassificationData> {
    const { organizationId, userId, ...data } = input;

    let resolvedName = data.name;

    if (data.cboOccupationId) {
      try {
        const cbo = await CboOccupationService.findByIdOrThrow(
          data.cboOccupationId
        );
        if (!resolvedName) {
          resolvedName = cbo.title;
        }
      } catch (error) {
        if (error instanceof CboOccupationNotFoundError) {
          throw new InvalidCboOccupationError(data.cboOccupationId);
        }
        throw error;
      }
    }

    if (!resolvedName) {
      throw new JobClassificationError(
        "Nome é obrigatório",
        "VALIDATION_ERROR"
      );
    }

    await JobClassificationService.ensureNameNotExists(
      organizationId,
      resolvedName
    );

    const jobClassificationId = `job-classification-${crypto.randomUUID()}`;

    const [jobClassification] = await db
      .insert(schema.jobClassifications)
      .values({
        id: jobClassificationId,
        organizationId,
        name: resolvedName,
        cboOccupationId: data.cboOccupationId ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "job_classification",
      resourceId: jobClassification.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, jobClassification),
    });

    return JobClassificationService.findByIdOrThrow(
      jobClassification.id,
      organizationId
    );
  }

  static async findAll(
    organizationId: string
  ): Promise<JobClassificationData[]> {
    const { creator, updater } = auditUserAliases();

    const jobClassifications = await db
      .select({
        id: schema.jobClassifications.id,
        organizationId: schema.jobClassifications.organizationId,
        name: schema.jobClassifications.name,
        cboOccupationId: schema.jobClassifications.cboOccupationId,
        createdAt: schema.jobClassifications.createdAt,
        updatedAt: schema.jobClassifications.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.jobClassifications)
      .innerJoin(creator, eq(schema.jobClassifications.createdBy, creator.id))
      .innerJoin(updater, eq(schema.jobClassifications.updatedBy, updater.id))
      .where(
        and(
          eq(schema.jobClassifications.organizationId, organizationId),
          isNull(schema.jobClassifications.deletedAt)
        )
      )
      .orderBy(schema.jobClassifications.name);

    return jobClassifications;
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<JobClassificationData> {
    const jobClassification = await JobClassificationService.findById(
      id,
      organizationId
    );
    if (!jobClassification) {
      throw new JobClassificationNotFoundError(id);
    }
    return jobClassification;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateJobClassificationInput
  ): Promise<JobClassificationData> {
    const { userId, ...data } = input;

    const existing = await JobClassificationService.findById(
      id,
      organizationId
    );
    if (!existing) {
      throw new JobClassificationNotFoundError(id);
    }

    if (data.cboOccupationId !== undefined && data.cboOccupationId !== null) {
      try {
        await CboOccupationService.findByIdOrThrow(data.cboOccupationId);
      } catch (error) {
        if (error instanceof CboOccupationNotFoundError) {
          throw new InvalidCboOccupationError(data.cboOccupationId);
        }
        throw error;
      }
    }

    if (data.name !== undefined) {
      await JobClassificationService.ensureNameNotExists(
        organizationId,
        data.name,
        id
      );
    }

    const [updated] = await db
      .update(schema.jobClassifications)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.jobClassifications.id, id),
          eq(schema.jobClassifications.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "job_classification",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated),
    });

    return JobClassificationService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedJobClassificationData> {
    const existing = await JobClassificationService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new JobClassificationNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new JobClassificationAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.jobClassifications)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.jobClassifications.id, id),
          eq(schema.jobClassifications.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "job_classification",
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
