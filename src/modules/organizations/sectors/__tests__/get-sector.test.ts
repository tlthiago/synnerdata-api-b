import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { SectorService } from "../sector.service";

const BASE_URL = env.API_URL;

describe("GET /v1/sectors/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/sectors/sector-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/sectors/sector-123`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent sector", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/sectors/sector-nonexistent`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SECTOR_NOT_FOUND");
  });

  test("should reject sector from another organization", async () => {
    const { organizationId: org1, user: user1 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const sector = await SectorService.create({
      organizationId: org1,
      userId: user1.id,
      name: "Setor Org 1",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/sectors/${sector.id}`, {
        method: "GET",
        headers: headers2,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SECTOR_NOT_FOUND");
  });

  test("should reject deleted sector", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const sector = await SectorService.create({
      organizationId,
      userId: user.id,
      name: "Setor Deleted",
    });

    await SectorService.delete(sector.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/sectors/${sector.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SECTOR_NOT_FOUND");
  });

  test("should return sector successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const sector = await SectorService.create({
      organizationId,
      userId: user.id,
      name: "Setor Financeiro",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/sectors/${sector.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(sector.id);
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe("Setor Financeiro");
  });
});
