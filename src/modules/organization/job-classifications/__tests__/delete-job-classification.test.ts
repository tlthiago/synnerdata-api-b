import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { JobClassificationService } from "../job-classification.service";

const BASE_URL = env.API_URL;

describe("DELETE /v1/job-classifications/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/job-classification-123`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/job-classification-123`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent job classification", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/job-classification-nonexistent`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_NOT_FOUND");
  });

  test("should reject already deleted job classification", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO to Delete",
    });

    // First delete
    await JobClassificationService.delete(
      jobClassification.id,
      organizationId,
      user.id
    );

    // Try to delete again
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_ALREADY_DELETED");
  });

  test("should soft delete job classification successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO to Soft Delete",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(jobClassification.id);
    expect(body.data.deletedAt).toBeDefined();
    expect(body.data.deletedBy).toBeDefined();
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from deleting job classification", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Delete Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "DELETE",
          headers: memberResult.headers,
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to delete job classification", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Manager Delete Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "DELETE",
          headers: memberResult.headers,
        }
      )
    );

    expect(response.status).toBe(200);
  });
});
