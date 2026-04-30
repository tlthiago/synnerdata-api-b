import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { JobClassificationService } from "../job-classification.service";

const BASE_URL = env.API_URL;

describe("GET /v1/job-classifications", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no job classifications exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
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

  test("should return job classifications for organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "Analista de Sistemas",
    });

    await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "Desenvolvedor Backend",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
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
    for (const item of body.data) {
      expect(item.createdBy).toEqual({ id: user.id, name: user.name });
      expect(item.updatedBy).toEqual({ id: user.id, name: user.name });
    }
  });

  test("should not return job classifications from other organizations", async () => {
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

    await JobClassificationService.create({
      organizationId: org1,
      userId: user1.id,
      name: "CBO Org 1",
    });

    await JobClassificationService.create({
      organizationId: org2,
      userId: user2.id,
      name: "CBO Org 2",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(1);
    expect(body.data[0].organizationId).toBe(org1);
    expect(body.data[0].name).toBe("CBO Org 1");
  });

  test("should not return deleted job classifications", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Deleted",
    });

    await JobClassificationService.delete(
      jobClassification.id,
      organizationId,
      user.id
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(0);
  });

  test("should allow viewer to list job classifications", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Viewer Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
  });
});
