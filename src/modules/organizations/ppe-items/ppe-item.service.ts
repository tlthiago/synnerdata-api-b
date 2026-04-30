import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges } from "@/modules/audit/pii-redaction";
import {
  PpeItemAlreadyDeletedError,
  PpeItemAlreadyExistsError,
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
  private static async ensureNameAndEquipmentNotExists(
    organizationId: string,
    name: string,
    equipment: string,
    excludeId?: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.ppeItems.id })
      .from(schema.ppeItems)
      .where(
        and(
          eq(schema.ppeItems.organizationId, organizationId),
          sql`lower(${schema.ppeItems.name}) = lower(${name})`,
          sql`lower(${schema.ppeItems.equipment}) = lower(${equipment})`,
          isNull(schema.ppeItems.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new PpeItemAlreadyExistsError(name, equipment);
    }
  }

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

    await PpeItemService.ensureNameAndEquipmentNotExists(
      organizationId,
      data.name,
      data.equipment
    );

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
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "ppe_item",
      resourceId: ppeItem.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, ppeItem),
    });

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

    if (data.name !== undefined || data.equipment !== undefined) {
      const finalName = data.name ?? existing.name;
      const finalEquipment = data.equipment ?? existing.equipment;
      await PpeItemService.ensureNameAndEquipmentNotExists(
        organizationId,
        finalName,
        finalEquipment,
        id
      );
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

    await AuditService.log({
      action: "update",
      resource: "ppe_item",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated),
    });

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
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.ppeItems.id, id),
          eq(schema.ppeItems.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "ppe_item",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, {}),
    });

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

    await AuditService.log({
      action: "create",
      resource: "ppe_job_position",
      resourceId: association.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, association),
    });

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
    const [removed] = await db
      .update(schema.ppeJobPositions)
      .set({
        deletedAt: new Date(),
      })
      .where(eq(schema.ppeJobPositions.id, association.id))
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "ppe_job_position",
      resourceId: removed.id,
      userId,
      organizationId,
      changes: buildAuditChanges(association, {}),
    });
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
