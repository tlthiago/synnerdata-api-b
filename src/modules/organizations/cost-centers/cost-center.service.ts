import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { mapAuditRelations } from "@/lib/responses/response.types";
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

const AUDIT_USER_WITH = {
  createdByUser: { columns: { id: true, name: true } },
  updatedByUser: { columns: { id: true, name: true } },
  deletedByUser: { columns: { id: true, name: true } },
} as const;

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

  static async create(input: CreateCostCenterInput): Promise<CostCenterData> {
    const { organizationId, userId, ...data } = input;

    await CostCenterService.ensureNameNotExists(organizationId, data.name);

    const costCenterId = `cost-center-${crypto.randomUUID()}`;

    return db.transaction(async (tx) => {
      await tx.insert(schema.costCenters).values({
        id: costCenterId,
        organizationId,
        name: data.name,
        createdBy: userId,
        updatedBy: userId,
      });

      const raw = await tx.query.costCenters.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, costCenterId),
        with: AUDIT_USER_WITH,
      });

      if (!raw) {
        throw new Error("Cost center inconsistency after insert");
      }

      return mapAuditRelations(raw);
    });
  }

  static async findAll(organizationId: string): Promise<CostCenterData[]> {
    const rows = await db.query.costCenters.findMany({
      where: (t, { eq: _eq, and: _and, isNull: _isNull }) =>
        _and(_eq(t.organizationId, organizationId), _isNull(t.deletedAt)),
      orderBy: (t, { asc }) => asc(t.name),
      with: AUDIT_USER_WITH,
    });

    return rows.map((row) => mapAuditRelations(row));
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<CostCenterData> {
    const raw = await db.query.costCenters.findFirst({
      where: (t, { eq: _eq, and: _and, isNull: _isNull }) =>
        _and(
          _eq(t.id, id),
          _eq(t.organizationId, organizationId),
          _isNull(t.deletedAt)
        ),
      with: AUDIT_USER_WITH,
    });

    if (!raw) {
      throw new CostCenterNotFoundError(id);
    }

    return mapAuditRelations(raw);
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateCostCenterInput
  ): Promise<CostCenterData> {
    const { userId, ...data } = input;

    const existing = await db.query.costCenters.findFirst({
      where: (t, { eq: _eq, and: _and, isNull: _isNull }) =>
        _and(
          _eq(t.id, id),
          _eq(t.organizationId, organizationId),
          _isNull(t.deletedAt)
        ),
      columns: { id: true },
    });
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

    return db.transaction(async (tx) => {
      await tx
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
        );

      const raw = await tx.query.costCenters.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, id),
        with: AUDIT_USER_WITH,
      });

      if (!raw) {
        throw new Error("Cost center inconsistency after update");
      }

      return mapAuditRelations(raw);
    });
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedCostCenterData> {
    const [existing] = await db
      .select({
        id: schema.costCenters.id,
        deletedAt: schema.costCenters.deletedAt,
      })
      .from(schema.costCenters)
      .where(
        and(
          eq(schema.costCenters.id, id),
          eq(schema.costCenters.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new CostCenterNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new CostCenterAlreadyDeletedError(id);
    }

    return db.transaction(async (tx) => {
      await tx
        .update(schema.costCenters)
        .set({
          deletedAt: new Date(),
          deletedBy: userId,
        })
        .where(
          and(
            eq(schema.costCenters.id, id),
            eq(schema.costCenters.organizationId, organizationId)
          )
        );

      const raw = await tx.query.costCenters.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, id),
        with: AUDIT_USER_WITH,
      });

      if (!raw) {
        throw new Error("Cost center inconsistency after delete");
      }

      return mapAuditRelations(raw) as DeletedCostCenterData;
    });
  }
}
