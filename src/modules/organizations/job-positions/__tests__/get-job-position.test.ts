import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { JobPositionService } from "../job-position.service";

const BASE_URL = env.API_URL;

describe("GET /v1/job-positions/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/job-position-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/job-position-123`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent job position", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/job-position-nonexistent`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_NOT_FOUND");
  });

  test("should reject job position from another organization", async () => {
    const { organizationId: org1, user: user1 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobPosition = await JobPositionService.create({
      organizationId: org1,
      userId: user1.id,
      name: "Função Org 1",
      description: "Descrição",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "GET",
        headers: headers2,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_NOT_FOUND");
  });

  test("should reject deleted job position", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Função Deleted",
    });

    await JobPositionService.delete(jobPosition.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_NOT_FOUND");
  });

  test("should return job position successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Analista Financeiro",
      description: "Responsável por análise financeira",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(jobPosition.id);
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe("Analista Financeiro");
    expect(body.data.description).toBe("Responsável por análise financeira");
  });
});
