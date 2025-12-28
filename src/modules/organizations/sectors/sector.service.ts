import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { SectorAlreadyDeletedError, SectorNotFoundError } from "./errors";
import type {
  CreateSectorInput,
  DeletedSectorData,
  SectorData,
  UpdateSectorInput,
} from "./sector.model";

export abstract class SectorService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<SectorData | null> {
    const [sector] = await db
      .select()
      .from(schema.sectors)
      .where(
        and(
          eq(schema.sectors.id, id),
          eq(schema.sectors.organizationId, organizationId),
          isNull(schema.sectors.deletedAt)
        )
      )
      .limit(1);

    return (sector as SectorData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(SectorData & { deletedAt: Date | null }) | null> {
    const [sector] = await db
      .select()
      .from(schema.sectors)
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

    const sectorId = `sector-${crypto.randomUUID()}`;

    const [sector] = await db
      .insert(schema.sectors)
      .values({
        id: sectorId,
        organizationId,
        name: data.name,
        createdBy: userId,
      })
      .returning();

    return sector as SectorData;
  }

  static async findAll(organizationId: string): Promise<SectorData[]> {
    const sectors = await db
      .select()
      .from(schema.sectors)
      .where(
        and(
          eq(schema.sectors.organizationId, organizationId),
          isNull(schema.sectors.deletedAt)
        )
      )
      .orderBy(schema.sectors.name);

    return sectors as SectorData[];
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

    return updated as SectorData;
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
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.sectors.id, id),
          eq(schema.sectors.organizationId, organizationId)
        )
      )
      .returning();

    return deleted as DeletedSectorData;
  }
}
