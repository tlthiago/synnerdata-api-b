import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestBranch } from "@/test/helpers/branch";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { BranchService } from "../branch.service";

const BASE_URL = env.API_URL;

describe("DELETE /v1/branches/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/branch-123`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/branch-123`, {
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
      new Request(`${BASE_URL}/v1/branches/branch-nonexistent`, {
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

    const branch = await createTestBranch({
      organizationId: org1,
      userId: user1.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
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

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
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
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
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

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
    });

    // First delete
    await BranchService.delete(branch.id, organizationId, user.id);

    // Try to delete again via API
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
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

    const branch1 = await createTestBranch({
      organizationId,
      userId: user.id,
      name: "Filial Active",
    });

    const branch2 = await createTestBranch({
      organizationId,
      userId: user.id,
      name: "Filial to Delete",
    });

    // Delete branch2
    await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch2.id}`, {
        method: "DELETE",
        headers,
      })
    );

    // List branches
    const listResponse = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
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

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
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

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
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

    const taxId = `${Date.now()}`.slice(-14).padStart(14, "0");

    const branch = await createTestBranch({
      organizationId,
      userId: user.id,
      taxId,
    });

    // Delete the branch
    await app.handle(
      new Request(`${BASE_URL}/v1/branches/${branch.id}`, {
        method: "DELETE",
        headers,
      })
    );

    // Create new branch with same taxId
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/branches`, {
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
