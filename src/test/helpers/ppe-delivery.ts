import type { PpeDeliveryData } from "@/modules/organization/ppe-deliveries/ppe-delivery.model";
import { PpeDeliveryService } from "@/modules/organization/ppe-deliveries/ppe-delivery.service";
import { createTestEmployee } from "./employee";
import { faker } from "./faker";
import { createTestPpeItem } from "./ppe-item";

const DELIVERY_REASONS = [
  "Admissão",
  "Substituição por desgaste",
  "Substituição por perda",
  "Substituição por dano",
  "Renovação periódica",
  "Troca de função",
  "Atualização de norma",
];

type CreateTestPpeDeliveryOptions = {
  organizationId: string;
  userId: string;
  employeeId?: string;
  deliveryDate?: string;
  reason?: string;
  deliveredBy?: string;
  ppeItemIds?: string[];
  ppeItemCount?: number;
};

/**
 * Creates a test PPE delivery using the PpeDeliveryService.
 * If employeeId is not provided, a test employee will be created.
 * If ppeItemIds is not provided but ppeItemCount is, test PPE items will be created.
 */
export async function createTestPpeDelivery(
  options: CreateTestPpeDeliveryOptions
): Promise<PpeDeliveryData> {
  const { organizationId, userId } = options;
  let { employeeId, ppeItemIds } = options;

  // Create employee if not provided
  if (!employeeId) {
    const { employee } = await createTestEmployee({
      organizationId,
      userId,
    });
    employeeId = employee.id;
  }

  // Create PPE items if ppeItemCount is provided
  if (!ppeItemIds && options.ppeItemCount && options.ppeItemCount > 0) {
    ppeItemIds = [];
    for (let i = 0; i < options.ppeItemCount; i++) {
      const ppeItem = await createTestPpeItem({
        organizationId,
        userId,
      });
      ppeItemIds.push(ppeItem.id);
    }
  }

  const deliveryDate =
    options.deliveryDate ??
    faker.date.recent({ days: 30 }).toISOString().split("T")[0];
  const reason = options.reason ?? faker.helpers.arrayElement(DELIVERY_REASONS);
  const deliveredBy =
    options.deliveredBy ??
    `${faker.person.firstName()} ${faker.person.lastName()}`;

  return await PpeDeliveryService.create({
    organizationId,
    userId,
    employeeId,
    deliveryDate,
    reason,
    deliveredBy,
    ppeItemIds,
  });
}

type CreateMultiplePpeDeliveriesOptions = {
  organizationId: string;
  userId: string;
  count: number;
  employeeId?: string;
};

/**
 * Creates multiple test PPE deliveries.
 */
export async function createTestPpeDeliveries(
  options: CreateMultiplePpeDeliveriesOptions
): Promise<PpeDeliveryData[]> {
  const { organizationId, userId, count } = options;
  let { employeeId } = options;
  const deliveries: PpeDeliveryData[] = [];

  // Create shared employee if not provided
  if (!employeeId) {
    const { employee } = await createTestEmployee({
      organizationId,
      userId,
    });
    employeeId = employee.id;
  }

  for (let i = 0; i < count; i++) {
    const delivery = await createTestPpeDelivery({
      organizationId,
      userId,
      employeeId,
    });
    deliveries.push(delivery);
  }

  return deliveries;
}
