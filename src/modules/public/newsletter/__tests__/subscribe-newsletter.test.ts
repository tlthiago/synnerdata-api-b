import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/public/newsletter/subscribe`;

describe("POST /v1/public/newsletter/subscribe", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    await db.delete(schema.newsletterSubscribers);
  });

  it("should subscribe email successfully", async () => {
    const email = "test@example.com";

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Inscrição realizada com sucesso");

    const [record] = await db
      .select()
      .from(schema.newsletterSubscribers)
      .where(eq(schema.newsletterSubscribers.email, email))
      .limit(1);

    expect(record).toBeDefined();
    expect(record.status).toBe("active");
    expect(record.id).toStartWith("newsletter-");
  });

  it("should reject duplicate active email", async () => {
    const email = "duplicate@example.com";

    const firstResponse = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
    );
    expect(secondResponse.status).toBe(409);

    const body = await secondResponse.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
  });

  it("should reactivate unsubscribed email", async () => {
    const email = "reactivate@example.com";

    await db.insert(schema.newsletterSubscribers).values({
      id: `newsletter-${crypto.randomUUID()}`,
      email,
      status: "unsubscribed",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Inscrição realizada com sucesso");

    const [record] = await db
      .select()
      .from(schema.newsletterSubscribers)
      .where(eq(schema.newsletterSubscribers.email, email))
      .limit(1);

    expect(record).toBeDefined();
    expect(record.status).toBe("active");
  });

  it("should reject invalid email", async () => {
    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      })
    );

    expect(response.status).toBe(422);
  });
});
