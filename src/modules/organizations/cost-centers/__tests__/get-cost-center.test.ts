import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { CostCenterService } from "../cost-center.service";

const BASE_URL = env.API_URL;

describe("GET /v1/cost-centers/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/cost-center-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/cost-center-123`, {
        method: "GET",
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
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_NOT_FOUND");
  });

  test("should reject cost center from another organization", async () => {
    const { organizationId: org1, user: user1 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const costCenter = await CostCenterService.create({
      organizationId: org1,
      userId: user1.id,
      name: "Centro de Custo Org 1",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "GET",
        headers: headers2,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_NOT_FOUND");
  });

  test("should reject deleted cost center", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo Deleted",
    });

    await CostCenterService.delete(costCenter.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_NOT_FOUND");
  });

  test("should return cost center successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo Financeiro",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(costCenter.id);
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe("Centro de Custo Financeiro");
    expect(body.data.createdBy).toEqual({ id: user.id, name: user.name });
    expect(body.data.updatedBy).toEqual({ id: user.id, name: user.name });
  });
});
