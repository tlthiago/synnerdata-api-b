import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
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

type PpeDeliveryRaw = typeof schema.ppeDeliveries.$inferSelect;
type EmployeeData = { id: string; name: string; cpf: string };
type PpeItemData = { id: string; name: string; equipment: string };

export abstract class PpeDeliveryService {
  private static async getEmployee(
    employeeId: string,
    organizationId: string
  ): Promise<EmployeeData | null> {
    const [employee] = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
        cpf: schema.employees.cpf,
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .limit(1);

    return employee ?? null;
  }

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

  private static async enrichDelivery(
    delivery: PpeDeliveryRaw,
    organizationId: string
  ): Promise<PpeDeliveryData> {
    const [employee, items] = await Promise.all([
      PpeDeliveryService.getEmployee(delivery.employeeId, organizationId),
      PpeDeliveryService.getPpeItems(delivery.id, organizationId),
    ]);

    return {
      id: delivery.id,
      organizationId: delivery.organizationId,
      employee: employee ?? { id: delivery.employeeId, name: "", cpf: "" },
      deliveryDate: delivery.deliveryDate,
      reason: delivery.reason,
      deliveredBy: delivery.deliveredBy,
      items,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    };
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<PpeDeliveryRaw | null> {
    const [delivery] = await db
      .select()
      .from(schema.ppeDeliveries)
      .where(
        and(
          eq(schema.ppeDeliveries.id, id),
          eq(schema.ppeDeliveries.organizationId, organizationId),
          isNull(schema.ppeDeliveries.deletedAt)
        )
      )
      .limit(1);

    return delivery ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(PpeDeliveryRaw & { deletedAt: Date | null }) | null> {
    const [delivery] = await db
      .select()
      .from(schema.ppeDeliveries)
      .where(
        and(
          eq(schema.ppeDeliveries.id, id),
          eq(schema.ppeDeliveries.organizationId, organizationId)
        )
      )
      .limit(1);

    return delivery ?? null;
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

    // Verify employee exists
    const employee = await PpeDeliveryService.getEmployee(
      data.employeeId,
      organizationId
    );
    if (!employee) {
      throw new PpeDeliveryEmployeeNotFoundError(data.employeeId);
    }

    // Verify all PPE Items exist if provided
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
      })
      .returning();

    // Add PPE Items if provided
    if (ppeItemIds && ppeItemIds.length > 0) {
      for (const ppeItemId of ppeItemIds) {
        const itemId = `ppe-delivery-item-${crypto.randomUUID()}`;

        await db.insert(schema.ppeDeliveryItems).values({
          id: itemId,
          organizationId,
          ppeDeliveryId,
          ppeItemId,
          createdBy: userId,
        });

        // Create log for each item added
        await PpeDeliveryService.createLog({
          ppeDeliveryId,
          ppeItemId,
          action: "ADDED",
          userId,
          description: "Adicionado na criação da entrega",
        });
      }
    }

    return PpeDeliveryService.enrichDelivery(delivery, organizationId);
  }

  static async findAll(
    organizationId: string,
    employeeId?: string
  ): Promise<PpeDeliveryData[]> {
    const conditions = [
      eq(schema.ppeDeliveries.organizationId, organizationId),
      isNull(schema.ppeDeliveries.deletedAt),
    ];

    if (employeeId) {
      conditions.push(eq(schema.ppeDeliveries.employeeId, employeeId));
    }

    const deliveries = await db
      .select()
      .from(schema.ppeDeliveries)
      .where(and(...conditions))
      .orderBy(schema.ppeDeliveries.deliveryDate);

    const enriched = await Promise.all(
      deliveries.map((d) =>
        PpeDeliveryService.enrichDelivery(d, organizationId)
      )
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
    return PpeDeliveryService.enrichDelivery(delivery, organizationId);
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdatePpeDeliveryInput
  ): Promise<PpeDeliveryData> {
    const { userId, ...data } = input;

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

    return PpeDeliveryService.enrichDelivery(updated, organizationId);
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
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.ppeDeliveries.id, id),
          eq(schema.ppeDeliveries.organizationId, organizationId)
        )
      )
      .returning();

    const enriched = await PpeDeliveryService.enrichDelivery(
      deleted,
      organizationId
    );

    return {
      ...enriched,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    };
  }

  // M2M PPE Item methods

  static async addPpeItem(
    ppeDeliveryId: string,
    ppeItemId: string,
    organizationId: string,
    userId: string
  ): Promise<{ ppeDeliveryId: string; ppeItemId: string; createdAt: Date }> {
    // Verify PPE Delivery exists
    const delivery = await PpeDeliveryService.findById(
      ppeDeliveryId,
      organizationId
    );
    if (!delivery) {
      throw new PpeDeliveryNotFoundError(ppeDeliveryId);
    }

    // Verify PPE Item exists
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

    // Check if association already exists (active)
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

    const id = `ppe-delivery-item-${crypto.randomUUID()}`;

    const [association] = await db
      .insert(schema.ppeDeliveryItems)
      .values({
        id,
        organizationId,
        ppeDeliveryId,
        ppeItemId,
        createdBy: userId,
      })
      .returning();

    // Create log
    await PpeDeliveryService.createLog({
      ppeDeliveryId,
      ppeItemId,
      action: "ADDED",
      userId,
      description: "Adicionado manualmente à entrega",
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
    // Verify PPE Delivery exists
    const delivery = await PpeDeliveryService.findById(
      ppeDeliveryId,
      organizationId
    );
    if (!delivery) {
      throw new PpeDeliveryNotFoundError(ppeDeliveryId);
    }

    // Find active association
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

    // Create log before removing
    await PpeDeliveryService.createLog({
      ppeDeliveryId,
      ppeItemId,
      action: "REMOVED",
      userId,
      description: "Removido da entrega",
    });

    // Soft delete the association
    await db
      .update(schema.ppeDeliveryItems)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(schema.ppeDeliveryItems.id, association.id));
  }

  static async getItemsForDelivery(
    ppeDeliveryId: string,
    organizationId: string
  ): Promise<PpeItemData[]> {
    // Verify PPE Delivery exists
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
