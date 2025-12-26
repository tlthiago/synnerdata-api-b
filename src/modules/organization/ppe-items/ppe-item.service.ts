import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  PpeItemAlreadyDeletedError,
  PpeItemNotFoundError,
  PpeJobPositionAlreadyExistsError,
  PpeJobPositionNotFoundError,
} from "./errors";
import type {
  CreatePpeItemInput,
  DeletedPpeItemData,
  PpeItemData,
  UpdatePpeItemInput,
} from "./ppe-item.model";

export abstract class PpeItemService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<PpeItemData | null> {
    const [ppeItem] = await db
      .select()
      .from(schema.ppeItems)
      .where(
        and(
          eq(schema.ppeItems.id, id),
          eq(schema.ppeItems.organizationId, organizationId),
          isNull(schema.ppeItems.deletedAt)
        )
      )
      .limit(1);

    return (ppeItem as PpeItemData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(PpeItemData & { deletedAt: Date | null }) | null> {
    const [ppeItem] = await db
      .select()
      .from(schema.ppeItems)
      .where(
        and(
          eq(schema.ppeItems.id, id),
          eq(schema.ppeItems.organizationId, organizationId)
        )
      )
      .limit(1);

    return ppeItem ?? null;
  }

  static async create(input: CreatePpeItemInput): Promise<PpeItemData> {
    const { organizationId, userId, ...data } = input;

    const ppeItemId = `ppe-item-${crypto.randomUUID()}`;

    const [ppeItem] = await db
      .insert(schema.ppeItems)
      .values({
        id: ppeItemId,
        organizationId,
        name: data.name,
        description: data.description,
        equipment: data.equipment,
        createdBy: userId,
      })
      .returning();

    return ppeItem as PpeItemData;
  }

  static async findAll(organizationId: string): Promise<PpeItemData[]> {
    const ppeItems = await db
      .select()
      .from(schema.ppeItems)
      .where(
        and(
          eq(schema.ppeItems.organizationId, organizationId),
          isNull(schema.ppeItems.deletedAt)
        )
      )
      .orderBy(schema.ppeItems.name);

    return ppeItems as PpeItemData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<PpeItemData> {
    const ppeItem = await PpeItemService.findById(id, organizationId);
    if (!ppeItem) {
      throw new PpeItemNotFoundError(id);
    }
    return ppeItem;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdatePpeItemInput
  ): Promise<PpeItemData> {
    const { userId, ...data } = input;

    const existing = await PpeItemService.findById(id, organizationId);
    if (!existing) {
      throw new PpeItemNotFoundError(id);
    }

    const [updated] = await db
      .update(schema.ppeItems)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.ppeItems.id, id),
          eq(schema.ppeItems.organizationId, organizationId)
        )
      )
      .returning();

    return updated as PpeItemData;
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedPpeItemData> {
    const existing = await PpeItemService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new PpeItemNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new PpeItemAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.ppeItems)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.ppeItems.id, id),
          eq(schema.ppeItems.organizationId, organizationId)
        )
      )
      .returning();

    return deleted as DeletedPpeItemData;
  }

  // M2M Job Position methods

  static async addJobPosition(
    ppeItemId: string,
    jobPositionId: string,
    organizationId: string,
    userId: string
  ): Promise<{ ppeItemId: string; jobPositionId: string; createdAt: Date }> {
    // Verify PPE Item exists
    await PpeItemService.findByIdOrThrow(ppeItemId, organizationId);

    // Verify Job Position exists
    const [jobPosition] = await db
      .select()
      .from(schema.jobPositions)
      .where(
        and(
          eq(schema.jobPositions.id, jobPositionId),
          eq(schema.jobPositions.organizationId, organizationId),
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .limit(1);

    if (!jobPosition) {
      throw new PpeJobPositionNotFoundError(ppeItemId, jobPositionId);
    }

    // Check if association already exists (active)
    const [existing] = await db
      .select()
      .from(schema.ppeJobPositions)
      .where(
        and(
          eq(schema.ppeJobPositions.ppeItemId, ppeItemId),
          eq(schema.ppeJobPositions.jobPositionId, jobPositionId),
          isNull(schema.ppeJobPositions.deletedAt)
        )
      )
      .limit(1);

    if (existing) {
      throw new PpeJobPositionAlreadyExistsError(ppeItemId, jobPositionId);
    }

    const id = `ppe-job-position-${crypto.randomUUID()}`;

    const [association] = await db
      .insert(schema.ppeJobPositions)
      .values({
        id,
        organizationId,
        ppeItemId,
        jobPositionId,
        createdBy: userId,
      })
      .returning();

    return {
      ppeItemId: association.ppeItemId,
      jobPositionId: association.jobPositionId,
      createdAt: association.createdAt,
    };
  }

  static async removeJobPosition(
    ppeItemId: string,
    jobPositionId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    // Verify PPE Item exists
    await PpeItemService.findByIdOrThrow(ppeItemId, organizationId);

    // Find active association
    const [association] = await db
      .select()
      .from(schema.ppeJobPositions)
      .where(
        and(
          eq(schema.ppeJobPositions.ppeItemId, ppeItemId),
          eq(schema.ppeJobPositions.jobPositionId, jobPositionId),
          eq(schema.ppeJobPositions.organizationId, organizationId),
          isNull(schema.ppeJobPositions.deletedAt)
        )
      )
      .limit(1);

    if (!association) {
      throw new PpeJobPositionNotFoundError(ppeItemId, jobPositionId);
    }

    // Soft delete the association
    await db
      .update(schema.ppeJobPositions)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(schema.ppeJobPositions.id, association.id));
  }

  static async getJobPositions(
    ppeItemId: string,
    organizationId: string
  ): Promise<{ id: string; name: string; description: string | null }[]> {
    // Verify PPE Item exists
    await PpeItemService.findByIdOrThrow(ppeItemId, organizationId);

    const associations = await db
      .select({
        id: schema.jobPositions.id,
        name: schema.jobPositions.name,
        description: schema.jobPositions.description,
      })
      .from(schema.ppeJobPositions)
      .innerJoin(
        schema.jobPositions,
        eq(schema.ppeJobPositions.jobPositionId, schema.jobPositions.id)
      )
      .where(
        and(
          eq(schema.ppeJobPositions.ppeItemId, ppeItemId),
          eq(schema.ppeJobPositions.organizationId, organizationId),
          isNull(schema.ppeJobPositions.deletedAt),
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .orderBy(schema.jobPositions.name);

    return associations;
  }
}
