import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestAccident } from "@/test/helpers/accident";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

const validAccidentData = {
  date: "2024-01-15",
  description: "Queda de escada durante manutenção",
  nature: "Queda",
  measuresTaken: "Primeiros socorros aplicados no local",
};

describe("POST /v1/accidents", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validAccidentData, employeeId: "emp-123" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...validAccidentData, employeeId: "emp-123" }),
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
      new Request(`${BASE_URL}/v1/accidents`, {
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

  test("should return PT-BR messages for empty required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: "",
          date: "not-a-date",
          description: "",
          nature: "",
          measuresTaken: "",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("ID do funcionário é obrigatório");
    expect(messages).toContain("Descrição é obrigatória");
    expect(messages).toContain("Medidas tomadas são obrigatórias");
  });

  test("should return PT-BR message for invalid date", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: "employee-123",
          date: "not-a-date",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("Data inválida");
  });

  test("should reject future date", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
          date: futureDate.toISOString().split("T")[0],
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test.each([
    { label: "omitted", build: () => ({}) },
    { label: "null", build: () => ({ date: null }) },
    { label: "empty string", build: () => ({ date: "" }) },
  ])("should reject create when date is $label", async ({ build }) => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const { date: _omit, ...rest } = validAccidentData;
    const payload = {
      ...rest,
      employeeId: employee.id,
      ...build(),
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const dateIssue = body.error.details.find(
      (d: { path: string }) => d.path === "date" || d.path.endsWith("/date")
    );
    expect(dateIssue).toBeDefined();
  });

  test("should reject invalid employee", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: "invalid-employee-id",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ACCIDENT_INVALID_EMPLOYEE");
  });

  test("should create accident successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("accident-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.description).toBe(validAccidentData.description);
    expect(body.data.nature).toBe(validAccidentData.nature);
    expect(body.data.measuresTaken).toBe(validAccidentData.measuresTaken);
  });

  test("should create accident with optional CAT", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
          cat: "12345678901234567890",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.cat).toBe("12345678901234567890");
  });

  test.each([
    "viewer",
  ] as const)("should reject %s member from creating accident", async (role) => {
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
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create accident", async () => {
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
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should return 409 when creating accident with duplicate CAT number", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAccident({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      cat: "CAT-DUPLICATE-001",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
          cat: "CAT-DUPLICATE-001",
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("ACCIDENT_CAT_ALREADY_EXISTS");
  });

  test("should allow creating accident when CAT is null", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should return 422 when employee is TERMINATED", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await db
      .update(schema.employees)
      .set({ status: "TERMINATED" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_TERMINATED");
  });

  test("should return 422 when employee is ON_VACATION", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await db
      .update(schema.employees)
      .set({ status: "ON_VACATION" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validAccidentData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_ON_VACATION");
  });
});
