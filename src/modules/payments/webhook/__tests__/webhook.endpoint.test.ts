import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

const WEBHOOK_URL = "http://localhost/v1/payments/webhooks/pagarme";

function validPayload() {
  return {
    id: `evt_${crypto.randomUUID()}`,
    type: "charge.paid",
    created_at: new Date().toISOString(),
    data: { subscription: { id: "sub_abc" } },
  };
}

function postWebhook(
  app: TestApp,
  body: unknown,
  authHeader: string | null = createValidAuthHeader()
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  return app.handle(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
}

describe("POST /webhooks/pagarme body validation", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("accepts a valid payload", async () => {
    const response = await postWebhook(app, validPayload());
    expect(response.status).toBe(200);
  });

  test("rejects payload missing id with 422", async () => {
    const { id: _id, ...rest } = validPayload();
    const response = await postWebhook(app, rest);
    expect(response.status).toBe(422);
    const json = (await response.json()) as {
      success: false;
      error: { code: string };
    };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  test("rejects payload missing type with 422", async () => {
    const { type: _type, ...rest } = validPayload();
    const response = await postWebhook(app, rest);
    expect(response.status).toBe(422);
  });

  test("rejects payload missing created_at with 422", async () => {
    const { created_at: _createdAt, ...rest } = validPayload();
    const response = await postWebhook(app, rest);
    expect(response.status).toBe(422);
  });

  test("rejects payload missing data with 422", async () => {
    const { data: _data, ...rest } = validPayload();
    const response = await postWebhook(app, rest);
    expect(response.status).toBe(422);
  });

  test("accepts payload with unknown extra top-level fields (passthrough)", async () => {
    const payload = {
      ...validPayload(),
      account: { id: "acc_123", name: "Lojinha" },
      attempts: 1,
    };
    const response = await postWebhook(app, payload);
    expect(response.status).toBe(200);
  });

  test("rejects payload with wrong type on required field with 422", async () => {
    const payload = { ...validPayload(), id: 42 };
    const response = await postWebhook(app, payload);
    expect(response.status).toBe(422);
  });
});
