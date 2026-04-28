import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestCostCenter } from "@/test/helpers/cost-center";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("Cost center cross-organization access (BOLA — RU-9)", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  async function seedCostCenterInOrgA() {
    const orgA = await createTestUserWithOrganization({ emailVerified: true });
    const costCenter = await createTestCostCenter({
      organizationId: orgA.organizationId,
      userId: orgA.user.id,
    });
    return { orgA, costCenter };
  }

  test("should return 404 on GET when cost center belongs to another organization", async () => {
    const { costCenter } = await seedCostCenterInOrgA();
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "GET",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_NOT_FOUND");
  });

  test("LIST from a different organization does not include cost centers from another org", async () => {
    const { costCenter } = await seedCostCenterInOrgA();
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers`, {
        method: "GET",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    const ids = (body.data as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain(costCenter.id);
  });

  test("should return 404 on PUT when cost center belongs to another organization", async () => {
    const { costCenter } = await seedCostCenterInOrgA();
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "PUT",
        headers: { ...orgB.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cross-org tamper" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_NOT_FOUND");
  });

  test("should return 404 on DELETE when cost center belongs to another organization", async () => {
    const { costCenter } = await seedCostCenterInOrgA();
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "DELETE",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COST_CENTER_NOT_FOUND");
  });
});
