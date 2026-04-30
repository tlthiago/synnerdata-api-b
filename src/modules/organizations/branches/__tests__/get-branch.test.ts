import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestBranch } from "@/test/helpers/branch";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { BranchService } from "../branch.service";

const BASE_URL = env.API_URL;

describe("GET /v1/branches/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/branch-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/branch-123`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent branch", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/branch-nonexistent`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_NOT_FOUND");
  });

  test("should return 404 for branch from another organization", async () => {
    const { organizationId: org1, user: user1 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const branch = await createTestBranch({
      organizationId: org1,
      userId: user1.id,
    });

    // Try to access as org2
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
        method: "GET",
        headers: headers2,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_NOT_FOUND");
  });

  test("should return branch successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
      name: "Filial Get Test",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(branch.id);
    expect(body.data.name).toBe("Filial Get Test");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.createdBy).toEqual({ id: user.id, name: user.name });
    expect(body.data.updatedBy).toEqual({ id: user.id, name: user.name });
  });

  test("should return 404 for deleted branch", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
    });

    await BranchService.delete(branch.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_NOT_FOUND");
  });

  test("should allow viewer to get branch", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe(branch.id);
  });
});
