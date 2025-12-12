import type { PlanLimits } from "@/modules/payments/plan/plan.model";

type TestPlan = {
  id: string;
  name: string;
  displayName: string;
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  limits: PlanLimits;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
};

export const testPlans: TestPlan[] = [
  {
    id: "test-plan-starter",
    name: "starter",
    displayName: "Starter",
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 14,
    limits: {
      maxMembers: 3,
      maxProjects: 3,
      maxStorage: 500,
      features: ["basic"],
    },
    isActive: true,
    isPublic: true,
    sortOrder: 0,
  },
  {
    id: "test-plan-free",
    name: "free",
    displayName: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 0,
    limits: {
      maxMembers: 1,
      maxProjects: 1,
      maxStorage: 100,
      features: ["basic"],
    },
    isActive: true,
    isPublic: true,
    sortOrder: 1,
  },
  {
    id: "test-plan-pro",
    name: "pro",
    displayName: "Pro",
    priceMonthly: 9900, // R$ 99,00 em centavos
    priceYearly: 99_000, // R$ 990,00 em centavos
    trialDays: 14,
    limits: {
      maxMembers: 5,
      maxProjects: 10,
      maxStorage: 5000,
      features: ["basic", "advanced", "support"],
    },
    isActive: true,
    isPublic: true,
    sortOrder: 1,
  },
  {
    id: "test-plan-enterprise",
    name: "enterprise",
    displayName: "Enterprise",
    priceMonthly: 29_900, // R$ 299,00 em centavos
    priceYearly: 299_000, // R$ 2.990,00 em centavos
    trialDays: 14,
    limits: {
      maxMembers: 50,
      maxProjects: 100,
      maxStorage: 50_000,
      features: ["basic", "advanced", "support", "priority", "custom"],
    },
    isActive: true,
    isPublic: true,
    sortOrder: 2,
  },
  {
    id: "test-plan-inactive",
    name: "legacy",
    displayName: "Legacy Plan",
    priceMonthly: 4900,
    priceYearly: 49_000,
    trialDays: 7,
    limits: {
      maxMembers: 3,
      maxProjects: 5,
      maxStorage: 1000,
      features: ["basic"],
    },
    isActive: false, // Plan not available for new subscriptions
    isPublic: false,
    sortOrder: 99,
  },
];

export const activePlans = testPlans.filter((p) => p.isActive && p.isPublic);
export const proPlan = testPlans.find((p) => p.name === "pro");
export const starterPlan = testPlans.find((p) => p.name === "starter");
