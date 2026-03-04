import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { generateCnpj } from "@/test/helpers/faker";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

const validBranchData = {
  name: "Filial Centro",
  taxId: generateCnpj(),
  street: "Rua das Flores",
  number: "123",
  complement: "Sala 101",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  zipCode: "01234567",
  phone: "1133334444",
  mobile: "11999998888",
  foundedAt: "2020-01-15",
};

describe("POST /v1/branches", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBranchData),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validBranchData),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject duplicate taxId in branches", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const uniqueTaxId = generateCnpj();

    // Create first branch
    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validBranchData,
          taxId: uniqueTaxId,
        }),
      })
    );
    expect(firstResponse.status).toBe(200);

    // Try to create second branch with same taxId (different organization)
    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const secondResponse = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...headers2,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validBranchData,
          taxId: uniqueTaxId,
        }),
      })
    );

    expect(secondResponse.status).toBe(409);
    const body = await secondResponse.json();
    expect(body.error.code).toBe("BRANCH_TAX_ID_ALREADY_EXISTS");
  });

  test("should reject duplicate taxId in organization_profiles", async () => {
    const { addMemberToOrganization, createTestOrganization } = await import(
      "@/test/helpers/organization"
    );

    // Create organization with a valid 14-digit taxId
    const orgTaxId = generateCnpj();
    const organization = await createTestOrganization({ taxId: orgTaxId });

    const userResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(userResult, {
      organizationId: organization.id,
      role: "owner",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...userResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validBranchData,
          taxId: orgTaxId,
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_TAX_ID_ALREADY_EXISTS");
  });

  test("should reject missing required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject invalid taxId format", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validBranchData,
          taxId: "123", // Invalid - should be 14 digits
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject future foundedAt date", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validBranchData,
          taxId: generateCnpj(),
          foundedAt: futureDate.toISOString().split("T")[0],
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should create branch successfully", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const uniqueTaxId = generateCnpj();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validBranchData,
          taxId: uniqueTaxId,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("branch-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe(validBranchData.name);
    expect(body.data.taxId).toBe(uniqueTaxId);
    expect(body.data.street).toBe(validBranchData.street);
    expect(body.data.city).toBe(validBranchData.city);
    expect(body.data.state).toBe(validBranchData.state);
  });

  test("should create branch without optional fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const uniqueTaxId = generateCnpj();
    const {
      complement: _,
      phone: __,
      foundedAt: ___,
      ...requiredFields
    } = validBranchData;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...requiredFields,
          taxId: uniqueTaxId,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.complement).toBeNull();
    expect(body.data.phone).toBeNull();
    expect(body.data.foundedAt).toBeNull();
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from creating branch", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validBranchData,
          taxId: generateCnpj(),
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create branch", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const uniqueTaxId = generateCnpj();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validBranchData,
          taxId: uniqueTaxId,
        }),
      })
    );

    expect(response.status).toBe(200);
  });
});
