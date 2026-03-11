import type { PpeItemData } from "@/modules/organizations/ppe-items/ppe-item.model";
import { PpeItemService } from "@/modules/organizations/ppe-items/ppe-item.service";
import { faker } from "./faker";

type CreateTestPpeItemOptions = {
  organizationId: string;
  userId: string;
  name?: string;
  description?: string;
  equipment?: string;
};

const PPE_NAMES = [
  "Capacete de Segurança",
  "Óculos de Proteção",
  "Protetor Auricular",
  "Luvas de Segurança",
  "Botas de Segurança",
  "Colete Refletivo",
  "Máscara Respiratória",
  "Cinto de Segurança",
  "Avental de Proteção",
  "Protetor Facial",
];

/**
 * Creates a test PPE item using the PpeItemService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 */
export async function createTestPpeItem(
  options: CreateTestPpeItemOptions
): Promise<PpeItemData> {
  const { organizationId, userId, name, description, equipment } = options;

  const selectedName =
    name ??
    `${faker.helpers.arrayElement(PPE_NAMES)} ${crypto.randomUUID().slice(0, 8)}`;

  return await PpeItemService.create({
    organizationId,
    userId,
    name: selectedName,
    description: description ?? `Descrição do ${selectedName}`,
    equipment: equipment ?? faker.commerce.product(),
  });
}

type CreateMultiplePpeItemsOptions = {
  organizationId: string;
  userId: string;
  count: number;
};

/**
 * Creates multiple test PPE items with unique names.
 */
export async function createTestPpeItems(
  options: CreateMultiplePpeItemsOptions
): Promise<PpeItemData[]> {
  const { organizationId, userId, count } = options;
  const ppeItems: PpeItemData[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const baseName = PPE_NAMES[i % PPE_NAMES.length];
    const name = `${baseName} ${crypto.randomUUID().slice(0, 8)}`;
    usedNames.add(name);

    const ppeItem = await createTestPpeItem({
      organizationId,
      userId,
      name,
    });
    ppeItems.push(ppeItem);
  }

  return ppeItems;
}
