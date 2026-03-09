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
} from "@/test/helpers/faker";

type EmployeeDependencies = {
  sectorId: string;
  jobPositionId: string;
  jobClassificationId: string;
  branchId?: string;
  costCenterId?: string;
};

type EmployeeOverrides = Partial<{
  name: string;
  email: string;
  phone: string;
  mobile: string;
  birthDate: string;
  gender: "MALE" | "FEMALE" | "NOT_DECLARED" | "OTHER";
  maritalStatus:
    | "SINGLE"
    | "MARRIED"
    | "DIVORCED"
    | "WIDOWED"
    | "STABLE_UNION"
    | "SEPARATED";
  birthplace: string;
  nationality: string;
  height: number;
  weight: number;
  fatherName: string;
  motherName: string;
  cpf: string;
  identityCard: string;
  pis: string;
  workPermitNumber: string;
  workPermitSeries: string;
  militaryCertificate: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  hireDate: string;
  contractType: "CLT" | "PJ";
  salary: number;
  manager: string;
  workShift: "TWELVE_THIRTY_SIX" | "SIX_ONE" | "FIVE_TWO" | "FOUR_THREE";
  weeklyHours: number;
  busCount: number;
  mealAllowance: number;
  transportAllowance: number;
  healthInsurance: number;
  educationLevel:
    | "ELEMENTARY"
    | "HIGH_SCHOOL"
    | "BACHELOR"
    | "POST_GRADUATE"
    | "MASTER"
    | "DOCTORATE";
  hasSpecialNeeds: boolean;
  disabilityType:
    | "AUDITIVA"
    | "VISUAL"
    | "FISICA"
    | "INTELECTUAL"
    | "MENTAL"
    | "MULTIPLA";
  hasChildren: boolean;
  childrenCount: number;
  hasChildrenUnder21: boolean;
}>;

type CreateEmployeeOptions = {
  organizationId: string;
  userId: string;
  dependencies?: Partial<EmployeeDependencies>;
} & EmployeeOverrides;

type CreateEmployeeResult = {
  employee: EmployeeData;
  dependencies: EmployeeDependencies;
};

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
    healthInsurance: overrides.healthInsurance,
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

/**
 * Factory for creating test employees.
 * Follows Elysia's recommended pattern of abstract class with static methods.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern for test utilities
export abstract class EmployeeFactory {
  /**
   * Creates a test employee with all required dependencies.
   * Dependencies (sector, jobPosition, jobClassification) are created automatically if not provided.
   */
  static async create(
    options: CreateEmployeeOptions
  ): Promise<CreateEmployeeResult> {
    const { organizationId, userId, dependencies = {}, ...overrides } = options;

    const resolvedDeps = await EmployeeFactory.resolveDependencies(
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

  /**
   * Creates multiple test employees.
   * Pass sharedDependencies to reuse the same sector, position, etc.
   */
  static async createMany(options: {
    organizationId: string;
    userId: string;
    count: number;
    sharedDependencies?: Partial<EmployeeDependencies>;
  }): Promise<CreateEmployeeResult[]> {
    const { organizationId, userId, count, sharedDependencies } = options;
    const results: CreateEmployeeResult[] = [];

    // Resolve dependencies once for all employees
    const resolvedDeps = await EmployeeFactory.resolveDependencies(
      organizationId,
      userId,
      sharedDependencies ?? {}
    );

    for (let i = 0; i < count; i++) {
      const result = await EmployeeFactory.create({
        organizationId,
        userId,
        dependencies: resolvedDeps,
      });
      results.push(result);
    }

    return results;
  }

  private static async resolveDependencies(
    organizationId: string,
    userId: string,
    deps: Partial<EmployeeDependencies>
  ): Promise<EmployeeDependencies> {
    const { createTestSector } = await import("@/test/helpers/sector");
    const { createTestJobPosition } = await import(
      "@/test/helpers/job-position"
    );
    const { createTestJobClassification } = await import(
      "@/test/helpers/job-classification"
    );

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
}
