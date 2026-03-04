import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestOrganization } from "@/test/helpers/organization";
import {
  createTestAdminUser,
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/admin/organizations`;

describe("GET /v1/admin/organizations", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should return 401 without session", async () => {
    const response = await app.handle(new Request(ENDPOINT, { method: "GET" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("should return 403 for non-admin user", async () => {
    const { headers } = await createTestUser();

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should list all organizations with correct data", async () => {
    const { headers } = await createTestAdminUser();

    const org = await createTestOrganization({
      name: "List Test Org",
      tradeName: "List Test Trade",
      taxId: `list-${Date.now()}`.slice(0, 14),
    });

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toBeArray();
    expect(body.data.total).toBeNumber();
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(20);

    const found = body.data.items.find(
      (item: { id: string }) => item.id === org.id
    );
    expect(found).toBeDefined();
    expect(found.name).toBe("List Test Org");
    expect(found.tradeName).toBe("List Test Trade");
    expect(found.slug).toBeString();
    expect(found.createdAt).toBeString();
    expect(typeof found.hasPowerBiUrl).toBe("boolean");
    expect(typeof found.memberCount).toBe("number");
  });

  test("should paginate results", async () => {
    const { headers } = await createTestAdminUser();

    // Create 3 orgs to ensure we have data for pagination
    await Promise.all([
      createTestOrganization({ name: "Paginate Org A" }),
      createTestOrganization({ name: "Paginate Org B" }),
      createTestOrganization({ name: "Paginate Org C" }),
    ]);

    const responsePage1 = await app.handle(
      new Request(`${ENDPOINT}?page=1&limit=2`, { method: "GET", headers })
    );

    expect(responsePage1.status).toBe(200);
    const page1 = await responsePage1.json();
    expect(page1.data.items.length).toBeLessThanOrEqual(2);
    expect(page1.data.page).toBe(1);
    expect(page1.data.limit).toBe(2);
    expect(page1.data.total).toBeGreaterThanOrEqual(3);

    const responsePage2 = await app.handle(
      new Request(`${ENDPOINT}?page=2&limit=2`, { method: "GET", headers })
    );

    expect(responsePage2.status).toBe(200);
    const page2 = await responsePage2.json();
    expect(page2.data.page).toBe(2);
    expect(page2.data.limit).toBe(2);
  });

  test("should search by name and tradeName", async () => {
    const { headers } = await createTestAdminUser();
    const uniqueName = `SearchUnique${Date.now()}`;

    await createTestOrganization({
      name: uniqueName,
      tradeName: "Some Trade Name",
      taxId: `srch-${Date.now()}`.slice(0, 14),
    });

    // Search by name
    const responseByName = await app.handle(
      new Request(`${ENDPOINT}?search=${uniqueName}`, {
        method: "GET",
        headers,
      })
    );

    expect(responseByName.status).toBe(200);
    const byName = await responseByName.json();
    expect(byName.data.items.length).toBeGreaterThanOrEqual(1);
    expect(
      byName.data.items.some(
        (item: { name: string }) => item.name === uniqueName
      )
    ).toBe(true);

    // Search by tradeName
    const uniqueTrade = `TradeUnique${Date.now()}`;
    await createTestOrganization({
      name: "Some Org Name",
      tradeName: uniqueTrade,
      taxId: `trd-${Date.now()}`.slice(0, 14),
    });

    const responseByTrade = await app.handle(
      new Request(`${ENDPOINT}?search=${uniqueTrade}`, {
        method: "GET",
        headers,
      })
    );

    expect(responseByTrade.status).toBe(200);
    const byTrade = await responseByTrade.json();
    expect(byTrade.data.items.length).toBeGreaterThanOrEqual(1);
    expect(
      byTrade.data.items.some(
        (item: { tradeName: string }) => item.tradeName === uniqueTrade
      )
    ).toBe(true);
  });

  test("should return empty items when search has no matches", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(
        `${ENDPOINT}?search=nonexistent-org-name-that-will-never-match-${Date.now()}`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  test("should include memberCount for organizations with members", async () => {
    const { headers } = await createTestAdminUser();

    // createTestUserWithOrganization creates a user + org + member (owner role)
    const { organizationId } = await createTestUserWithOrganization();

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    const orgWithMember = body.data.items.find(
      (item: { id: string }) => item.id === organizationId
    );
    expect(orgWithMember).toBeDefined();
    expect(orgWithMember.memberCount).toBeGreaterThanOrEqual(1);
  });
});
