import type { CostCenterData } from "@/modules/organizations/cost-centers/cost-center.model";
import { CostCenterService } from "@/modules/organizations/cost-centers/cost-center.service";
import { faker } from "./faker";

type CreateTestCostCenterOptions = {
  organizationId: string;
  userId: string;
  name?: string;
};

/**
 * Creates a test cost center using the CostCenterService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 */
export async function createTestCostCenter(
  options: CreateTestCostCenterOptions
): Promise<CostCenterData> {
  const { organizationId, userId, name } = options;

  return await CostCenterService.create({
    organizationId,
    userId,
    name:
      name ??
      `${faker.helpers.arrayElement([
        "Administrativo",
        "Operacional",
        "Comercial",
        "Industrial",
        "Pesquisa e Desenvolvimento",
        "Marketing e Vendas",
        "Suporte Técnico",
        "Infraestrutura",
        "Projetos Especiais",
        "Treinamento",
        "Facilities",
        "TI Corporativo",
        "Controladoria",
        "Compliance",
        "Inovação",
      ])} ${crypto.randomUUID().slice(0, 8)}`,
  });
}

type CreateMultipleCostCentersOptions = {
  organizationId: string;
  userId: string;
  count: number;
};

/**
 * Creates multiple test cost centers with unique names.
 */
export async function createTestCostCenters(
  options: CreateMultipleCostCentersOptions
): Promise<CostCenterData[]> {
  const { organizationId, userId, count } = options;
  const costCenters: CostCenterData[] = [];
  const usedNames = new Set<string>();

  const costCenterNames = [
    "Administrativo",
    "Operacional",
    "Comercial",
    "Industrial",
    "Pesquisa e Desenvolvimento",
    "Marketing e Vendas",
    "Suporte Técnico",
    "Infraestrutura",
    "Projetos Especiais",
    "Treinamento",
    "Facilities",
    "TI Corporativo",
    "Controladoria",
    "Compliance",
    "Inovação",
  ];

  for (let i = 0; i < count; i++) {
    let name = costCenterNames[i % costCenterNames.length];
    if (usedNames.has(name)) {
      name = `${name} ${i + 1}`;
    }
    usedNames.add(name);

    const costCenter = await createTestCostCenter({
      organizationId,
      userId,
      name,
    });
    costCenters.push(costCenter);
  }

  return costCenters;
}
