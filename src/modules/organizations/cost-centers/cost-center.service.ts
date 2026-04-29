import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { auditUserAliases } from "@/lib/schemas/audit-users";
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges } from "@/modules/audit/pii-redaction";
import type {
  CostCenterData,
  CreateCostCenterInput,
  DeletedCostCenterData,
  UpdateCostCenterInput,
} from "./cost-center.model";
import {
  CostCenterAlreadyDeletedError,
  CostCenterAlreadyExistsError,
  CostCenterNotFoundError,
} from "./errors";

export abstract class CostCenterService {
  private static async ensureNameNotExists(
    organizationId: string,
    name: string,
    excludeId?: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.costCenters.id })
      .from(schema.costCenters)
      .where(
        and(
          eq(schema.costCenters.organizationId, organizationId),
          sql`lower(${schema.costCenters.name}) = lower(${name})`,
          isNull(schema.costCenters.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new CostCenterAlreadyExistsError(name);
    }
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<CostCenterData | null> {
    const { creator, updater } = auditUserAliases();

    const [costCenter] = await db
      .select({
        id: schema.costCenters.id,
        organizationId: schema.costCenters.organizationId,
        name: schema.costCenters.name,
        createdAt: schema.costCenters.createdAt,
        updatedAt: schema.costCenters.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.costCenters)
      .innerJoin(creator, eq(schema.costCenters.createdBy, creator.id))
      .innerJoin(updater, eq(schema.costCenters.updatedBy, updater.id))
      .where(
        and(
          eq(schema.costCenters.id, id),
          eq(schema.costCenters.organizationId, organizationId),
          isNull(schema.costCenters.deletedAt)
        )
      )
      .limit(1);

    return costCenter ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(CostCenterData & { deletedAt: Date | null }) | null> {
    const { creator, updater } = auditUserAliases();

    const [costCenter] = await db
      .select({
        id: schema.costCenters.id,
        organizationId: schema.costCenters.organizationId,
        name: schema.costCenters.name,
        createdAt: schema.costCenters.createdAt,
        updatedAt: schema.costCenters.updatedAt,
        deletedAt: schema.costCenters.deletedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.costCenters)
      .innerJoin(creator, eq(schema.costCenters.createdBy, creator.id))
      .innerJoin(updater, eq(schema.costCenters.updatedBy, updater.id))
      .where(
        and(
          eq(schema.costCenters.id, id),
          eq(schema.costCenters.organizationId, organizationId)
        )
      )
      .limit(1);

    return costCenter ?? null;
  }

  static async create(input: CreateCostCenterInput): Promise<CostCenterData> {
    const { organizationId, userId, ...data } = input;

    await CostCenterService.ensureNameNotExists(organizationId, data.name);

    const costCenterId = `cost-center-${crypto.randomUUID()}`;

    const [inserted] = await db
      .insert(schema.costCenters)
      .values({
        id: costCenterId,
        organizationId,
        name: data.name,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "cost_center",
      resourceId: inserted.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, inserted),
    });

    return CostCenterService.findByIdOrThrow(inserted.id, organizationId);
  }

  static async findAll(organizationId: string): Promise<CostCenterData[]> {
    const { creator, updater } = auditUserAliases();

    const costCenters = await db
      .select({
        id: schema.costCenters.id,
        organizationId: schema.costCenters.organizationId,
        name: schema.costCenters.name,
        createdAt: schema.costCenters.createdAt,
        updatedAt: schema.costCenters.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.costCenters)
      .innerJoin(creator, eq(schema.costCenters.createdBy, creator.id))
      .innerJoin(updater, eq(schema.costCenters.updatedBy, updater.id))
      .where(
        and(
          eq(schema.costCenters.organizationId, organizationId),
          isNull(schema.costCenters.deletedAt)
        )
      )
      .orderBy(schema.costCenters.name);

    return costCenters;
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<CostCenterData> {
    const costCenter = await CostCenterService.findById(id, organizationId);
    if (!costCenter) {
      throw new CostCenterNotFoundError(id);
    }
    return costCenter;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateCostCenterInput
  ): Promise<CostCenterData> {
    const { userId, ...data } = input;

    const existing = await CostCenterService.findById(id, organizationId);
    if (!existing) {
      throw new CostCenterNotFoundError(id);
    }

    if (data.name !== undefined) {
      await CostCenterService.ensureNameNotExists(
        organizationId,
        data.name,
        id
      );
    }

    const [updated] = await db
      .update(schema.costCenters)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.costCenters.id, id),
          eq(schema.costCenters.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "cost_center",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated),
    });

    return CostCenterService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedCostCenterData> {
    const existing = await CostCenterService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new CostCenterNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new CostCenterAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.costCenters)
      .set({
        deletedAt: new Date(),
      })
      .where(
        and(
          eq(schema.costCenters.id, id),
          eq(schema.costCenters.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "cost_center",
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
