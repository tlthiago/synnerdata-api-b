import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { BranchService } from "../branch.service";

const BASE_URL = env.API_URL;

describe("PUT /v1/organization/branches/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/branch-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/branch-123`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated Name" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent branch", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/branch-nonexistent`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated Name" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_NOT_FOUND");
  });

  test("should return 404 for branch from another organization", async () => {
    const { organizationId: org1, user: user1 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const branch = await BranchService.create({
      organizationId: org1,
      userId: user1.id,
      name: "Filial Org 1",
      taxId: `${Date.now()}`.slice(-14).padStart(14, "0"),
      street: "Rua X",
      number: "111",
      neighborhood: "Centro",
      city: "Rio",
      state: "RJ",
      zipCode: "20000000",
      mobile: "21999998888",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          ...headers2,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacked Name" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_NOT_FOUND");
  });

  test("should reject duplicate taxId", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const taxId1 = `${Date.now() + 1}`.slice(-14).padStart(14, "0");
    const taxId2 = `${Date.now() + 2}`.slice(-14).padStart(14, "0");

    await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial 1",
      taxId: taxId1,
      street: "Rua A",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    const branch2 = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial 2",
      taxId: taxId2,
      street: "Rua B",
      number: "200",
      neighborhood: "Jardins",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234568",
      mobile: "11999997777",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch2.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taxId: taxId1 }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_TAX_ID_ALREADY_EXISTS");
  });

  test("should update branch partially", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Original Name",
      taxId: `${Date.now() + 3}`.slice(-14).padStart(14, "0"),
      street: "Rua Original",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated Name" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Updated Name");
    expect(body.data.street).toBe("Rua Original");
  });

  test("should update branch completely", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Original Name",
      taxId: `${Date.now() + 4}`.slice(-14).padStart(14, "0"),
      street: "Rua Original",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    const newTaxId = `${Date.now() + 5}`.slice(-14).padStart(14, "0");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "New Name",
          taxId: newTaxId,
          street: "New Street",
          number: "999",
          complement: "Floor 10",
          neighborhood: "New Neighborhood",
          city: "Rio",
          state: "RJ",
          zipCode: "20000000",
          phone: "2133334444",
          mobile: "21999997777",
          foundedAt: "2015-06-20",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.name).toBe("New Name");
    expect(body.data.taxId).toBe(newTaxId);
    expect(body.data.street).toBe("New Street");
    expect(body.data.city).toBe("Rio");
    expect(body.data.state).toBe("RJ");
    expect(body.data.complement).toBe("Floor 10");
  });

  test("should allow keeping same taxId on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const taxId = `${Date.now() + 6}`.slice(-14).padStart(14, "0");

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Original Name",
      taxId,
      street: "Rua Original",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated Name", taxId }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Updated Name");
    expect(body.data.taxId).toBe(taxId);
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from updating branch", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Test",
      taxId: `${Date.now() + 7}`.slice(-14).padStart(14, "0"),
      street: "Rua Test",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacked Name" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to update branch", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Test",
      taxId: `${Date.now() + 8}`.slice(-14).padStart(14, "0"),
      street: "Rua Test",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Manager Updated" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Manager Updated");
  });

  test("should reject invalid taxId format", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Test Branch",
      taxId: `${Date.now() + 9}`.slice(-14).padStart(14, "0"),
      street: "Rua Test",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taxId: "123" }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject future foundedAt date", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Test Branch",
      taxId: `${Date.now() + 10}`.slice(-14).padStart(14, "0"),
      street: "Rua Test",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          foundedAt: futureDate.toISOString().split("T")[0],
        }),
      })
    );

    expect(response.status).toBe(422);
  });
});
