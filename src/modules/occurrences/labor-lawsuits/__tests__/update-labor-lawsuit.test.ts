import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestLaborLawsuit } from "@/test/helpers/labor-lawsuit";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/labor-lawsuits/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/labor-lawsuit-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: "Novo andamento" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/labor-lawsuit-123`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ progress: "Novo andamento" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent lawsuit", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/labor-lawsuit-nonexistent`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ progress: "Novo andamento" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("LABOR_LAWSUIT_NOT_FOUND");
  });

  test("should reject future filingDate on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filingDate: futureDate.toISOString().split("T")[0],
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject knowledgeDate before filingDate on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      filingDate: "2024-06-15",
      knowledgeDate: "2024-06-20",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          knowledgeDate: "2024-06-10",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should update lawsuit", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      progress: "Andamento original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          progress: "Andamento atualizado",
          decision: "Procedente",
          claimAmount: 50_000,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(lawsuit.id);
    expect(body.data.progress).toBe("Andamento atualizado");
    expect(body.data.decision).toBe("Procedente");
    expect(body.data.claimAmount).toBe(50_000);
  });

  test("should clear nullable fields when null is sent", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      court: "1ª Vara do Trabalho de São Paulo",
      filingDate: "2024-06-15",
      knowledgeDate: "2024-06-20",
      progress: "Audiência realizada",
    });

    expect(lawsuit.court).toBe("1ª Vara do Trabalho de São Paulo");
    expect(lawsuit.filingDate).toBe("2024-06-15");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          court: null,
          filingDate: null,
          knowledgeDate: null,
          progress: null,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.court).toBeNull();
    expect(body.data.filingDate).toBeNull();
    expect(body.data.knowledgeDate).toBeNull();
    expect(body.data.progress).toBeNull();
    expect(body.data.plaintiff).toBe(lawsuit.plaintiff);
  });

  test("should not change fields that are not sent (undefined)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      court: "Vara do Trabalho de Campinas",
      filingDate: "2024-06-15",
      knowledgeDate: "2024-06-20",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plaintiff: "Novo Reclamante",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.plaintiff).toBe("Novo Reclamante");
    expect(body.data.court).toBe("Vara do Trabalho de Campinas");
    expect(body.data.filingDate).toBe("2024-06-15");
    expect(body.data.knowledgeDate).toBe("2024-06-20");
  });

  test("should allow partial update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      plaintiff: "Reclamante Original",
      defendant: "Reclamado Original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plaintiff: "Reclamante Atualizado",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.plaintiff).toBe("Reclamante Atualizado");
    expect(body.data.defendant).toBe("Reclamado Original");
  });

  test("should not update lawsuit from another organization", async () => {
    const user1 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const user2 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const lawsuit = await createTestLaborLawsuit({
      organizationId: user1.organizationId,
      userId: user1.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...user2.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ progress: "Tentativa de atualização" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("LABOR_LAWSUIT_NOT_FOUND");
  });

  test.each([
    "viewer",
  ] as const)("should reject %s from updating lawsuit", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
    });

    const member = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(member, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...member.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ progress: "Tentativa" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to update lawsuit", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
    });

    const manager = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(manager, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "PUT",
        headers: {
          ...manager.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ progress: "Atualizado pelo gerente" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.progress).toBe("Atualizado pelo gerente");
  });

  test("should return 409 when changing to existing processNumber", async () => {
    const { createTestEmployee: createEmp } = await import(
      "@/test/helpers/employee"
    );

    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createEmp({
      organizationId,
      userId: user.id,
    });

    const lawsuit1 = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const lawsuit2 = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit2.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          processNumber: lawsuit1.processNumber,
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("LABOR_LAWSUIT_PROCESS_NUMBER_ALREADY_EXISTS");
  });
});
