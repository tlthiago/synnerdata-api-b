import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  JobClassificationAlreadyDeletedError,
  JobClassificationAlreadyExistsError,
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
    const [jobClassification] = await db
      .select()
      .from(schema.jobClassifications)
      .where(
        and(
          eq(schema.jobClassifications.id, id),
          eq(schema.jobClassifications.organizationId, organizationId),
          isNull(schema.jobClassifications.deletedAt)
        )
      )
      .limit(1);

    return (jobClassification as JobClassificationData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(JobClassificationData & { deletedAt: Date | null }) | null> {
    const [jobClassification] = await db
      .select()
      .from(schema.jobClassifications)
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

    await JobClassificationService.ensureNameNotExists(
      organizationId,
      data.name
    );

    const jobClassificationId = `job-classification-${crypto.randomUUID()}`;

    const [jobClassification] = await db
      .insert(schema.jobClassifications)
      .values({
        id: jobClassificationId,
        organizationId,
        name: data.name,
        createdBy: userId,
      })
      .returning();

    return jobClassification as JobClassificationData;
  }

  static async findAll(
    organizationId: string
  ): Promise<JobClassificationData[]> {
    const jobClassifications = await db
      .select()
      .from(schema.jobClassifications)
      .where(
        and(
          eq(schema.jobClassifications.organizationId, organizationId),
          isNull(schema.jobClassifications.deletedAt)
        )
      )
      .orderBy(schema.jobClassifications.name);

    return jobClassifications as JobClassificationData[];
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

    return updated as JobClassificationData;
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
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.jobClassifications.id, id),
          eq(schema.jobClassifications.organizationId, organizationId)
        )
      )
      .returning();

    return deleted as DeletedJobClassificationData;
  }
}
