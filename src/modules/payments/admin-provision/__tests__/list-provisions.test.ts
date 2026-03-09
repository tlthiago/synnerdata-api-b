import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { generateCnpj } from "@/test/support/faker";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/admin/provisions`;

function buildPayload() {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    ownerName: `List Owner ${id}`,
    ownerEmail: `list-owner-${id}@example.com`,
    organization: {
      name: `List Org ${id}`,
      tradeName: `List Org ${id}`,
      taxId: generateCnpj(),
      email: `list-org-${id}@example.com`,
    },
    organizationSlug: `list-org-${id}`,
  };
}

describe("GET /v1/payments/admin/provisions", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();
  });

  // ── Authentication / Authorization ──────────────────────────────

  test("should return 401 without session", async () => {
    const response = await app.handle(new Request(ENDPOINT));

    expect(response.status).toBe(401);
  });

  test("should return 403 for non-admin user", async () => {
    const { headers } = await UserFactory.create();

    const response = await app.handle(new Request(ENDPOINT, { headers }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // ── Success ──────────────────────────────────────────────────

  test("should list provisions with default pagination", async () => {
    const { headers } = await UserFactory.createAdmin();

    // Create a provision via the trial endpoint so we have data
    const postResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/admin/provisions/trial`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      })
    );

    expect(postResponse.status).toBe(200);

    const response = await app.handle(new Request(ENDPOINT, { headers }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(body.pagination.limit).toBe(20);
    expect(body.pagination.offset).toBe(0);
  });

  test("should filter provisions by status", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(`${ENDPOINT}?status=pending_activation`, { headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    for (const item of body.data) {
      expect(item.status).toBe("pending_activation");
    }
  });

  test("should filter provisions by type", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(`${ENDPOINT}?type=trial`, { headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    for (const item of body.data) {
      expect(item.type).toBe("trial");
    }
  });

  test("should respect pagination params", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(`${ENDPOINT}?limit=1&offset=0`, { headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.offset).toBe(0);
  });
});
