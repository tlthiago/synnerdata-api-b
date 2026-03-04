import type { EmployeeData } from "@/modules/employees/employee.model";
import { EmployeeService } from "@/modules/employees/employee.service";
import {
  faker,
  generateAdultBirthDate,
  generateCep,
  generateCpf,
  generateHireDate,
  generateMobile,
  generatePis,
  generateState,
} from "./faker";
import { createTestJobClassification } from "./job-classification";
import { createTestJobPosition } from "./job-position";
import { createTestSector } from "./sector";

type EmployeeDependencies = {
  sectorId: string;
  jobPositionId: string;
  jobClassificationId: string;
  branchId?: string;
  costCenterId?: string;
};

type EmployeeOverrides = {
  name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  birthDate?: string;
  gender?: "MALE" | "FEMALE" | "NOT_DECLARED" | "OTHER";
  maritalStatus?:
    | "SINGLE"
    | "MARRIED"
    | "DIVORCED"
    | "WIDOWED"
    | "STABLE_UNION"
    | "SEPARATED";
  birthplace?: string;
  nationality?: string;
  height?: number;
  weight?: number;
  fatherName?: string;
  motherName?: string;
  cpf?: string;
  identityCard?: string;
  pis?: string;
  workPermitNumber?: string;
  workPermitSeries?: string;
  militaryCertificate?: string;
  street?: string;
  streetNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  hireDate?: string;
  contractType?: "CLT" | "PJ";
  salary?: number;
  manager?: string;
  workShift?: "TWELVE_THIRTY_SIX" | "SIX_ONE" | "FIVE_TWO" | "FOUR_THREE";
  weeklyHours?: number;
  busCount?: number;
  mealAllowance?: number;
  transportAllowance?: number;
  educationLevel?:
    | "ELEMENTARY"
    | "HIGH_SCHOOL"
    | "BACHELOR"
    | "POST_GRADUATE"
    | "MASTER"
    | "DOCTORATE";
  hasSpecialNeeds?: boolean;
  disabilityType?: string;
  hasChildren?: boolean;
  childrenCount?: number;
  hasChildrenUnder21?: boolean;
};

type CreateTestEmployeeOptions = {
  organizationId: string;
  userId: string;
  dependencies?: Partial<EmployeeDependencies>;
} & EmployeeOverrides;

type CreateTestEmployeeResult = {
  employee: EmployeeData;
  dependencies: EmployeeDependencies;
};

// Helper functions to generate fake data for each section
function generatePersonalData(overrides: EmployeeOverrides) {
  const gender =
    overrides.gender ?? faker.helpers.arrayElement(["MALE", "FEMALE"] as const);
  const firstName =
    gender === "MALE"
      ? faker.person.firstName("male")
      : faker.person.firstName("female");
  const lastName = faker.person.lastName();

  return {
    name: overrides.name ?? `${firstName} ${lastName}`,
    email:
      overrides.email ??
      faker.internet.email({ firstName, lastName }).toLowerCase(),
    phone: overrides.phone,
    mobile: overrides.mobile ?? generateMobile(),
    birthDate: overrides.birthDate ?? generateAdultBirthDate(),
    gender,
    maritalStatus:
      overrides.maritalStatus ??
      faker.helpers.arrayElement(["SINGLE", "MARRIED", "DIVORCED"] as const),
    birthplace: overrides.birthplace ?? faker.location.city(),
    nationality: overrides.nationality ?? "Brasileiro(a)",
    height: overrides.height,
    weight: overrides.weight,
    fatherName: overrides.fatherName,
    motherName:
      overrides.motherName ??
      `${faker.person.firstName("female")} ${faker.person.lastName()}`,
  };
}

function generateDocuments(overrides: EmployeeOverrides) {
  return {
    cpf: overrides.cpf ?? generateCpf(),
    identityCard: overrides.identityCard ?? faker.string.numeric(9),
    pis: overrides.pis ?? generatePis(),
    workPermitNumber: overrides.workPermitNumber ?? faker.string.numeric(7),
    workPermitSeries: overrides.workPermitSeries ?? faker.string.numeric(4),
    militaryCertificate: overrides.militaryCertificate,
  };
}

function generateAddress(overrides: EmployeeOverrides) {
  return {
    street: overrides.street ?? faker.location.street(),
    streetNumber: overrides.streetNumber ?? faker.location.buildingNumber(),
    complement: overrides.complement,
    neighborhood: overrides.neighborhood ?? faker.location.county(),
    city: overrides.city ?? faker.location.city(),
    state: overrides.state ?? generateState(),
    zipCode: overrides.zipCode ?? generateCep(),
    latitude: overrides.latitude,
    longitude: overrides.longitude,
  };
}

function generateEmploymentData(
  overrides: EmployeeOverrides,
  deps: EmployeeDependencies
) {
  return {
    hireDate: overrides.hireDate ?? generateHireDate(),
    contractType: overrides.contractType ?? ("CLT" as const),
    salary:
      overrides.salary ??
      faker.number.float({ min: 1500, max: 15_000, fractionDigits: 2 }),
    manager: overrides.manager,
    branchId: deps.branchId,
    sectorId: deps.sectorId,
    costCenterId: deps.costCenterId,
    jobPositionId: deps.jobPositionId,
    jobClassificationId: deps.jobClassificationId,
    workShift:
      overrides.workShift ??
      faker.helpers.arrayElement(["FIVE_TWO", "SIX_ONE"] as const),
    weeklyHours: overrides.weeklyHours ?? 44,
    busCount: overrides.busCount,
    mealAllowance: overrides.mealAllowance,
    transportAllowance: overrides.transportAllowance,
    educationLevel:
      overrides.educationLevel ??
      faker.helpers.arrayElement(["HIGH_SCHOOL", "BACHELOR"] as const),
    hasSpecialNeeds: overrides.hasSpecialNeeds ?? false,
    disabilityType: overrides.disabilityType,
    hasChildren: overrides.hasChildren ?? false,
    childrenCount: overrides.childrenCount,
    hasChildrenUnder21: overrides.hasChildrenUnder21,
  };
}

async function ensureSubscriptionExists(organizationId: string) {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const { schema } = await import("@/db/schema");
  const { PlanFactory } = await import(
    "@/test/factories/payments/plan.factory"
  );
  const { SubscriptionFactory } = await import(
    "@/test/factories/payments/subscription.factory"
  );

  const [existing] = await db
    .select({ id: schema.orgSubscriptions.id })
    .from(schema.orgSubscriptions)
    .where(eq(schema.orgSubscriptions.organizationId, organizationId))
    .limit(1);

  if (!existing) {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const firstTier = PlanFactory.getFirstTier({ plan, tiers });
    await SubscriptionFactory.createActive(organizationId, plan.id, {
      pricingTierId: firstTier.id,
    });
  }
}

async function resolveDependencies(
  organizationId: string,
  userId: string,
  deps: Partial<EmployeeDependencies> = {}
): Promise<EmployeeDependencies> {
  const sectorId =
    deps.sectorId ?? (await createTestSector({ organizationId, userId })).id;
  const jobPositionId =
    deps.jobPositionId ??
    (await createTestJobPosition({ organizationId, userId })).id;
  const jobClassificationId =
    deps.jobClassificationId ??
    (await createTestJobClassification({ organizationId, userId })).id;

  return {
    sectorId,
    jobPositionId,
    jobClassificationId,
    branchId: deps.branchId,
    costCenterId: deps.costCenterId,
  };
}

/**
 * Creates a test employee using the EmployeeService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 *
 * If dependencies (sector, jobPosition, jobClassification) are not provided,
 * they will be created automatically.
 */
export async function createTestEmployee(
  options: CreateTestEmployeeOptions
): Promise<CreateTestEmployeeResult> {
  const { organizationId, userId, dependencies = {}, ...overrides } = options;

  await ensureSubscriptionExists(organizationId);

  const resolvedDeps = await resolveDependencies(
    organizationId,
    userId,
    dependencies
  );

  const employee = await EmployeeService.create({
    organizationId,
    userId,
    ...generatePersonalData(overrides),
    ...generateDocuments(overrides),
    ...generateAddress(overrides),
    ...generateEmploymentData(overrides, resolvedDeps),
  });

  return { employee, dependencies: resolvedDeps };
}

type CreateMultipleEmployeesOptions = {
  organizationId: string;
  userId: string;
  count: number;
  sharedDependencies?: Partial<EmployeeDependencies>;
};

/**
 * Creates multiple test employees.
 * Pass sharedDependencies to reuse the same sector, position, etc.
 */
export async function createTestEmployees(
  options: CreateMultipleEmployeesOptions
): Promise<CreateTestEmployeeResult[]> {
  const { organizationId, userId, count, sharedDependencies } = options;
  const results: CreateTestEmployeeResult[] = [];

  for (let i = 0; i < count; i++) {
    const result = await createTestEmployee({
      organizationId,
      userId,
      dependencies: sharedDependencies,
    });
    results.push(result);
  }

  return results;
}

/**
 * Creates a test employee with all required dependencies already set up.
 */
export async function createTestEmployeeWithDependencies(options: {
  organizationId: string;
  userId: string;
}): Promise<CreateTestEmployeeResult> {
  return await createTestEmployee(options);
}
