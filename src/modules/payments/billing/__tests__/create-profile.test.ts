import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { faker, generateCnpj, generateMobile } from "@/test/support/faker";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/billing/profile`;

function generateValidInput() {
  return {
    legalName: faker.company.name(),
    taxId: generateCnpj(),
    email: faker.internet.email(),
    phone: generateMobile(),
  };
}

describe("POST /payments/billing/profile", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generateValidInput()),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-owner users (manager)", async () => {
    const org = await OrganizationFactory.create();
    const manager = await UserFactory.create();
    await OrganizationFactory.addMember(manager, {
      organizationId: org.id,
      role: "manager",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...manager.headers, "Content-Type": "application/json" },
        body: JSON.stringify(generateValidInput()),
      })
    );

    expect(response.status).toBe(403);
  });

  test("should create billing profile with valid data", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization();

    const input = generateValidInput();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("bp-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.legalName).toBe(input.legalName);
    expect(body.data.taxId).toBe(input.taxId);
    expect(body.data.email).toBe(input.email);
    expect(body.data.phone).toBe(input.phone);
    expect(body.data.pagarmeCustomerId).toBeNull();
  });

  test("should reject duplicate billing profile for same organization", async () => {
    const { headers } = await UserFactory.createWithOrganization();

    const input = generateValidInput();

    const firstResponse = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(generateValidInput()),
      })
    );
    expect(secondResponse.status).toBe(409);
  });

  test("should reject invalid email", async () => {
    const { headers } = await UserFactory.createWithOrganization();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...generateValidInput(),
          email: "invalid-email",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject missing required fields", async () => {
    const { headers } = await UserFactory.createWithOrganization();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: faker.company.name(),
          // missing taxId, email, phone
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject taxId too short", async () => {
    const { headers } = await UserFactory.createWithOrganization();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...generateValidInput(),
          taxId: "123", // too short
        }),
      })
    );

    expect(response.status).toBe(422);
  });
});
