import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { cboOccupations } from "@/db/schema/cbo-occupations";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

async function seedTestCboOccupations() {
  await db
    .insert(cboOccupations)
    .values([
      {
        id: `cbo-${crypto.randomUUID()}`,
        code: "2124-05",
        title: "Analista de desenvolvimento de sistemas",
        familyCode: "2124",
        familyTitle: "Analistas de sistemas computacionais",
      },
      {
        id: `cbo-${crypto.randomUUID()}`,
        code: "2124-10",
        title: "Analista de redes e de comunicação de dados",
        familyCode: "2124",
        familyTitle: "Analistas de sistemas computacionais",
      },
      {
        id: `cbo-${crypto.randomUUID()}`,
        code: "5101-10",
        title: "Administrador de edifícios",
        familyCode: "5101",
        familyTitle: "Supervisores dos serviços de manutenção de edificações",
      },
    ])
    .onConflictDoNothing();
}

describe("GET /v1/cbo-occupations", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedTestCboOccupations();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations?search=analista`)
    );

    expect(response.status).toBe(401);
  });

  test("should reject search with less than 2 characters", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations?search=a`, {
        headers,
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject request without search param", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations`, {
        headers,
      })
    );

    expect(response.status).toBe(422);
  });

  test("should search by title", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations?search=analista`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(2);
    for (const item of body.data.items) {
      expect(item.title.toLowerCase()).toContain("analista");
    }
  });

  test("should search by code", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations?search=2124`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(2);
    for (const item of body.data.items) {
      expect(item.code).toContain("2124");
    }
  });

  test("should respect pagination", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations?search=analista&limit=1`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBe(1);
    expect(body.data.total).toBeGreaterThanOrEqual(2);
    expect(body.data.limit).toBe(1);
  });

  test("should return empty results for no match", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations?search=zzzznonexistent`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  test("should work for user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations?search=analista`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(2);
  });
});
