import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestJobClassification } from "@/test/helpers/job-classification";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestSector } from "@/test/helpers/sector";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

const createValidEmployeeData = (overrides?: Record<string, unknown>) => ({
  name: "João da Silva",
  email: "joao@example.com",
  mobile: "11999999999",
  birthDate: "1990-01-15",
  gender: "MALE",
  maritalStatus: "SINGLE",
  birthplace: "São Paulo",
  nationality: "Brasileiro",
  motherName: "Maria da Silva",
  cpf: "12345678901",
  identityCard: "123456789",
  pis: "12345678901",
  workPermitNumber: "1234567",
  workPermitSeries: "0001",
  street: "Rua das Flores",
  streetNumber: "123",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  zipCode: "01234567",
  hireDate: "2024-01-15",
  contractType: "CLT",
  salary: 5000,
  sectorId: "sector-placeholder",
  jobPositionId: "job-position-placeholder",
  jobClassificationId: "job-classification-placeholder",
  workShift: "FIVE_TWO",
  weeklyHours: 44,
  educationLevel: "BACHELOR",
  hasSpecialNeeds: false,
  hasChildren: false,
  ...overrides,
});

async function setupSubscription(organizationId: string) {
  const { PlanFactory } = await import(
    "@/test/factories/payments/plan.factory"
  );
  const { SubscriptionFactory } = await import(
    "@/test/factories/payments/subscription.factory"
  );

  const { plan, tiers } = await PlanFactory.createPaid("gold");
  const firstTier = PlanFactory.getFirstTier({ plan, tiers });
  await SubscriptionFactory.createActive(organizationId, plan.id, {
    pricingTierId: firstTier.id,
  });
}

async function createTestDependencies(organizationId: string, userId: string) {
  await setupSubscription(organizationId);

  const sector = await createTestSector({ organizationId, userId });
  const jobPosition = await createTestJobPosition({ organizationId, userId });
  const jobClassification = await createTestJobClassification({
    organizationId,
    userId,
  });

  return {
    sectorId: sector.id,
    jobPositionId: jobPosition.id,
    jobClassificationId: jobClassification.id,
  };
}

describe("POST /v1/employees", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createValidEmployeeData()),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createValidEmployeeData()),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject missing required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject invalid CPF format", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const deps = await createTestDependencies(organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          createValidEmployeeData({
            cpf: "123",
            ...deps,
          })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should create employee successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const deps = await createTestDependencies(organizationId, user.id);

    const employeeData = createValidEmployeeData(deps);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(employeeData),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("employee-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe(employeeData.name);
    expect(body.data.cpf).toBe(employeeData.cpf);
  });

  test("should reject duplicate CPF in same organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const deps = await createTestDependencies(organizationId, user.id);

    const employeeData = createValidEmployeeData({
      cpf: "98765432101",
      ...deps,
    });

    // Create first employee
    await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(employeeData),
      })
    );

    // Try to create second employee with same CPF
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...employeeData,
          name: "Outro Funcionário",
          email: "outro@example.com",
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_CPF_ALREADY_EXISTS");
  });

  test("should reject invalid sector", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await setupSubscription(organizationId);

    const jobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
    });
    const jobClassification = await createTestJobClassification({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          createValidEmployeeData({
            sectorId: "sector-invalid",
            jobPositionId: jobPosition.id,
            jobClassificationId: jobClassification.id,
          })
        ),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_INVALID_SECTOR");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from creating employee", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const deps = await createTestDependencies(organizationId, user.id);

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createValidEmployeeData(deps)),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create employee", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const deps = await createTestDependencies(organizationId, user.id);

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          createValidEmployeeData({
            cpf: "11122233344",
            ...deps,
          })
        ),
      })
    );

    expect(response.status).toBe(200);
  });
});
