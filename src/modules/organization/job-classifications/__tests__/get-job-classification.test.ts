import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { JobClassificationService } from "../job-classification.service";

const BASE_URL = env.API_URL;

describe("GET /v1/job-classifications/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/job-classification-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/job-classification-123`, {
        method: "GET",
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
          method: "GET",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_NOT_FOUND");
  });

  test("should reject job classification from another organization", async () => {
    const { organizationId: org1, user: user1 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobClassification = await JobClassificationService.create({
      organizationId: org1,
      userId: user1.id,
      name: "CBO Org 1",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "GET",
          headers: headers2,
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_NOT_FOUND");
  });

  test("should reject deleted job classification", async () => {
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
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "GET",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_NOT_FOUND");
  });

  test("should return job classification successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "Analista de Sistemas",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "GET",
          headers,
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(jobClassification.id);
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe("Analista de Sistemas");
  });
});
