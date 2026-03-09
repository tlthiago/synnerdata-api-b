import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { generateCnpj } from "@/test/support/faker";

const BASE_URL = env.API_URL;
const POLLING_ENDPOINT = `${BASE_URL}/v1/public/provision-status`;
const TRIAL_ENDPOINT = `${BASE_URL}/v1/payments/admin/provisions/trial`;

function buildTrialPayload() {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    ownerName: `Poll Owner ${id}`,
    ownerEmail: `poll-${id}@example.com`,
    organization: {
      name: `Poll Org Real ${id}`,
      tradeName: `Poll Org ${id}`,
      taxId: generateCnpj(),
      email: `poll-org-${id}@example.com`,
      phone: "11999990000",
    },
    organizationSlug: `poll-org-${id}`,
  };
}

describe("GET /v1/public/provision-status", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();
  });

  // ── Validation ──────────────────────────────────────────────────

  test("should return 422 for invalid email", async () => {
    const response = await app.handle(
      new Request(`${POLLING_ENDPOINT}?email=not-an-email`)
    );

    expect(response.status).toBe(422);
  });

  // ── Not Found ──────────────────────────────────────────────────

  test("should return not_found for unknown email", async () => {
    const response = await app.handle(
      new Request(`${POLLING_ENDPOINT}?email=unknown@example.com`)
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("not_found");
    expect(body.data.activationUrl).toBeNull();
  });

  test("should return not_found for user without provision", async () => {
    const { user } = await UserFactory.create();

    const response = await app.handle(
      new Request(`${POLLING_ENDPOINT}?email=${encodeURIComponent(user.email)}`)
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("not_found");
  });

  // ── Ready (trial provisions are immediately pending_activation) ─

  test("should return ready for pending_activation provision with activationUrl", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildTrialPayload();

    // Create trial provision — immediately goes to pending_activation with activationUrl
    const createResponse = await app.handle(
      new Request(TRIAL_ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(createResponse.status).toBe(200);

    // Poll for status
    const response = await app.handle(
      new Request(
        `${POLLING_ENDPOINT}?email=${encodeURIComponent(payload.ownerEmail)}`
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("ready");
    expect(body.data.activationUrl).toBeString();
  });

  // ── Processing (pending_activation without activationUrl) ──────

  test("should return processing for pending_activation without activationUrl", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildTrialPayload();

    // Create trial provision
    const createResponse = await app.handle(
      new Request(TRIAL_ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(createResponse.status).toBe(200);
    const { data } = await createResponse.json();

    // Manually clear activationUrl to simulate token not yet generated
    await db
      .update(schema.adminOrgProvisions)
      .set({ activationUrl: null })
      .where(eq(schema.adminOrgProvisions.id, data.id));

    // Poll for status
    const response = await app.handle(
      new Request(
        `${POLLING_ENDPOINT}?email=${encodeURIComponent(payload.ownerEmail)}`
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("processing");
    expect(body.data.activationUrl).toBeNull();
  });

  // ── Processing (pending_payment) ──────────────────────────────

  test("should return processing for pending_payment provision", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildTrialPayload();

    // Create trial provision
    const createResponse = await app.handle(
      new Request(TRIAL_ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(createResponse.status).toBe(200);
    const { data } = await createResponse.json();

    // Manually set to pending_payment to simulate checkout flow
    await db
      .update(schema.adminOrgProvisions)
      .set({ status: "pending_payment", activationUrl: null })
      .where(eq(schema.adminOrgProvisions.id, data.id));

    // Poll for status
    const response = await app.handle(
      new Request(
        `${POLLING_ENDPOINT}?email=${encodeURIComponent(payload.ownerEmail)}`
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("processing");
    expect(body.data.activationUrl).toBeNull();
  });

  // ── Not Found (already active) ────────────────────────────────

  test("should return not_found for already-active provision", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildTrialPayload();

    // Create trial provision
    const createResponse = await app.handle(
      new Request(TRIAL_ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(createResponse.status).toBe(200);
    const { data } = await createResponse.json();

    // Manually set to active to simulate completed activation
    await db
      .update(schema.adminOrgProvisions)
      .set({ status: "active", activatedAt: new Date() })
      .where(eq(schema.adminOrgProvisions.id, data.id));

    // Poll for status — active provisions are not returned
    const response = await app.handle(
      new Request(
        `${POLLING_ENDPOINT}?email=${encodeURIComponent(payload.ownerEmail)}`
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("not_found");
  });
});
