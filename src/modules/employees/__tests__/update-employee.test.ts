import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { generateCpf } from "@/test/helpers/faker";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/employees/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/employee-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/employee-123`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent employee", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/employee-nonexistent`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("should update employee name successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Nome Atualizado" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(employee.id);
    expect(body.data.name).toBe("Nome Atualizado");
  });

  test("should reject duplicate CPF on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const cpf1 = generateCpf();
    const cpf2 = generateCpf();

    const { dependencies } = await createTestEmployee({
      organizationId,
      userId: user.id,
      cpf: cpf1,
    });

    const { employee: employee2 } = await createTestEmployee({
      organizationId,
      userId: user.id,
      dependencies,
      cpf: cpf2,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee2.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cpf: cpf1 }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_CPF_ALREADY_EXISTS");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from updating employee", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should clear nullable fields when null is sent", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      email: "test@example.com",
      phone: "11999998888",
      mobile: "11999997777",
      birthplace: "São Paulo",
      height: 1.75,
      weight: 80,
      fatherName: "Pai Teste",
      motherName: "Mãe Teste",
      identityCard: "123456789",
      pis: "12345678901",
      workPermitNumber: "1234567",
      workPermitSeries: "1234",
      militaryCertificate: "123456789012",
      complement: "Apto 101",
      latitude: -23.55,
      longitude: -46.63,
      manager: "Gestor Teste",
      mealAllowance: 500,
      transportAllowance: 200,
      healthInsurance: 300,
      educationLevel: "BACHELOR",
      lastHealthExamDate: "2024-01-15",
      admissionExamDate: "2024-01-10",
    });

    // Verify fields are populated
    expect(employee.email).toBe("test@example.com");
    expect(employee.phone).toBe("11999998888");
    expect(employee.manager).toBe("Gestor Teste");

    // Send null to clear fields
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: null,
          phone: null,
          mobile: null,
          birthplace: null,
          height: null,
          weight: null,
          fatherName: null,
          motherName: null,
          identityCard: null,
          pis: null,
          workPermitNumber: null,
          workPermitSeries: null,
          militaryCertificate: null,
          complement: null,
          latitude: null,
          longitude: null,
          manager: null,
          mealAllowance: null,
          transportAllowance: null,
          healthInsurance: null,
          educationLevel: null,
          lastHealthExamDate: null,
          admissionExamDate: null,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.email).toBeNull();
    expect(body.data.phone).toBeNull();
    expect(body.data.mobile).toBeNull();
    expect(body.data.birthplace).toBeNull();
    expect(body.data.height).toBeNull();
    expect(body.data.weight).toBeNull();
    expect(body.data.fatherName).toBeNull();
    expect(body.data.motherName).toBeNull();
    expect(body.data.identityCard).toBeNull();
    expect(body.data.pis).toBeNull();
    expect(body.data.workPermitNumber).toBeNull();
    expect(body.data.workPermitSeries).toBeNull();
    expect(body.data.militaryCertificate).toBeNull();
    expect(body.data.complement).toBeNull();
    expect(body.data.latitude).toBeNull();
    expect(body.data.longitude).toBeNull();
    expect(body.data.manager).toBeNull();
    expect(body.data.mealAllowance).toBeNull();
    expect(body.data.transportAllowance).toBeNull();
    expect(body.data.healthInsurance).toBeNull();
    expect(body.data.educationLevel).toBeNull();
    expect(body.data.lastHealthExamDate).toBeNull();
    expect(body.data.admissionExamDate).toBeNull();

    // Verify non-sent fields remain unchanged
    expect(body.data.name).toBe(employee.name);
    expect(body.data.cpf).toBe(employee.cpf);
    expect(body.data.nationality).toBe(employee.nationality);
  });

  test("should not change fields that are not sent (undefined)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      email: "keep@example.com",
      phone: "11999998888",
      manager: "Gestor Original",
      mealAllowance: 500,
      educationLevel: "BACHELOR",
    });

    // Send only name update, no other fields
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Nome Diferente" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.name).toBe("Nome Diferente");
    // Optional fields should keep their original values
    expect(body.data.email).toBe("keep@example.com");
    expect(body.data.phone).toBe("11999998888");
    expect(body.data.manager).toBe("Gestor Original");
    expect(Number(body.data.mealAllowance)).toBe(500);
    expect(body.data.educationLevel).toBe("BACHELOR");
  });

  test("should allow manager to update employee", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated by Manager" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Updated by Manager");
  });
});

describe("PATCH /v1/employees/:id/status", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should update employee status successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}/status`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "ON_VACATION" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ON_VACATION");
  });

  test("should reject invalid status", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}/status`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "INVALID_STATUS" }),
      })
    );

    expect(response.status).toBe(422);
  });
});

describe("PUT /v1/employees/:id — acquisition period", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should update acquisition period fields", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-15",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          acquisitionPeriodStart: "2024-01-15",
          acquisitionPeriodEnd: "2025-01-14",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2024-01-15");
    expect(body.data.acquisitionPeriodEnd).toBe("2025-01-14");
  });

  test("should update only acquisitionPeriodEnd and merge with existing start", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-15",
    });

    // Set both fields first
    await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          acquisitionPeriodStart: "2024-01-15",
          acquisitionPeriodEnd: "2025-01-14",
        }),
      })
    );

    // Update only end date
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          acquisitionPeriodEnd: "2025-06-14",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2024-01-15");
    expect(body.data.acquisitionPeriodEnd).toBe("2025-06-14");
  });

  test("should reject when hireDate update conflicts with existing acquisition period", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-15",
    });

    // First set acquisition period
    await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          acquisitionPeriodStart: "2024-01-15",
          acquisitionPeriodEnd: "2025-01-14",
        }),
      })
    );

    // Then try to move hireDate after acquisitionPeriodStart
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          hireDate: "2024-06-01",
        }),
      })
    );

    expect(response.status).toBe(422);
  });
});
