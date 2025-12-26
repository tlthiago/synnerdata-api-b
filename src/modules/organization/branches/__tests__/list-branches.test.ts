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

describe("GET /v1/branches", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no branches exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should return branches for organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestBranch({
      organizationId,
      userId: user.id,
      name: "Filial 1",
    });

    await createTestBranch({
      organizationId,
      userId: user.id,
      name: "Filial 2",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(2);
    expect(body.data[0].organizationId).toBe(organizationId);
    expect(body.data[1].organizationId).toBe(organizationId);
  });

  test("should not return branches from other organizations", async () => {
    const {
      headers: headers1,
      organizationId: org1,
      user: user1,
    } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { organizationId: org2, user: user2 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestBranch({
      organizationId: org1,
      userId: user1.id,
      name: "Filial Org 1",
    });

    await createTestBranch({
      organizationId: org2,
      userId: user2.id,
      name: "Filial Org 2",
    });

    // Request as org1
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(1);
    expect(body.data[0].organizationId).toBe(org1);
    expect(body.data[0].name).toBe("Filial Org 1");
  });

  test("should not return deleted branches", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
      name: "Filial Deleted",
    });

    await BranchService.delete(branch.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(0);
  });

  test("should allow viewer to list branches", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestBranch({
      organizationId,
      userId: user.id,
      name: "Filial Viewer Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
  });
});
