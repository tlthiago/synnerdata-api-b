import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { auditUserAliases } from "@/lib/schemas/audit-users";
import { AuditService } from "@/modules/audit/audit.service";
import {
  buildAuditChanges,
  IGNORED_AUDIT_FIELDS,
} from "@/modules/audit/pii-redaction";
import { ensureEmployeeActive } from "@/modules/employees/status";
import {
  PpeDeliveryAlreadyDeletedError,
  PpeDeliveryEmployeeNotFoundError,
  PpeDeliveryItemAlreadyExistsError,
  PpeDeliveryItemNotFoundError,
  PpeDeliveryNotFoundError,
  PpeDeliveryPpeItemNotFoundError,
} from "./errors";
import type {
  CreatePpeDeliveryInput,
  DeletedPpeDeliveryData,
  PpeDeliveryData,
  UpdatePpeDeliveryInput,
} from "./ppe-delivery.model";

const PPE_DELIVERY_IGNORED_FIELDS = new Set([
  ...IGNORED_AUDIT_FIELDS,
  "employee",
  "employeeId",
]);

type PpeItemData = { id: string; name: string; equipment: string };

export abstract class PpeDeliveryService {
  private static async getPpeItems(
    ppeDeliveryId: string,
    organizationId: string
  ): Promise<PpeItemData[]> {
    const items = await db
      .select({
        id: schema.ppeItems.id,
        name: schema.ppeItems.name,
        equipment: schema.ppeItems.equipment,
      })
      .from(schema.ppeDeliveryItems)
      .innerJoin(
        schema.ppeItems,
        eq(schema.ppeDeliveryItems.ppeItemId, schema.ppeItems.id)
      )
      .where(
        and(
          eq(schema.ppeDeliveryItems.ppeDeliveryId, ppeDeliveryId),
          eq(schema.ppeDeliveryItems.organizationId, organizationId),
          isNull(schema.ppeDeliveryItems.deletedAt),
          isNull(schema.ppeItems.deletedAt)
        )
      )
      .orderBy(schema.ppeItems.name);

    return items;
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<PpeDeliveryData | null> {
    const { creator, updater } = auditUserAliases();

    const [delivery] = await db
      .select({
        id: schema.ppeDeliveries.id,
        organizationId: schema.ppeDeliveries.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
          cpf: schema.employees.cpf,
        },
        deliveryDate: schema.ppeDeliveries.deliveryDate,
        reason: schema.ppeDeliveries.reason,
        deliveredBy: schema.ppeDeliveries.deliveredBy,
        createdAt: schema.ppeDeliveries.createdAt,
        updatedAt: schema.ppeDeliveries.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.ppeDeliveries)
      .innerJoin(
        schema.employees,
        eq(schema.ppeDeliveries.employeeId, schema.employees.id)
      )
      .innerJoin(creator, eq(schema.ppeDeliveries.createdBy, creator.id))
      .innerJoin(updater, eq(schema.ppeDeliveries.updatedBy, updater.id))
      .where(
        and(
          eq(schema.ppeDeliveries.id, id),
          eq(schema.ppeDeliveries.organizationId, organizationId),
          isNull(schema.ppeDeliveries.deletedAt)
        )
      )
      .limit(1);

    if (!delivery) {
      return null;
    }

    const items = await PpeDeliveryService.getPpeItems(id, organizationId);

    return { ...delivery, items } as PpeDeliveryData;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(PpeDeliveryData & { deletedAt: Date | null }) | null> {
    const { creator, updater } = auditUserAliases();

    const [delivery] = await db
      .select({
        id: schema.ppeDeliveries.id,
        organizationId: schema.ppeDeliveries.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
          cpf: schema.employees.cpf,
        },
        deliveryDate: schema.ppeDeliveries.deliveryDate,
        reason: schema.ppeDeliveries.reason,
        deliveredBy: schema.ppeDeliveries.deliveredBy,
        createdAt: schema.ppeDeliveries.createdAt,
        updatedAt: schema.ppeDeliveries.updatedAt,
        deletedAt: schema.ppeDeliveries.deletedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.ppeDeliveries)
      .innerJoin(
        schema.employees,
        eq(schema.ppeDeliveries.employeeId, schema.employees.id)
      )
      .innerJoin(creator, eq(schema.ppeDeliveries.createdBy, creator.id))
      .innerJoin(updater, eq(schema.ppeDeliveries.updatedBy, updater.id))
      .where(
        and(
          eq(schema.ppeDeliveries.id, id),
          eq(schema.ppeDeliveries.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!delivery) {
      return null;
    }

    const items = await PpeDeliveryService.getPpeItems(id, organizationId);

    return { ...delivery, items } as PpeDeliveryData & {
      deletedAt: Date | null;
    };
  }

  private static async createLog(params: {
    ppeDeliveryId: string;
    ppeItemId: string;
    action: "ADDED" | "REMOVED";
    userId: string;
    description?: string;
  }): Promise<void> {
    await db.insert(schema.ppeDeliveryLogs).values({
      id: `ppe-delivery-log-${crypto.randomUUID()}`,
      ppeDeliveryId: params.ppeDeliveryId,
      ppeItemId: params.ppeItemId,
      action: params.action,
      description: params.description,
      createdBy: params.userId,
    });
  }

  static async create(input: CreatePpeDeliveryInput): Promise<PpeDeliveryData> {
    const { organizationId, userId, ppeItemIds, ...data } = input;

    const [employeeRow] = await db
      .select({
        id: schema.employees.id,
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, data.employeeId),
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .limit(1);

    if (!employeeRow) {
      throw new PpeDeliveryEmployeeNotFoundError(data.employeeId);
    }

    await ensureEmployeeActive(data.employeeId, organizationId);

    if (ppeItemIds && ppeItemIds.length > 0) {
      for (const ppeItemId of ppeItemIds) {
        const [ppeItem] = await db
          .select()
          .from(schema.ppeItems)
          .where(
            and(
              eq(schema.ppeItems.id, ppeItemId),
              eq(schema.ppeItems.organizationId, organizationId),
              isNull(schema.ppeItems.deletedAt)
            )
          )
          .limit(1);

        if (!ppeItem) {
          throw new PpeDeliveryPpeItemNotFoundError(ppeItemId);
        }
      }
    }

    const ppeDeliveryId = `ppe-delivery-${crypto.randomUUID()}`;

    const [delivery] = await db
      .insert(schema.ppeDeliveries)
      .values({
        id: ppeDeliveryId,
        organizationId,
        employeeId: data.employeeId,
        deliveryDate: data.deliveryDate,
        reason: data.reason,
        deliveredBy: data.deliveredBy,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "ppe_delivery",
      resourceId: delivery.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, delivery, {
        ignoredFields: PPE_DELIVERY_IGNORED_FIELDS,
      }),
    });

    if (ppeItemIds && ppeItemIds.length > 0) {
      for (const ppeItemId of ppeItemIds) {
        const itemId = `ppe-delivery-item-${crypto.randomUUID()}`;

        const [association] = await db
          .insert(schema.ppeDeliveryItems)
          .values({
            id: itemId,
            organizationId,
            ppeDeliveryId,
            ppeItemId,
            createdBy: userId,
          })
          .returning();

        await PpeDeliveryService.createLog({
          ppeDeliveryId,
          ppeItemId,
          action: "ADDED",
          userId,
          description: "Adicionado na criação da entrega",
        });

        await AuditService.log({
          action: "create",
          resource: "ppe_delivery_item",
          resourceId: association.id,
          userId,
          organizationId,
          changes: buildAuditChanges({}, association),
        });
      }
    }

    return PpeDeliveryService.findByIdOrThrow(ppeDeliveryId, organizationId);
  }

  static async findAll(
    organizationId: string,
    employeeId?: string
  ): Promise<PpeDeliveryData[]> {
    const { creator, updater } = auditUserAliases();

    const conditions = [
      eq(schema.ppeDeliveries.organizationId, organizationId),
      isNull(schema.ppeDeliveries.deletedAt),
    ];

    if (employeeId) {
      conditions.push(eq(schema.ppeDeliveries.employeeId, employeeId));
    }

    const deliveries = await db
      .select({
        id: schema.ppeDeliveries.id,
        organizationId: schema.ppeDeliveries.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
          cpf: schema.employees.cpf,
        },
        deliveryDate: schema.ppeDeliveries.deliveryDate,
        reason: schema.ppeDeliveries.reason,
        deliveredBy: schema.ppeDeliveries.deliveredBy,
        createdAt: schema.ppeDeliveries.createdAt,
        updatedAt: schema.ppeDeliveries.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.ppeDeliveries)
      .innerJoin(
        schema.employees,
        eq(schema.ppeDeliveries.employeeId, schema.employees.id)
      )
      .innerJoin(creator, eq(schema.ppeDeliveries.createdBy, creator.id))
      .innerJoin(updater, eq(schema.ppeDeliveries.updatedBy, updater.id))
      .where(and(...conditions))
      .orderBy(schema.ppeDeliveries.deliveryDate);

    const enriched = await Promise.all(
      deliveries.map(async (d) => {
        const items = await PpeDeliveryService.getPpeItems(
          d.id,
          organizationId
        );
        return { ...d, items } as PpeDeliveryData;
      })
    );

    return enriched;
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<PpeDeliveryData> {
    const delivery = await PpeDeliveryService.findById(id, organizationId);
    if (!delivery) {
      throw new PpeDeliveryNotFoundError(id);
    }
    return delivery;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdatePpeDeliveryInput
  ): Promise<PpeDeliveryData> {
    const { userId, ppeItemIds, ...data } = input;

    const existing = await PpeDeliveryService.findById(id, organizationId);
    if (!existing) {
      throw new PpeDeliveryNotFoundError(id);
    }

    const [updated] = await db
      .update(schema.ppeDeliveries)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.ppeDeliveries.id, id),
          eq(schema.ppeDeliveries.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "ppe_delivery",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        ignoredFields: PPE_DELIVERY_IGNORED_FIELDS,
      }),
    });

    if (ppeItemIds !== undefined) {
      await PpeDeliveryService.replacePpeItems(
        id,
        organizationId,
        ppeItemIds,
        userId
      );
    }

    return PpeDeliveryService.findByIdOrThrow(id, organizationId);
  }

  private static async replacePpeItems(
    ppeDeliveryId: string,
    organizationId: string,
    newPpeItemIds: string[],
    userId: string
  ): Promise<void> {
    for (const ppeItemId of newPpeItemIds) {
      const [ppeItem] = await db
        .select()
        .from(schema.ppeItems)
        .where(
          and(
            eq(schema.ppeItems.id, ppeItemId),
            eq(schema.ppeItems.organizationId, organizationId),
            isNull(schema.ppeItems.deletedAt)
          )
        )
        .limit(1);

      if (!ppeItem) {
        throw new PpeDeliveryPpeItemNotFoundError(ppeItemId);
      }
    }

    const currentItems = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(
        and(
          eq(schema.ppeDeliveryItems.ppeDeliveryId, ppeDeliveryId),
          eq(schema.ppeDeliveryItems.organizationId, organizationId),
          isNull(schema.ppeDeliveryItems.deletedAt)
        )
      );

    const currentIds = new Set(currentItems.map((i) => i.ppeItemId));
    const newIds = new Set(newPpeItemIds);

    for (const item of currentItems) {
      if (!newIds.has(item.ppeItemId)) {
        const [removed] = await db
          .update(schema.ppeDeliveryItems)
          .set({ deletedAt: new Date() })
          .where(eq(schema.ppeDeliveryItems.id, item.id))
          .returning();

        await PpeDeliveryService.createLog({
          ppeDeliveryId,
          ppeItemId: item.ppeItemId,
          action: "REMOVED",
          userId,
          description: "Removido via atualização da entrega",
        });

        await AuditService.log({
          action: "delete",
          resource: "ppe_delivery_item",
          resourceId: removed.id,
          userId,
          organizationId,
          changes: buildAuditChanges(item, {}),
        });
      }
    }

    for (const ppeItemId of newPpeItemIds) {
      if (!currentIds.has(ppeItemId)) {
        const [association] = await db
          .insert(schema.ppeDeliveryItems)
          .values({
            id: `ppe-delivery-item-${crypto.randomUUID()}`,
            organizationId,
            ppeDeliveryId,
            ppeItemId,
            createdBy: userId,
          })
          .returning();

        await PpeDeliveryService.createLog({
          ppeDeliveryId,
          ppeItemId,
          action: "ADDED",
          userId,
          description: "Adicionado via atualização da entrega",
        });

        await AuditService.log({
          action: "create",
          resource: "ppe_delivery_item",
          resourceId: association.id,
          userId,
          organizationId,
          changes: buildAuditChanges({}, association),
        });
      }
    }
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedPpeDeliveryData> {
    const existing = await PpeDeliveryService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new PpeDeliveryNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new PpeDeliveryAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.ppeDeliveries)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.ppeDeliveries.id, id),
          eq(schema.ppeDeliveries.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "ppe_delivery",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        { ignoredFields: PPE_DELIVERY_IGNORED_FIELDS }
      ),
    });

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
    };
  }

  // M2M PPE Item methods

  static async addPpeItem(
    ppeDeliveryId: string,
    ppeItemId: string,
    organizationId: string,
    userId: string
  ): Promise<{ ppeDeliveryId: string; ppeItemId: string; createdAt: Date }> {
    const delivery = await PpeDeliveryService.findById(
      ppeDeliveryId,
      organizationId
    );
    if (!delivery) {
      throw new PpeDeliveryNotFoundError(ppeDeliveryId);
    }

    const [ppeItem] = await db
      .select()
      .from(schema.ppeItems)
      .where(
        and(
          eq(schema.ppeItems.id, ppeItemId),
          eq(schema.ppeItems.organizationId, organizationId),
          isNull(schema.ppeItems.deletedAt)
        )
      )
      .limit(1);

    if (!ppeItem) {
      throw new PpeDeliveryPpeItemNotFoundError(ppeItemId);
    }

    const [existing] = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(
        and(
          eq(schema.ppeDeliveryItems.ppeDeliveryId, ppeDeliveryId),
          eq(schema.ppeDeliveryItems.ppeItemId, ppeItemId),
          isNull(schema.ppeDeliveryItems.deletedAt)
        )
      )
      .limit(1);

    if (existing) {
      throw new PpeDeliveryItemAlreadyExistsError(ppeDeliveryId, ppeItemId);
    }

    const associationId = `ppe-delivery-item-${crypto.randomUUID()}`;

    const [association] = await db
      .insert(schema.ppeDeliveryItems)
      .values({
        id: associationId,
        organizationId,
        ppeDeliveryId,
        ppeItemId,
        createdBy: userId,
      })
      .returning();

    await PpeDeliveryService.createLog({
      ppeDeliveryId,
      ppeItemId,
      action: "ADDED",
      userId,
      description: "Adicionado manualmente à entrega",
    });

    await AuditService.log({
      action: "create",
      resource: "ppe_delivery_item",
      resourceId: association.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, association),
    });

    return {
      ppeDeliveryId: association.ppeDeliveryId,
      ppeItemId: association.ppeItemId,
      createdAt: association.createdAt,
    };
  }

  static async removePpeItem(
    ppeDeliveryId: string,
    ppeItemId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    const delivery = await PpeDeliveryService.findById(
      ppeDeliveryId,
      organizationId
    );
    if (!delivery) {
      throw new PpeDeliveryNotFoundError(ppeDeliveryId);
    }

    const [association] = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(
        and(
          eq(schema.ppeDeliveryItems.ppeDeliveryId, ppeDeliveryId),
          eq(schema.ppeDeliveryItems.ppeItemId, ppeItemId),
          eq(schema.ppeDeliveryItems.organizationId, organizationId),
          isNull(schema.ppeDeliveryItems.deletedAt)
        )
      )
      .limit(1);

    if (!association) {
      throw new PpeDeliveryItemNotFoundError(ppeDeliveryId, ppeItemId);
    }

    await PpeDeliveryService.createLog({
      ppeDeliveryId,
      ppeItemId,
      action: "REMOVED",
      userId,
      description: "Removido da entrega",
    });

    const [removed] = await db
      .update(schema.ppeDeliveryItems)
      .set({
        deletedAt: new Date(),
      })
      .where(eq(schema.ppeDeliveryItems.id, association.id))
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "ppe_delivery_item",
      resourceId: removed.id,
      userId,
      organizationId,
      changes: buildAuditChanges(association, {}),
    });
  }

  static async getItemsForDelivery(
    ppeDeliveryId: string,
    organizationId: string
  ): Promise<PpeItemData[]> {
    const delivery = await PpeDeliveryService.findById(
      ppeDeliveryId,
      organizationId
    );
    if (!delivery) {
      throw new PpeDeliveryNotFoundError(ppeDeliveryId);
    }

    return PpeDeliveryService.getPpeItems(ppeDeliveryId, organizationId);
  }
}
