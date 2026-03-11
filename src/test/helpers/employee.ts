import type { EmployeeData } from "@/modules/employees/employee.model";
import { EmployeeService } from "@/modules/employees/employee.service";
import {
  faker,
  generateAdultBirthDate,
  generateCep,
  generateCpf,
  generateHireDate,
  generateLatitude,
  generateLongitude,
  generateMobile,
  generatePastDateFrom,
  generatePhone,
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
  healthInsurance?: number;
  educationLevel?:
    | "ELEMENTARY"
    | "HIGH_SCHOOL"
    | "BACHELOR"
    | "POST_GRADUATE"
    | "MASTER"
    | "DOCTORATE";
  hasSpecialNeeds?: boolean;
  disabilityType?:
    | "AUDITIVA"
    | "VISUAL"
    | "FISICA"
    | "INTELECTUAL"
    | "MENTAL"
    | "MULTIPLA";
  hasChildren?: boolean;
  childrenCount?: number;
  hasChildrenUnder21?: boolean;
  lastHealthExamDate?: string;
  admissionExamDate?: string;
  terminationExamDate?: string;
  probation1ExpiryDate?: string;
  probation2ExpiryDate?: string;
  acquisitionPeriodStart?: string | null;
  acquisitionPeriodEnd?: string | null;
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

// --- Completeness profiles ---

type CompletenessProfile = "minimal" | "partial" | "complete";

function pickCompletenessProfile(): CompletenessProfile {
  const roll = Math.random();
  if (roll < 0.3) {
    return "minimal";
  }
  if (roll < 0.8) {
    return "partial";
  }
  return "complete";
}

function maybe<T>(
  profile: CompletenessProfile,
  generator: () => T
): T | undefined {
  if (profile === "minimal") {
    return;
  }
  if (profile === "complete") {
    return generator();
  }
  return Math.random() < 0.5 ? generator() : undefined;
}

// --- Data generators ---

function generatePersonalData(
  overrides: EmployeeOverrides,
  profile: CompletenessProfile
) {
  const gender =
    overrides.gender ??
    faker.helpers.weightedArrayElement([
      { value: "MALE" as const, weight: 45 },
      { value: "FEMALE" as const, weight: 45 },
      { value: "NOT_DECLARED" as const, weight: 5 },
      { value: "OTHER" as const, weight: 5 },
    ]);
  const firstName =
    gender === "MALE" || gender === "OTHER"
      ? faker.person.firstName("male")
      : faker.person.firstName("female");
  const lastName = faker.person.lastName();

  return {
    name: overrides.name ?? `${firstName} ${lastName}`,
    email:
      overrides.email ??
      maybe(profile, () =>
        faker.internet.email({ firstName, lastName }).toLowerCase()
      ),
    phone: overrides.phone ?? maybe(profile, generatePhone),
    mobile: overrides.mobile ?? maybe(profile, generateMobile),
    birthDate: overrides.birthDate ?? generateAdultBirthDate(),
    gender,
    maritalStatus:
      overrides.maritalStatus ??
      faker.helpers.arrayElement([
        "SINGLE",
        "MARRIED",
        "DIVORCED",
        "WIDOWED",
        "STABLE_UNION",
        "SEPARATED",
      ] as const),
    birthplace:
      overrides.birthplace ?? maybe(profile, () => faker.location.city()),
    nationality: overrides.nationality ?? "Brasileiro(a)",
    height:
      overrides.height ??
      maybe(profile, () =>
        faker.number.float({ min: 1.5, max: 2.0, fractionDigits: 2 })
      ),
    weight:
      overrides.weight ??
      maybe(profile, () =>
        faker.number.float({ min: 50, max: 120, fractionDigits: 2 })
      ),
    fatherName:
      overrides.fatherName ??
      maybe(
        profile,
        () => `${faker.person.firstName("male")} ${faker.person.lastName()}`
      ),
    motherName:
      overrides.motherName ??
      maybe(
        profile,
        () => `${faker.person.firstName("female")} ${faker.person.lastName()}`
      ),
  };
}

function generateDocuments(
  overrides: EmployeeOverrides,
  profile: CompletenessProfile,
  gender: string
) {
  return {
    cpf: overrides.cpf ?? generateCpf(),
    identityCard:
      overrides.identityCard ?? maybe(profile, () => faker.string.numeric(9)),
    pis: overrides.pis ?? maybe(profile, generatePis),
    workPermitNumber:
      overrides.workPermitNumber ??
      maybe(profile, () => faker.string.numeric(7)),
    workPermitSeries:
      overrides.workPermitSeries ??
      maybe(profile, () => faker.string.numeric(4)),
    militaryCertificate:
      overrides.militaryCertificate ??
      (gender === "MALE"
        ? maybe(profile, () => faker.string.numeric(12))
        : undefined),
  };
}

function generateAddress(
  overrides: EmployeeOverrides,
  profile: CompletenessProfile
) {
  return {
    street: overrides.street ?? faker.location.street(),
    streetNumber: overrides.streetNumber ?? faker.location.buildingNumber(),
    complement:
      overrides.complement ??
      maybe(profile, () =>
        faker.helpers.arrayElement([
          "Apto 101",
          "Bloco B",
          "Casa 2",
          "Sala 305",
          "Fundos",
          "2º andar",
        ])
      ),
    neighborhood: overrides.neighborhood ?? faker.location.county(),
    city: overrides.city ?? faker.location.city(),
    state: overrides.state ?? generateState(),
    zipCode: overrides.zipCode ?? generateCep(),
    latitude: overrides.latitude ?? maybe(profile, generateLatitude),
    longitude: overrides.longitude ?? maybe(profile, generateLongitude),
  };
}

function generateFamilyData(
  overrides: EmployeeOverrides,
  profile: CompletenessProfile
) {
  const hasChildren =
    overrides.hasChildren ?? (profile !== "minimal" && Math.random() < 0.4);

  return {
    hasChildren,
    childrenCount: hasChildren
      ? (overrides.childrenCount ?? faker.number.int({ min: 1, max: 5 }))
      : undefined,
    hasChildrenUnder21: hasChildren
      ? (overrides.hasChildrenUnder21 ?? faker.datatype.boolean())
      : undefined,
  };
}

function generateDisabilityData(
  overrides: EmployeeOverrides,
  profile: CompletenessProfile
) {
  const hasSpecialNeeds =
    overrides.hasSpecialNeeds ??
    (profile !== "minimal" && Math.random() < 0.05);

  return {
    hasSpecialNeeds,
    disabilityType:
      overrides.disabilityType ??
      (hasSpecialNeeds
        ? faker.helpers.arrayElement([
            "AUDITIVA",
            "VISUAL",
            "FISICA",
            "INTELECTUAL",
            "MENTAL",
            "MULTIPLA",
          ] as const)
        : undefined),
  };
}

function generateHealthDates(
  overrides: EmployeeOverrides,
  profile: CompletenessProfile,
  hireDate: string
) {
  const admissionExamDate =
    overrides.admissionExamDate ??
    maybe(profile, () => generatePastDateFrom(hireDate, 7));

  const probation1ExpiryDate =
    overrides.probation1ExpiryDate ??
    maybe(profile, () => generatePastDateFrom(hireDate, 45));

  return {
    lastHealthExamDate:
      overrides.lastHealthExamDate ??
      maybe(profile, () => {
        const date = faker.date.recent({ days: 365 });
        return date.toISOString().split("T")[0];
      }),
    admissionExamDate,
    terminationExamDate: overrides.terminationExamDate,
    probation1ExpiryDate,
    probation2ExpiryDate:
      overrides.probation2ExpiryDate ??
      (probation1ExpiryDate
        ? maybe(profile, () => generatePastDateFrom(hireDate, 90))
        : undefined),
  };
}

function generateAcquisitionPeriod(
  overrides: EmployeeOverrides,
  profile: CompletenessProfile,
  hireDate: string
) {
  // null = explicitly skip generation
  if (
    overrides.acquisitionPeriodStart === null ||
    overrides.acquisitionPeriodEnd === null
  ) {
    return {
      acquisitionPeriodStart: undefined,
      acquisitionPeriodEnd: undefined,
    };
  }

  const shouldGenerate =
    profile === "complete" || (profile === "partial" && Math.random() < 0.3);

  return {
    acquisitionPeriodStart:
      overrides.acquisitionPeriodStart ??
      (shouldGenerate ? hireDate : undefined),
    acquisitionPeriodEnd:
      overrides.acquisitionPeriodEnd ??
      (shouldGenerate ? generatePastDateFrom(hireDate, 365) : undefined),
  };
}

const WEEKLY_HOURS_BY_SHIFT: Record<string, number> = {
  TWELVE_THIRTY_SIX: 36,
  SIX_ONE: 36,
  FIVE_TWO: 44,
  FOUR_THREE: 36,
};

function generateEmploymentData(
  overrides: EmployeeOverrides,
  deps: EmployeeDependencies,
  profile: CompletenessProfile
) {
  const hireDate = overrides.hireDate ?? generateHireDate();

  const workShift =
    overrides.workShift ??
    maybe(profile, () =>
      faker.helpers.arrayElement([
        "TWELVE_THIRTY_SIX",
        "SIX_ONE",
        "FIVE_TWO",
        "FOUR_THREE",
      ] as const)
    );

  return {
    hireDate,
    contractType:
      overrides.contractType ??
      faker.helpers.weightedArrayElement([
        { value: "CLT" as const, weight: 85 },
        { value: "PJ" as const, weight: 15 },
      ]),
    salary:
      overrides.salary ??
      faker.number.float({ min: 1500, max: 15_000, fractionDigits: 2 }),
    manager:
      overrides.manager ??
      maybe(
        profile,
        () => `${faker.person.firstName()} ${faker.person.lastName()}`
      ),
    branchId: deps.branchId,
    sectorId: deps.sectorId,
    costCenterId: deps.costCenterId,
    jobPositionId: deps.jobPositionId,
    jobClassificationId: deps.jobClassificationId,
    workShift,
    weeklyHours:
      overrides.weeklyHours ??
      (workShift ? WEEKLY_HOURS_BY_SHIFT[workShift] : 44),
    busCount:
      overrides.busCount ??
      maybe(profile, () => faker.number.int({ min: 0, max: 4 })),
    mealAllowance:
      overrides.mealAllowance ??
      maybe(profile, () =>
        faker.number.float({ min: 200, max: 800, fractionDigits: 2 })
      ),
    transportAllowance:
      overrides.transportAllowance ??
      maybe(profile, () =>
        faker.number.float({ min: 100, max: 400, fractionDigits: 2 })
      ),
    healthInsurance:
      overrides.healthInsurance ??
      maybe(profile, () =>
        faker.number.float({ min: 200, max: 1500, fractionDigits: 2 })
      ),
    educationLevel:
      overrides.educationLevel ??
      maybe(profile, () =>
        faker.helpers.arrayElement([
          "ELEMENTARY",
          "HIGH_SCHOOL",
          "BACHELOR",
          "POST_GRADUATE",
          "MASTER",
          "DOCTORATE",
        ] as const)
      ),
    ...generateDisabilityData(overrides, profile),
    ...generateFamilyData(overrides, profile),
    ...generateHealthDates(overrides, profile, hireDate),
    ...generateAcquisitionPeriod(overrides, profile, hireDate),
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
 * Each employee gets a random completeness profile:
 * - minimal (~30%): only required fields
 * - partial (~50%): ~50% of optional fields filled
 * - complete (~20%): all optional fields filled
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

  const profile = pickCompletenessProfile();
  const personalData = generatePersonalData(overrides, profile);

  const employee = await EmployeeService.create({
    organizationId,
    userId,
    ...personalData,
    ...generateDocuments(overrides, profile, personalData.gender),
    ...generateAddress(overrides, profile),
    ...generateEmploymentData(overrides, resolvedDeps, profile),
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
