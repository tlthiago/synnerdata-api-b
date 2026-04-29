import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
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
    const [costCenter] = await db
      .select()
      .from(schema.costCenters)
      .where(
        and(
          eq(schema.costCenters.id, id),
          eq(schema.costCenters.organizationId, organizationId),
          isNull(schema.costCenters.deletedAt)
        )
      )
      .limit(1);

    return (costCenter as CostCenterData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(CostCenterData & { deletedAt: Date | null }) | null> {
    const [costCenter] = await db
      .select()
      .from(schema.costCenters)
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

    const [costCenter] = await db
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
      resourceId: costCenter.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, costCenter),
    });

    return costCenter as CostCenterData;
  }

  static async findAll(organizationId: string): Promise<CostCenterData[]> {
    const costCenters = await db
      .select()
      .from(schema.costCenters)
      .where(
        and(
          eq(schema.costCenters.organizationId, organizationId),
          isNull(schema.costCenters.deletedAt)
        )
      )
      .orderBy(schema.costCenters.name);

    return costCenters as CostCenterData[];
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

    return updated as CostCenterData;
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

    return deleted as DeletedCostCenterData;
  }
}
