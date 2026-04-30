import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { auditUserAliases } from "@/lib/schemas/audit-users";
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges } from "@/modules/audit/pii-redaction";
import {
  SectorAlreadyDeletedError,
  SectorAlreadyExistsError,
  SectorNotFoundError,
} from "./errors";
import type {
  CreateSectorInput,
  DeletedSectorData,
  SectorData,
  UpdateSectorInput,
} from "./sector.model";

export abstract class SectorService {
  private static async ensureNameNotExists(
    organizationId: string,
    name: string,
    excludeId?: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.sectors.id })
      .from(schema.sectors)
      .where(
        and(
          eq(schema.sectors.organizationId, organizationId),
          sql`lower(${schema.sectors.name}) = lower(${name})`,
          isNull(schema.sectors.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new SectorAlreadyExistsError(name);
    }
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<SectorData | null> {
    const { creator, updater } = auditUserAliases();

    const [sector] = await db
      .select({
        id: schema.sectors.id,
        organizationId: schema.sectors.organizationId,
        name: schema.sectors.name,
        createdAt: schema.sectors.createdAt,
        updatedAt: schema.sectors.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.sectors)
      .innerJoin(creator, eq(schema.sectors.createdBy, creator.id))
      .innerJoin(updater, eq(schema.sectors.updatedBy, updater.id))
      .where(
        and(
          eq(schema.sectors.id, id),
          eq(schema.sectors.organizationId, organizationId),
          isNull(schema.sectors.deletedAt)
        )
      )
      .limit(1);

    return sector ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(SectorData & { deletedAt: Date | null }) | null> {
    const { creator, updater } = auditUserAliases();

    const [sector] = await db
      .select({
        id: schema.sectors.id,
        organizationId: schema.sectors.organizationId,
        name: schema.sectors.name,
        createdAt: schema.sectors.createdAt,
        updatedAt: schema.sectors.updatedAt,
        deletedAt: schema.sectors.deletedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.sectors)
      .innerJoin(creator, eq(schema.sectors.createdBy, creator.id))
      .innerJoin(updater, eq(schema.sectors.updatedBy, updater.id))
      .where(
        and(
          eq(schema.sectors.id, id),
          eq(schema.sectors.organizationId, organizationId)
        )
      )
      .limit(1);

    return sector ?? null;
  }

  static async create(input: CreateSectorInput): Promise<SectorData> {
    const { organizationId, userId, ...data } = input;

    await SectorService.ensureNameNotExists(organizationId, data.name);

    const sectorId = `sector-${crypto.randomUUID()}`;

    const [sector] = await db
      .insert(schema.sectors)
      .values({
        id: sectorId,
        organizationId,
        name: data.name,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "sector",
      resourceId: sector.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, sector),
    });

    return SectorService.findByIdOrThrow(sector.id, organizationId);
  }

  static async findAll(organizationId: string): Promise<SectorData[]> {
    const { creator, updater } = auditUserAliases();

    const sectors = await db
      .select({
        id: schema.sectors.id,
        organizationId: schema.sectors.organizationId,
        name: schema.sectors.name,
        createdAt: schema.sectors.createdAt,
        updatedAt: schema.sectors.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.sectors)
      .innerJoin(creator, eq(schema.sectors.createdBy, creator.id))
      .innerJoin(updater, eq(schema.sectors.updatedBy, updater.id))
      .where(
        and(
          eq(schema.sectors.organizationId, organizationId),
          isNull(schema.sectors.deletedAt)
        )
      )
      .orderBy(schema.sectors.name);

    return sectors;
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<SectorData> {
    const sector = await SectorService.findById(id, organizationId);
    if (!sector) {
      throw new SectorNotFoundError(id);
    }
    return sector;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateSectorInput
  ): Promise<SectorData> {
    const { userId, ...data } = input;

    const existing = await SectorService.findById(id, organizationId);
    if (!existing) {
      throw new SectorNotFoundError(id);
    }

    if (data.name !== undefined) {
      await SectorService.ensureNameNotExists(organizationId, data.name, id);
    }

    const [updated] = await db
      .update(schema.sectors)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.sectors.id, id),
          eq(schema.sectors.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "sector",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated),
    });

    return SectorService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedSectorData> {
    const existing = await SectorService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new SectorNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new SectorAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.sectors)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.sectors.id, id),
          eq(schema.sectors.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "sector",
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
