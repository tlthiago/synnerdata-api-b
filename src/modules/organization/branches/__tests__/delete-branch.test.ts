import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { BranchService } from "../branch.service";

const BASE_URL = env.API_URL;

describe("DELETE /v1/organization/branches/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/branch-123`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/branch-123`, {
        method: "DELETE",
        headers,
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
        method: "DELETE",
        headers,
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
        method: "DELETE",
        headers: headers2,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_NOT_FOUND");
  });

  test("should soft delete branch successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial to Delete",
      taxId: `${Date.now() + 1}`.slice(-14).padStart(14, "0"),
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
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(branch.id);
    expect(body.data.deletedAt).toBeDefined();

    // Verify branch is no longer accessible via GET
    const getResponse = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(getResponse.status).toBe(404);
  });

  test("should return 404 for already deleted branch", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Double Delete",
      taxId: `${Date.now() + 2}`.slice(-14).padStart(14, "0"),
      street: "Rua Z",
      number: "333",
      neighborhood: "Centro",
      city: "Belo Horizonte",
      state: "MG",
      zipCode: "30000000",
      mobile: "31999998888",
    });

    // First delete
    await BranchService.delete(branch.id, organizationId, user.id);

    // Try to delete again via API
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("BRANCH_ALREADY_DELETED");
  });

  test("should not include deleted branch in list", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const branch1 = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Active",
      taxId: `${Date.now() + 3}`.slice(-14).padStart(14, "0"),
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
      name: "Filial to Delete",
      taxId: `${Date.now() + 4}`.slice(-14).padStart(14, "0"),
      street: "Rua B",
      number: "200",
      neighborhood: "Jardins",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234568",
      mobile: "11999997777",
    });

    // Delete branch2
    await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch2.id}`, {
        method: "DELETE",
        headers,
      })
    );

    // List branches
    const listResponse = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();

    expect(listBody.data.length).toBe(1);
    expect(listBody.data[0].id).toBe(branch1.id);
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from deleting branch", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Protected",
      taxId: `${Date.now() + 5}`.slice(-14).padStart(14, "0"),
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
        method: "DELETE",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to delete branch", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Manager Delete",
      taxId: `${Date.now() + 6}`.slice(-14).padStart(14, "0"),
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
        method: "DELETE",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.deletedAt).toBeDefined();
  });

  test("should allow reusing taxId after soft delete", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const taxId = `${Date.now() + 7}`.slice(-14).padStart(14, "0");

    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Original",
      taxId,
      street: "Rua Test",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    // Delete the branch
    await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches/${branch.id}`, {
        method: "DELETE",
        headers,
      })
    );

    // Create new branch with same taxId
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Filial Reused TaxId",
          taxId,
          street: "Rua Nova",
          number: "200",
          neighborhood: "Jardins",
          city: "São Paulo",
          state: "SP",
          zipCode: "01234568",
          mobile: "11999996666",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.taxId).toBe(taxId);
    expect(body.data.name).toBe("Filial Reused TaxId");
  });
});
