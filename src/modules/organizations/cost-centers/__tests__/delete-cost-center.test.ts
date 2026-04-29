import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { CostCenterService } from "../cost-center.service";

const BASE_URL = env.API_URL;

describe("DELETE /v1/cost-centers/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/cost-center-123`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/cost-center-123`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent cost center", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/cost-center-nonexistent`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_NOT_FOUND");
  });

  test("should reject already deleted cost center", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo to Delete",
    });

    // First delete
    await CostCenterService.delete(costCenter.id, organizationId, user.id);

    // Try to delete again
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_ALREADY_DELETED");
  });

  test("should soft delete cost center successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo to Soft Delete",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(costCenter.id);
    expect(body.data.deletedAt).toBeDefined();
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from deleting cost center", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo Delete Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "DELETE",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to delete cost center", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo Manager Delete Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "DELETE",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
  });
});
