import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  JobPositionAlreadyDeletedError,
  JobPositionNotFoundError,
} from "./errors";
import type {
  CreateJobPositionInput,
  DeletedJobPositionData,
  JobPositionData,
  UpdateJobPositionInput,
} from "./job-position.model";

export abstract class JobPositionService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<JobPositionData | null> {
    const [jobPosition] = await db
      .select()
      .from(schema.jobPositions)
      .where(
        and(
          eq(schema.jobPositions.id, id),
          eq(schema.jobPositions.organizationId, organizationId),
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .limit(1);

    return (jobPosition as JobPositionData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(JobPositionData & { deletedAt: Date | null }) | null> {
    const [jobPosition] = await db
      .select()
      .from(schema.jobPositions)
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

    const jobPositionId = `job-position-${crypto.randomUUID()}`;

    const [jobPosition] = await db
      .insert(schema.jobPositions)
      .values({
        id: jobPositionId,
        organizationId,
        name: data.name,
        description: data.description ?? null,
        createdBy: userId,
      })
      .returning();

    return jobPosition as JobPositionData;
  }

  static async findAll(organizationId: string): Promise<JobPositionData[]> {
    const jobPositions = await db
      .select()
      .from(schema.jobPositions)
      .where(
        and(
          eq(schema.jobPositions.organizationId, organizationId),
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .orderBy(schema.jobPositions.name);

    return jobPositions as JobPositionData[];
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

    return updated as JobPositionData;
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
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.jobPositions.id, id),
          eq(schema.jobPositions.organizationId, organizationId)
        )
      )
      .returning();

    return deleted as DeletedJobPositionData;
  }
}
