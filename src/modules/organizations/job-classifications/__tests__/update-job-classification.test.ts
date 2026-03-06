import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { JobClassificationService } from "../job-classification.service";

const BASE_URL = env.API_URL;

describe("PUT /v1/job-classifications/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/job-classification-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/job-classification-123`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
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
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated" }),
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_NOT_FOUND");
  });

  test("should update job classification name successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Original",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "CBO Atualizado" }),
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(jobClassification.id);
    expect(body.data.name).toBe("CBO Atualizado");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from updating job classification", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Test",
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
          method: "PUT",
          headers: {
            ...memberResult.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated" }),
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to update job classification", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Manager Test",
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
          method: "PUT",
          headers: {
            ...memberResult.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated by Manager" }),
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Updated by Manager");
  });

  test("should return 409 when updating job classification to duplicate name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO A",
    });

    const jobClassificationB = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO B",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassificationB.id}`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "CBO A" }),
        }
      )
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_ALREADY_EXISTS");
  });

  test("should return 409 when updating job classification to duplicate name (case-insensitive)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO A",
    });

    const jobClassificationB = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO B",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassificationB.id}`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "cbo a" }),
        }
      )
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_ALREADY_EXISTS");
  });

  test("should allow updating job classification to its own name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Mesmo Nome",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "CBO Mesmo Nome" }),
        }
      )
    );

    expect(response.status).toBe(200);
  });
});
