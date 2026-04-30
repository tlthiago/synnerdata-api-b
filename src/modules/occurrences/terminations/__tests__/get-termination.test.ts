import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestTermination } from "@/test/helpers/termination";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/terminations/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-123`)
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-123`, {
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent termination", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-nonexistent`, {
        headers,
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
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_NOT_FOUND");
  });

  test("should return termination by id", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
      type: "RESIGNATION",
      reason: "Nova oportunidade",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(termination.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(termination.employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.type).toBe("RESIGNATION");
    expect(body.data.terminationDate).toBeDefined();
    expect(body.data.lastWorkingDay).toBeDefined();
    expect(body.data.status).toBeDefined();
    expect(["scheduled", "completed", "canceled"]).toContain(body.data.status);
    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBeString();
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();
  });

  test("should allow viewer to get termination", async () => {
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
        headers: viewerResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(termination.id);
  });
});
