import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { createTestWarning } from "@/test/helpers/warning";

const BASE_URL = env.API_URL;

describe("PUT /v1/warnings/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/warning-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Updated reason" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/warning-123`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Updated reason" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent warning", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/warning-nonexistent`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Updated reason" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("WARNING_NOT_FOUND");
  });

  test("should reject warning from other organization", async () => {
    const { headers: headers1 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { organizationId: org2, user: user2 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const warning = await createTestWarning({
      organizationId: org2,
      userId: user2.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...headers1,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Updated reason" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("WARNING_NOT_FOUND");
  });

  test("should reject future date on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: futureDate.toISOString().split("T")[0],
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject acknowledgedAt before warning date", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
      date: "2024-06-15",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acknowledged: true,
          acknowledgedAt: "2024-06-14T10:00:00.000Z",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject when date is moved after existing acknowledgedAt", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
      date: "2024-06-10",
      acknowledged: true,
      acknowledgedAt: "2024-06-12T10:00:00.000Z",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: "2024-06-20",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should update warning successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
      reason: "Original reason",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Updated reason" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(warning.id);
    expect(body.data.reason).toBe("Updated reason");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBeString();
    expect(body.data.employee.name).toBeString();
  });

  test("should reject update when changing to duplicate date and type", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const warning1 = await createTestWarning({
      organizationId,
      userId: user.id,
      date: "2024-05-10",
      type: "verbal",
    });

    const warning2 = await createTestWarning({
      organizationId,
      userId: user.id,
      date: "2024-05-15",
      type: "verbal",
      employeeId: warning1.employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning2.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2024-05-10" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("WARNING_DUPLICATE");
  });

  test("should allow self-update without duplicate error", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
      date: "2024-05-20",
      type: "written",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2024-05-20", reason: "Updated" }),
      })
    );

    expect(response.status).toBe(200);
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from updating warning", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Updated reason" }),
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

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
      date: "2024-06-10",
      description: "Descrição original",
      witnessName: "Testemunha original",
      acknowledged: true,
      acknowledgedAt: "2024-06-10T14:00:00.000Z",
      notes: "Observação original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: null,
          witnessName: null,
          acknowledgedAt: null,
          notes: null,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.description).toBeNull();
    expect(body.data.witnessName).toBeNull();
    expect(body.data.acknowledgedAt).toBeNull();
    expect(body.data.notes).toBeNull();
    expect(body.data.reason).toBe(warning.reason);
    expect(body.data.type).toBe(warning.type);
  });

  test("should not change fields that are not sent (undefined)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
      date: "2024-06-10",
      description: "Descrição original",
      witnessName: "Testemunha original",
      acknowledged: true,
      acknowledgedAt: "2024-06-10T14:00:00.000Z",
      notes: "Observação original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Novo motivo" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.reason).toBe("Novo motivo");
    expect(body.data.description).toBe("Descrição original");
    expect(body.data.witnessName).toBe("Testemunha original");
    expect(body.data.acknowledgedAt).not.toBeNull();
    expect(body.data.notes).toBe("Observação original");
  });

  test("should allow manager to update warning", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const warning = await createTestWarning({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${warning.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Updated by manager" }),
      })
    );

    expect(response.status).toBe(200);
  });
});
