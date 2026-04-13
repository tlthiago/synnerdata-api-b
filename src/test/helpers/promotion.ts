import type { PromotionData } from "@/modules/occurrences/promotions/promotion.model";
import { PromotionService } from "@/modules/occurrences/promotions/promotion.service";
import { createTestEmployee } from "./employee";
import { faker } from "./faker";
import { createTestJobPosition } from "./job-position";

type PromotionDependencies = {
  employeeId: string;
  previousJobPositionId: string;
  newJobPositionId: string;
};

type PromotionOverrides = {
  employeeId?: string;
  previousJobPositionId?: string;
  newJobPositionId?: string;
  promotionDate?: string;
  previousSalary?: number;
  newSalary?: number;
  reason?: string;
  notes?: string;
};

type CreateTestPromotionOptions = {
  organizationId: string;
  userId: string;
  dependencies?: Partial<PromotionDependencies>;
} & PromotionOverrides;

type CreateTestPromotionResult = {
  promotion: PromotionData;
  dependencies: PromotionDependencies;
};

async function resolveDependencies(
  organizationId: string,
  userId: string,
  deps: Partial<PromotionDependencies> = {}
): Promise<PromotionDependencies> {
  let employeeId = deps.employeeId;
  let previousJobPositionId = deps.previousJobPositionId;
  let newJobPositionId = deps.newJobPositionId;

  if (!employeeId) {
    const { employee } = await createTestEmployee({ organizationId, userId });
    employeeId = employee.id;
  }

  if (!previousJobPositionId) {
    const previousPosition = await createTestJobPosition({
      organizationId,
      userId,
      name: `Analista Júnior ${crypto.randomUUID().slice(0, 8)}`,
    });
    previousJobPositionId = previousPosition.id;
  }

  if (!newJobPositionId) {
    const newPosition = await createTestJobPosition({
      organizationId,
      userId,
      name: `Analista Pleno ${crypto.randomUUID().slice(0, 8)}`,
    });
    newJobPositionId = newPosition.id;
  }

  return {
    employeeId,
    previousJobPositionId,
    newJobPositionId,
  };
}

function generatePromotionDate(): string {
  const date = faker.date.recent({ days: 90 });
  return date.toISOString().split("T")[0];
}

/**
 * Creates a test promotion using the PromotionService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 *
 * If dependencies (employee, job positions) are not provided,
 * they will be created automatically.
 */
export async function createTestPromotion(
  options: CreateTestPromotionOptions
): Promise<CreateTestPromotionResult> {
  const { organizationId, userId, dependencies = {}, ...overrides } = options;

  const resolvedDeps = await resolveDependencies(
    organizationId,
    userId,
    dependencies
  );

  const previousSalary = overrides.previousSalary ?? 3000;
  const newSalary = overrides.newSalary ?? previousSalary * 1.2;

  const result = await PromotionService.create({
    organizationId,
    userId,
    employeeId: overrides.employeeId ?? resolvedDeps.employeeId,
    previousJobPositionId:
      overrides.previousJobPositionId ?? resolvedDeps.previousJobPositionId,
    newJobPositionId:
      overrides.newJobPositionId ?? resolvedDeps.newJobPositionId,
    promotionDate: overrides.promotionDate ?? generatePromotionDate(),
    previousSalary,
    newSalary,
    reason: overrides.reason ?? "Promoção por mérito e desempenho",
    notes: overrides.notes,
  });

  return { promotion: result.data, dependencies: resolvedDeps };
}

type CreateMultiplePromotionsOptions = {
  organizationId: string;
  userId: string;
  count: number;
  sharedDependencies?: Partial<PromotionDependencies>;
};

/**
 * Creates multiple test promotions.
 * Pass sharedDependencies to reuse the same employee, positions, etc.
 */
export async function createTestPromotions(
  options: CreateMultiplePromotionsOptions
): Promise<CreateTestPromotionResult[]> {
  const { organizationId, userId, count, sharedDependencies } = options;
  const results: CreateTestPromotionResult[] = [];

  for (let i = 0; i < count; i++) {
    const result = await createTestPromotion({
      organizationId,
      userId,
      dependencies: sharedDependencies,
    });
    results.push(result);
  }

  return results;
}
