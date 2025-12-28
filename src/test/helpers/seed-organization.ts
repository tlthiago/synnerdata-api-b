import type { EmployeeData } from "@/modules/employees/employee.model";
import type { AbsenceData } from "@/modules/occurrences/absences/absence.model";
import type { AccidentData } from "@/modules/occurrences/accidents/accident.model";
import type { CpfAnalysisData } from "@/modules/occurrences/cpf-analyses/cpf-analysis.model";
import type { LaborLawsuitData } from "@/modules/occurrences/labor-lawsuits/labor-lawsuit.model";
import type { MedicalCertificateData } from "@/modules/occurrences/medical-certificates/medical-certificates.model";
import type { PpeDeliveryData } from "@/modules/occurrences/ppe-deliveries/ppe-delivery.model";
import type { PromotionData } from "@/modules/occurrences/promotions/promotion.model";
import type { TerminationData } from "@/modules/occurrences/terminations/termination.model";
import type { VacationData } from "@/modules/occurrences/vacations/vacation.model";
import type { WarningData } from "@/modules/occurrences/warnings/warning.model";
import type { BranchData } from "@/modules/organizations/branches/branch.model";
import type { CostCenterData } from "@/modules/organizations/cost-centers/cost-center.model";
import type { JobClassificationData } from "@/modules/organizations/job-classifications/job-classification.model";
import type { JobPositionData } from "@/modules/organizations/job-positions/job-position.model";
import type { PpeItemData } from "@/modules/organizations/ppe-items/ppe-item.model";
import type { ProjectData } from "@/modules/organizations/projects/project.model";
import type { SectorData } from "@/modules/organizations/sectors/sector.model";
import { createTestAbsence } from "./absence";
import { createTestAccident } from "./accident";
import { createTestBranches } from "./branch";
import { createTestCostCenters } from "./cost-center";
import { createTestCpfAnalysis } from "./cpf-analysis";
import { createTestEmployee } from "./employee";
import { faker } from "./faker";
import { createTestJobClassifications } from "./job-classification";
import { createTestJobPositions } from "./job-position";
import { createTestLaborLawsuit } from "./labor-lawsuit";
import { createTestMedicalCertificate } from "./medical-certificate";
import { createTestPpeDelivery } from "./ppe-delivery";
import { createTestPpeItems } from "./ppe-item";
import { addEmployeeToProject, createTestProjects } from "./project";
import { createTestPromotion } from "./promotion";
import { createTestSectors } from "./sector";
import { createTestTermination } from "./termination";
import { createTestVacation } from "./vacation";
import { createTestWarning } from "./warning";

/**
 * Configuration for seeding organization data.
 * All counts are optional and have sensible defaults.
 */
export type SeedOrganizationConfig = {
  /** Number of branches to create (default: 5) */
  branches?: number;
  /** Number of sectors to create (default: 10) */
  sectors?: number;
  /** Number of cost centers to create (default: 8) */
  costCenters?: number;
  /** Number of job positions to create (default: 15) */
  jobPositions?: number;
  /** Number of job classifications to create (default: 12) */
  jobClassifications?: number;
  /** Number of projects to create (default: 6) */
  projects?: number;
  /** Number of PPE items to create (default: 10) */
  ppeItems?: number;
  /** Number of employees to create (default: 50) */
  employees?: number;
  /** Occurrences config per employee (randomized within range) */
  occurrences?: {
    /** Min/max absences per employee (default: 0-3) */
    absences?: { min: number; max: number };
    /** Min/max accidents per employee (default: 0-1) */
    accidents?: { min: number; max: number };
    /** Min/max vacations per employee (default: 0-2) */
    vacations?: { min: number; max: number };
    /** Min/max warnings per employee (default: 0-2) */
    warnings?: { min: number; max: number };
    /** Min/max medical certificates per employee (default: 0-4) */
    medicalCertificates?: { min: number; max: number };
    /** Min/max promotions per employee (default: 0-2) */
    promotions?: { min: number; max: number };
    /** Min/max PPE deliveries per employee (default: 1-3) */
    ppeDeliveries?: { min: number; max: number };
    /** Min/max labor lawsuits per employee (default: 0-0) */
    laborLawsuits?: { min: number; max: number };
    /** Min/max CPF analyses per employee (default: 0-1) */
    cpfAnalyses?: { min: number; max: number };
  };
  /** Percentage of employees to terminate (default: 0.1 = 10%) */
  terminationRate?: number;
  /** Percentage of employees to assign to projects (default: 0.6 = 60%) */
  projectAssignmentRate?: number;
};

export type SeedOrganizationResult = {
  // Organizational structure
  branches: BranchData[];
  sectors: SectorData[];
  costCenters: CostCenterData[];
  jobPositions: JobPositionData[];
  jobClassifications: JobClassificationData[];
  projects: ProjectData[];
  ppeItems: PpeItemData[];
  // Employees
  employees: EmployeeData[];
  activeEmployees: EmployeeData[];
  terminatedEmployees: EmployeeData[];
  // Occurrences (aggregated)
  occurrences: {
    absences: AbsenceData[];
    accidents: AccidentData[];
    vacations: VacationData[];
    warnings: WarningData[];
    medicalCertificates: MedicalCertificateData[];
    promotions: PromotionData[];
    ppeDeliveries: PpeDeliveryData[];
    laborLawsuits: LaborLawsuitData[];
    cpfAnalyses: CpfAnalysisData[];
    terminations: TerminationData[];
  };
  // Summary
  summary: {
    totalEmployees: number;
    activeEmployees: number;
    terminatedEmployees: number;
    totalOccurrences: number;
    employeesInProjects: number;
  };
};

const DEFAULT_CONFIG: Required<SeedOrganizationConfig> = {
  branches: 5,
  sectors: 10,
  costCenters: 8,
  jobPositions: 15,
  jobClassifications: 12,
  projects: 6,
  ppeItems: 10,
  employees: 50,
  occurrences: {
    absences: { min: 0, max: 3 },
    accidents: { min: 0, max: 1 },
    vacations: { min: 0, max: 2 },
    warnings: { min: 0, max: 2 },
    medicalCertificates: { min: 0, max: 4 },
    promotions: { min: 0, max: 2 },
    ppeDeliveries: { min: 1, max: 3 },
    laborLawsuits: { min: 0, max: 1 },
    cpfAnalyses: { min: 0, max: 1 },
  },
  terminationRate: 0.1,
  projectAssignmentRate: 0.6,
};

function mergeConfig(
  config: SeedOrganizationConfig
): Required<SeedOrganizationConfig> {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    occurrences: {
      ...DEFAULT_CONFIG.occurrences,
      ...config.occurrences,
    },
  };
}

function randomInRange(min: number, max: number): number {
  return faker.number.int({ min, max });
}

type OccurrenceContext = {
  organizationId: string;
  userId: string;
  employeeId: string;
  ppeItems: PpeItemData[];
};

type OccurrenceAccumulators = {
  absences: AbsenceData[];
  accidents: AccidentData[];
  vacations: VacationData[];
  warnings: WarningData[];
  medicalCertificates: MedicalCertificateData[];
  promotions: PromotionData[];
  ppeDeliveries: PpeDeliveryData[];
  laborLawsuits: LaborLawsuitData[];
  cpfAnalyses: CpfAnalysisData[];
  terminations: TerminationData[];
};

async function createAbsencesForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: AbsenceData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const absence = await createTestAbsence({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
    });
    accum.push(absence);
  }
}

async function createAccidentsForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: AccidentData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const accident = await createTestAccident({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
    });
    accum.push(accident);
  }
}

async function createVacationsForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: VacationData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const vacation = await createTestVacation({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
    });
    accum.push(vacation);
  }
}

async function createWarningsForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: WarningData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const warning = await createTestWarning({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
    });
    accum.push(warning);
  }
}

async function createMedicalCertificatesForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: MedicalCertificateData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const cert = await createTestMedicalCertificate({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
    });
    accum.push(cert);
  }
}

async function createPromotionsForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: PromotionData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const { promotion } = await createTestPromotion({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      dependencies: { employeeId: ctx.employeeId },
    });
    accum.push(promotion);
  }
}

async function createPpeDeliveriesForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: PpeDeliveryData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const delivery = await createTestPpeDelivery({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
      ppeItemIds:
        ctx.ppeItems.length > 0
          ? [faker.helpers.arrayElement(ctx.ppeItems).id]
          : undefined,
    });
    accum.push(delivery);
  }
}

async function createLaborLawsuitsForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: LaborLawsuitData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const lawsuit = await createTestLaborLawsuit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
    });
    accum.push(lawsuit);
  }
}

async function createCpfAnalysesForEmployee(
  ctx: OccurrenceContext,
  range: { min: number; max: number },
  accum: CpfAnalysisData[]
): Promise<void> {
  const count = randomInRange(range.min, range.max);
  for (let i = 0; i < count; i += 1) {
    const cpfAnalysis = await createTestCpfAnalysis({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
    });
    accum.push(cpfAnalysis);
  }
}

async function createOccurrencesForEmployee(
  ctx: OccurrenceContext,
  occConfig: Required<SeedOrganizationConfig>["occurrences"],
  accum: OccurrenceAccumulators
): Promise<void> {
  const defaultRange = { min: 0, max: 0 };

  await createAbsencesForEmployee(
    ctx,
    occConfig.absences ?? defaultRange,
    accum.absences
  );
  await createAccidentsForEmployee(
    ctx,
    occConfig.accidents ?? defaultRange,
    accum.accidents
  );
  await createVacationsForEmployee(
    ctx,
    occConfig.vacations ?? defaultRange,
    accum.vacations
  );
  await createWarningsForEmployee(
    ctx,
    occConfig.warnings ?? defaultRange,
    accum.warnings
  );
  await createMedicalCertificatesForEmployee(
    ctx,
    occConfig.medicalCertificates ?? defaultRange,
    accum.medicalCertificates
  );
  await createPromotionsForEmployee(
    ctx,
    occConfig.promotions ?? defaultRange,
    accum.promotions
  );
  await createPpeDeliveriesForEmployee(
    ctx,
    occConfig.ppeDeliveries ?? defaultRange,
    accum.ppeDeliveries
  );
  await createLaborLawsuitsForEmployee(
    ctx,
    occConfig.laborLawsuits ?? defaultRange,
    accum.laborLawsuits
  );
  await createCpfAnalysesForEmployee(
    ctx,
    occConfig.cpfAnalyses ?? defaultRange,
    accum.cpfAnalyses
  );
}

/**
 * Seeds a complete organization with all related resources.
 *
 * Creates organizational structure (branches, sectors, positions, etc.),
 * employees, and various occurrences (absences, accidents, warnings, etc.).
 *
 * @example
 * ```ts
 * const { organizationId, userId } = await createTestUserWithOrganization();
 *
 * // Seed with defaults (50 employees)
 * const result = await seedOrganization({ organizationId, userId });
 *
 * // Seed with custom config
 * const result = await seedOrganization({
 *   organizationId,
 *   userId,
 *   employees: 100,
 *   sectors: 15,
 *   occurrences: {
 *     warnings: { min: 1, max: 5 },
 *     laborLawsuits: { min: 0, max: 1 },
 *   },
 * });
 *
 * // Use presets
 * const result = await seedOrganization({
 *   organizationId,
 *   userId,
 *   ...seedPresets.large,
 * });
 * ```
 */
export async function seedOrganization(
  options: {
    organizationId: string;
    userId: string;
  } & SeedOrganizationConfig
): Promise<SeedOrganizationResult> {
  const { organizationId, userId, ...configOptions } = options;
  const config = mergeConfig(configOptions);

  // 1. Create organizational structure (these are independent)
  const [
    branches,
    sectors,
    costCenters,
    jobPositions,
    jobClassifications,
    projects,
    ppeItems,
  ] = await Promise.all([
    createTestBranches({ organizationId, userId, count: config.branches }),
    createTestSectors({ organizationId, userId, count: config.sectors }),
    createTestCostCenters({
      organizationId,
      userId,
      count: config.costCenters,
    }),
    createTestJobPositions({
      organizationId,
      userId,
      count: config.jobPositions,
    }),
    createTestJobClassifications({
      organizationId,
      userId,
      count: config.jobClassifications,
    }),
    createTestProjects({ organizationId, userId, count: config.projects }),
    createTestPpeItems({ organizationId, userId, count: config.ppeItems }),
  ]);

  // 2. Create employees with dependencies from organizational structure
  const employees: EmployeeData[] = [];
  for (let i = 0; i < config.employees; i++) {
    const { employee } = await createTestEmployee({
      organizationId,
      userId,
      dependencies: {
        sectorId: faker.helpers.arrayElement(sectors).id,
        jobPositionId: faker.helpers.arrayElement(jobPositions).id,
        jobClassificationId: faker.helpers.arrayElement(jobClassifications).id,
        branchId:
          branches.length > 0
            ? faker.helpers.arrayElement(branches).id
            : undefined,
        costCenterId:
          costCenters.length > 0
            ? faker.helpers.arrayElement(costCenters).id
            : undefined,
      },
    });
    employees.push(employee);
  }

  // 3. Assign employees to projects
  let employeesInProjects = 0;
  if (projects.length > 0) {
    const employeesToAssign = Math.floor(
      employees.length * config.projectAssignmentRate
    );
    const shuffledForProjects = faker.helpers.shuffle([...employees]);

    for (let i = 0; i < employeesToAssign; i += 1) {
      const employee = shuffledForProjects[i];
      const project = faker.helpers.arrayElement(projects);
      await addEmployeeToProject(
        project.id,
        employee.id,
        organizationId,
        userId
      );
      employeesInProjects += 1;
    }
  }

  // 4. Determine which employees will be terminated
  const terminationCount = Math.floor(
    employees.length * config.terminationRate
  );
  const shuffledEmployees = faker.helpers.shuffle([...employees]);
  const employeesToTerminate = shuffledEmployees.slice(0, terminationCount);
  const activeEmployees = shuffledEmployees.slice(terminationCount);

  // 5. Create occurrences for all employees
  const occurrences: OccurrenceAccumulators = {
    absences: [],
    accidents: [],
    vacations: [],
    warnings: [],
    medicalCertificates: [],
    promotions: [],
    ppeDeliveries: [],
    laborLawsuits: [],
    cpfAnalyses: [],
    terminations: [],
  };

  for (const employee of employees) {
    const ctx: OccurrenceContext = {
      organizationId,
      userId,
      employeeId: employee.id,
      ppeItems,
    };
    await createOccurrencesForEmployee(ctx, config.occurrences, occurrences);
  }

  // 6. Create terminations for selected employees
  for (const employee of employeesToTerminate) {
    const termination = await createTestTermination({
      organizationId,
      userId,
      employeeId: employee.id,
    });
    occurrences.terminations.push(termination);
  }

  // Calculate summary
  const totalOccurrences =
    occurrences.absences.length +
    occurrences.accidents.length +
    occurrences.vacations.length +
    occurrences.warnings.length +
    occurrences.medicalCertificates.length +
    occurrences.promotions.length +
    occurrences.ppeDeliveries.length +
    occurrences.laborLawsuits.length +
    occurrences.cpfAnalyses.length +
    occurrences.terminations.length;

  return {
    branches,
    sectors,
    costCenters,
    jobPositions,
    jobClassifications,
    projects,
    ppeItems,
    employees,
    activeEmployees,
    terminatedEmployees: employeesToTerminate,
    occurrences,
    summary: {
      totalEmployees: employees.length,
      activeEmployees: activeEmployees.length,
      terminatedEmployees: employeesToTerminate.length,
      totalOccurrences,
      employeesInProjects,
    },
  };
}

/**
 * Preset configurations for common scenarios.
 */
export const seedPresets = {
  /** Small organization: 15 employees, minimal structure */
  small: {
    branches: 2,
    sectors: 4,
    costCenters: 3,
    jobPositions: 6,
    jobClassifications: 5,
    projects: 2,
    ppeItems: 5,
    employees: 15,
    occurrences: {
      absences: { min: 0, max: 2 },
      accidents: { min: 0, max: 1 },
      vacations: { min: 0, max: 1 },
      warnings: { min: 0, max: 1 },
      medicalCertificates: { min: 0, max: 2 },
      promotions: { min: 0, max: 1 },
      ppeDeliveries: { min: 0, max: 2 },
      laborLawsuits: { min: 0, max: 1 },
      cpfAnalyses: { min: 0, max: 1 },
    },
    terminationRate: 0.05,
    projectAssignmentRate: 0.4,
  } satisfies SeedOrganizationConfig,

  /** Medium organization: 50 employees (default) */
  medium: {} satisfies SeedOrganizationConfig,

  /** Large organization: 100 employees, more occurrences */
  large: {
    branches: 8,
    sectors: 15,
    costCenters: 12,
    jobPositions: 20,
    jobClassifications: 18,
    projects: 10,
    ppeItems: 15,
    employees: 100,
    occurrences: {
      absences: { min: 1, max: 5 },
      accidents: { min: 0, max: 2 },
      vacations: { min: 1, max: 3 },
      warnings: { min: 0, max: 3 },
      medicalCertificates: { min: 1, max: 6 },
      promotions: { min: 0, max: 3 },
      ppeDeliveries: { min: 2, max: 5 },
      laborLawsuits: { min: 0, max: 1 },
      cpfAnalyses: { min: 0, max: 2 },
    },
    terminationRate: 0.15,
    projectAssignmentRate: 0.7,
  } satisfies SeedOrganizationConfig,

  /** Enterprise organization: 200 employees, full data */
  enterprise: {
    branches: 12,
    sectors: 20,
    costCenters: 18,
    jobPositions: 30,
    jobClassifications: 25,
    projects: 15,
    ppeItems: 20,
    employees: 200,
    occurrences: {
      absences: { min: 2, max: 8 },
      accidents: { min: 0, max: 3 },
      vacations: { min: 1, max: 4 },
      warnings: { min: 0, max: 4 },
      medicalCertificates: { min: 2, max: 8 },
      promotions: { min: 0, max: 4 },
      ppeDeliveries: { min: 3, max: 6 },
      laborLawsuits: { min: 0, max: 2 },
      cpfAnalyses: { min: 1, max: 2 },
    },
    terminationRate: 0.2,
    projectAssignmentRate: 0.8,
  } satisfies SeedOrganizationConfig,

  /** Minimal: 3 employees, basic occurrences (for focused tests) */
  minimal: {
    branches: 1,
    sectors: 2,
    costCenters: 1,
    jobPositions: 3,
    jobClassifications: 2,
    projects: 1,
    ppeItems: 3,
    employees: 3,
    occurrences: {
      absences: { min: 0, max: 1 },
      accidents: { min: 0, max: 0 },
      vacations: { min: 0, max: 1 },
      warnings: { min: 0, max: 1 },
      medicalCertificates: { min: 0, max: 1 },
      promotions: { min: 0, max: 0 },
      ppeDeliveries: { min: 0, max: 1 },
      laborLawsuits: { min: 0, max: 0 },
      cpfAnalyses: { min: 0, max: 0 },
    },
    terminationRate: 0,
    projectAssignmentRate: 0.3,
  } satisfies SeedOrganizationConfig,
} as const;
