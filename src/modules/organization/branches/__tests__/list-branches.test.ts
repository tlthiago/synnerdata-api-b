import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { BranchService } from "../branch.service";

const BASE_URL = env.API_URL;

describe("GET /v1/organization/branches", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no branches exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should return branches for organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    // Create branches directly using service
    await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial 1",
      taxId: `${Date.now()}`.slice(-14).padStart(14, "0"),
      street: "Rua A",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      mobile: "11999998888",
    });

    await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial 2",
      taxId: `${Date.now() + 1}`.slice(-14).padStart(14, "0"),
      street: "Rua B",
      number: "200",
      neighborhood: "Jardins",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234568",
      mobile: "11999997777",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(2);
    expect(body.data[0].organizationId).toBe(organizationId);
    expect(body.data[1].organizationId).toBe(organizationId);
  });

  test("should not return branches from other organizations", async () => {
    const {
      headers: headers1,
      organizationId: org1,
      user: user1,
    } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { organizationId: org2, user: user2 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    // Create branch for org1
    await BranchService.create({
      organizationId: org1,
      userId: user1.id,
      name: "Filial Org 1",
      taxId: `${Date.now() + 10}`.slice(-14).padStart(14, "0"),
      street: "Rua X",
      number: "111",
      neighborhood: "Centro",
      city: "Rio",
      state: "RJ",
      zipCode: "20000000",
      mobile: "21999998888",
    });

    // Create branch for org2
    await BranchService.create({
      organizationId: org2,
      userId: user2.id,
      name: "Filial Org 2",
      taxId: `${Date.now() + 11}`.slice(-14).padStart(14, "0"),
      street: "Rua Y",
      number: "222",
      neighborhood: "Copacabana",
      city: "Rio",
      state: "RJ",
      zipCode: "20000001",
      mobile: "21999997777",
    });

    // Request as org1
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(1);
    expect(body.data[0].organizationId).toBe(org1);
    expect(body.data[0].name).toBe("Filial Org 1");
  });

  test("should not return deleted branches", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    // Create and delete a branch
    const branch = await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Deleted",
      taxId: `${Date.now() + 20}`.slice(-14).padStart(14, "0"),
      street: "Rua Z",
      number: "333",
      neighborhood: "Centro",
      city: "Belo Horizonte",
      state: "MG",
      zipCode: "30000000",
      mobile: "31999998888",
    });

    await BranchService.delete(branch.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(0);
  });

  test("should allow viewer to list branches", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await BranchService.create({
      organizationId,
      userId: user.id,
      name: "Filial Viewer Test",
      taxId: `${Date.now() + 30}`.slice(-14).padStart(14, "0"),
      street: "Rua V",
      number: "444",
      neighborhood: "Centro",
      city: "Curitiba",
      state: "PR",
      zipCode: "80000000",
      mobile: "41999998888",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organization/branches`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
  });
});
