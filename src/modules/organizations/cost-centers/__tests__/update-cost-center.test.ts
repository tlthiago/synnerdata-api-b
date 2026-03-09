import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { CostCenterService } from "../cost-center.service";

const BASE_URL = env.API_URL;

describe("PUT /v1/cost-centers/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/cost-center-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/cost-center-123`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
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
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_NOT_FOUND");
  });

  test("should update cost center name successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo Original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Centro de Custo Atualizado" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(costCenter.id);
    expect(body.data.name).toBe("Centro de Custo Atualizado");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from updating cost center", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to update cost center", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo Manager Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated by Manager" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Updated by Manager");
  });

  test("should return 409 when updating cost center to duplicate name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo A",
    });

    const costCenterB = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo B",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenterB.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Centro de Custo A" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_ALREADY_EXISTS");
  });

  test("should return 409 when updating cost center to duplicate name (case-insensitive)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo A",
    });

    const costCenterB = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo B",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenterB.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "CENTRO DE CUSTO A" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_ALREADY_EXISTS");
  });

  test("should allow updating cost center to its own name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const costCenter = await CostCenterService.create({
      organizationId,
      userId: user.id,
      name: "Centro de Custo Mesmo Nome",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Centro de Custo Mesmo Nome" }),
      })
    );

    expect(response.status).toBe(200);
  });
});
