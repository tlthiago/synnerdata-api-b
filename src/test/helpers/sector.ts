import type { SectorData } from "@/modules/organizations/sectors/sector.model";
import { SectorService } from "@/modules/organizations/sectors/sector.service";
import { faker } from "./faker";

type CreateTestSectorOptions = {
  organizationId: string;
  userId: string;
  name?: string;
};

/**
 * Creates a test sector using the SectorService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 */
export async function createTestSector(
  options: CreateTestSectorOptions
): Promise<SectorData> {
  const { organizationId, userId, name } = options;

  return await SectorService.create({
    organizationId,
    userId,
    name:
      name ??
      `${faker.helpers.arrayElement([
        "Recursos Humanos",
        "Financeiro",
        "Tecnologia da Informação",
        "Comercial",
        "Operações",
        "Marketing",
        "Jurídico",
        "Administrativo",
        "Produção",
        "Logística",
        "Qualidade",
        "Compras",
        "Manutenção",
        "Segurança do Trabalho",
        "Atendimento ao Cliente",
      ])} ${crypto.randomUUID().slice(0, 8)}`,
  });
}

type CreateMultipleSectorsOptions = {
  organizationId: string;
  userId: string;
  count: number;
};

/**
 * Creates multiple test sectors with unique names.
 */
export async function createTestSectors(
  options: CreateMultipleSectorsOptions
): Promise<SectorData[]> {
  const { organizationId, userId, count } = options;
  const sectors: SectorData[] = [];
  const usedNames = new Set<string>();

  const sectorNames = [
    "Recursos Humanos",
    "Financeiro",
    "Tecnologia da Informação",
    "Comercial",
    "Operações",
    "Marketing",
    "Jurídico",
    "Administrativo",
    "Produção",
    "Logística",
    "Qualidade",
    "Compras",
    "Manutenção",
    "Segurança do Trabalho",
    "Atendimento ao Cliente",
  ];

  for (let i = 0; i < count; i++) {
    let name = sectorNames[i % sectorNames.length];
    if (usedNames.has(name)) {
      name = `${name} ${i + 1}`;
    }
    usedNames.add(name);

    const sector = await createTestSector({ organizationId, userId, name });
    sectors.push(sector);
  }

  return sectors;
}
