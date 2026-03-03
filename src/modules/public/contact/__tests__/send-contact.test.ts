import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import { faker, generateMobile } from "@/test/support/faker";
import { clearMailbox, waitForContactEmail } from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const CONTACT_RECIPIENT = "contato@synnerdata.com.br";

function buildValidBody() {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    company: faker.company.name(),
    phone: generateMobile(),
    subject: faker.lorem.sentence({ min: 3, max: 6 }),
    message: faker.lorem.paragraph(),
  };
}

describe("POST /v1/public/contact", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    await clearMailbox(CONTACT_RECIPIENT);
  });

  test("should send contact message and deliver email via MailHog", async () => {
    const validBody = buildValidBody();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toEqual({
      success: true,
      message: "Mensagem enviada com sucesso",
    });

    const emailData = await waitForContactEmail(CONTACT_RECIPIENT);

    expect(emailData.subject).toContain("[Contato Site]");
    expect(emailData.body).toContain(validBody.email);
  });

  test("should include phone in email when provided", async () => {
    const validBody = buildValidBody();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );

    expect(response.status).toBe(200);

    const emailData = await waitForContactEmail(CONTACT_RECIPIENT);
    expect(emailData.body).toContain(validBody.phone);
  });

  test("should send email without phone when not provided", async () => {
    const { phone: _, ...bodyWithoutPhone } = buildValidBody();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyWithoutPhone),
      })
    );

    expect(response.status).toBe(200);

    const emailData = await waitForContactEmail(CONTACT_RECIPIENT);
    expect(emailData.subject).toContain("[Contato Site]");
  });

  test("should reject invalid phone format", async () => {
    const validBody = buildValidBody();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validBody,
          phone: "123",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject missing required fields", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: faker.person.fullName() }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject message shorter than 10 characters", async () => {
    const validBody = buildValidBody();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validBody,
          message: "Curta",
        }),
      })
    );

    expect(response.status).toBe(422);
  });
});
