import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestTermination } from "@/test/helpers/termination";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/terminations/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DISMISSAL_WITH_CAUSE" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-123`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DISMISSAL_WITH_CAUSE" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject viewer member from updating termination", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
    });

    const viewerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewerResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "PUT",
        headers: {
          ...viewerResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Atualizado" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject non-existent termination", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-nonexistent`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Atualizado" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_NOT_FOUND");
  });

  test("should reject termination from another organization", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const otherOrgResult = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const otherTermination = await createTestTermination({
      organizationId: otherOrgResult.organizationId,
      userId: otherOrgResult.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${otherTermination.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Atualizado" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_NOT_FOUND");
  });

  test("should update termination successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
      type: "RESIGNATION",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DISMISSAL_WITHOUT_CAUSE",
          reason: "Motivo atualizado",
          noticePeriodDays: 15,
          notes: "Observações atualizadas",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(termination.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(termination.employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.type).toBe("DISMISSAL_WITHOUT_CAUSE");
    expect(body.data.reason).toBe("Motivo atualizado");
    expect(body.data.noticePeriodDays).toBe(15);
    expect(body.data.notes).toBe("Observações atualizadas");
    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBeString();
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();
  });

  test("should allow manager to update termination", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
    });

    const managerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(managerResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "PUT",
        headers: {
          ...managerResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Atualizado pelo manager" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.reason).toBe("Atualizado pelo manager");
  });

  test("should clear nullable fields when null is sent", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
      type: "RESIGNATION",
      reason: "Motivo preenchido",
      noticePeriodDays: 30,
      notes: "Observações preenchidas",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: null,
          noticePeriodDays: null,
          notes: null,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.reason).toBeNull();
    expect(body.data.noticePeriodDays).toBeNull();
    expect(body.data.notes).toBeNull();
    expect(body.data.type).toBe("RESIGNATION");
    expect(body.data.terminationDate).toBe(termination.terminationDate);
    expect(body.data.lastWorkingDay).toBe(termination.lastWorkingDay);
  });

  test("should not change fields that are not sent (undefined)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
      type: "RESIGNATION",
      reason: "Motivo original",
      noticePeriodDays: 30,
      notes: "Observações originais",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DISMISSAL_WITHOUT_CAUSE" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.type).toBe("DISMISSAL_WITHOUT_CAUSE");
    expect(body.data.reason).toBe("Motivo original");
    expect(body.data.noticePeriodDays).toBe(30);
    expect(body.data.notes).toBe("Observações originais");
  });

  test("should update partial fields", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
      type: "RESIGNATION",
      reason: "Motivo original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ noticePeriodDays: 20 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.type).toBe("RESIGNATION");
    expect(body.data.noticePeriodDays).toBe(20);
  });
});
