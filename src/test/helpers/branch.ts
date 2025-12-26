import type { BranchData } from "@/modules/organization/branches/branch.model";
import { BranchService } from "@/modules/organization/branches/branch.service";
import {
  faker,
  generateCep,
  generateCnpj,
  generateMobile,
  generateState,
} from "./faker";

type CreateTestBranchOptions = {
  organizationId: string;
  userId: string;
  name?: string;
  taxId?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  mobile?: string;
  foundedAt?: string;
};

/**
 * Creates a test branch using the BranchService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 */
export async function createTestBranch(
  options: CreateTestBranchOptions
): Promise<BranchData> {
  const { organizationId, userId, ...overrides } = options;

  return await BranchService.create({
    organizationId,
    userId,
    name: overrides.name ?? `Filial ${faker.location.city()}`,
    taxId: overrides.taxId ?? generateCnpj(),
    street: overrides.street ?? faker.location.street(),
    number: overrides.number ?? faker.location.buildingNumber(),
    complement: overrides.complement,
    neighborhood: overrides.neighborhood ?? faker.location.county(),
    city: overrides.city ?? faker.location.city(),
    state: overrides.state ?? generateState(),
    zipCode: overrides.zipCode ?? generateCep(),
    phone: overrides.phone,
    mobile: overrides.mobile ?? generateMobile(),
    foundedAt: overrides.foundedAt,
  });
}

type CreateMultipleBranchesOptions = {
  organizationId: string;
  userId: string;
  count: number;
};

/**
 * Creates multiple test branches.
 */
export async function createTestBranches(
  options: CreateMultipleBranchesOptions
): Promise<BranchData[]> {
  const { organizationId, userId, count } = options;
  const branches: BranchData[] = [];

  for (let i = 0; i < count; i++) {
    const branch = await createTestBranch({ organizationId, userId });
    branches.push(branch);
  }

  return branches;
}
