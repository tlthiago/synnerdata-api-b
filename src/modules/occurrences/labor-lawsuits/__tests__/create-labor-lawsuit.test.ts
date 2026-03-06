import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestLaborLawsuit } from "@/test/helpers/labor-lawsuit";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

function uniqueProcessNumber(): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 7);
  return `${random}-00.2024.5.01.0001`;
}

const baseValidLawsuitData = {
  court: "1ª Vara do Trabalho do Rio de Janeiro",
  filingDate: "2024-01-10",
  knowledgeDate: "2024-01-15",
  plaintiff: "João da Silva",
  defendant: "Empresa XYZ Ltda",
  description: "Reclamação por verbas rescisórias",
};

function validLawsuitData() {
  return { ...baseValidLawsuitData, processNumber: uniqueProcessNumber() };
}

describe("POST /v1/labor-lawsuits", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validLawsuitData(), employeeId: "emp-123" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...validLawsuitData(), employeeId: "emp-123" }),
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
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
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
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: "employee-123",
          processNumber: "",
          court: "",
          filingDate: "2024-01-10",
          knowledgeDate: "2024-01-15",
          plaintiff: "",
          defendant: "Empresa XYZ",
          description: "",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("Número do processo é obrigatório");
    expect(messages).toContain("Tribunal é obrigatório");
    expect(messages).toContain("Reclamante é obrigatório");
    expect(messages).toContain("Descrição é obrigatória");
  });

  test("should reject invalid employee", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: "invalid-employee-id",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("should reject future filingDate", async () => {
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
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: employee.id,
          filingDate: futureDate.toISOString().split("T")[0],
          knowledgeDate: futureDate.toISOString().split("T")[0],
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject knowledgeDate before filingDate", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: employee.id,
          filingDate: "2024-06-15",
          knowledgeDate: "2024-06-10",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject conclusionDate before filingDate", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: employee.id,
          filingDate: "2024-06-15",
          knowledgeDate: "2024-06-20",
          conclusionDate: "2024-06-10",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should create labor lawsuit successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const lawsuitData = validLawsuitData();
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...lawsuitData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("labor-lawsuit-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.processNumber).toBe(lawsuitData.processNumber);
    expect(body.data.court).toBe(lawsuitData.court);
    expect(body.data.plaintiff).toBe(lawsuitData.plaintiff);
    expect(body.data.defendant).toBe(lawsuitData.defendant);
    expect(body.data.description).toBe(lawsuitData.description);
  });

  test("should create lawsuit with all optional fields", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const fullData = {
      ...validLawsuitData(),
      employeeId: employee.id,
      plaintiffLawyer: "Dr. Pedro Almeida",
      defendantLawyer: "Dra. Ana Costa",
      claimAmount: 25_000.75,
      progress: "Audiência inicial realizada",
      decision: "Procedente em parte",
      conclusionDate: "2024-06-15",
      appeals: "Recurso ordinário interposto",
      costsExpenses: 1200.5,
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fullData),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.plaintiffLawyer).toBe("Dr. Pedro Almeida");
    expect(body.data.defendantLawyer).toBe("Dra. Ana Costa");
    expect(body.data.claimAmount).toBe(25_000.75);
    expect(body.data.progress).toBe("Audiência inicial realizada");
    expect(body.data.decision).toBe("Procedente em parte");
    expect(body.data.conclusionDate).toBe("2024-06-15");
    expect(body.data.appeals).toBe("Recurso ordinário interposto");
    expect(body.data.costsExpenses).toBe(1200.5);
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from creating lawsuit", async (role) => {
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
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create lawsuit", async () => {
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
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should return 409 when creating with duplicate processNumber", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const existingLawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: employee.id,
          processNumber: existingLawsuit.processNumber,
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("LABOR_LAWSUIT_PROCESS_NUMBER_ALREADY_EXISTS");
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
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_TERMINATED");
  });

  test("should allow creating lawsuit when employee is ON_VACATION", async () => {
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
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validLawsuitData(),
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
