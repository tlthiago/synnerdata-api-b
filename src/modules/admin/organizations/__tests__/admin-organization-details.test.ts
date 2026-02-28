import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  addMemberToOrganization,
  createTestOrganization,
} from "@/test/helpers/organization";
import {
  createTestAdminUser,
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/admin/organizations/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests (401)", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/organizations/some-id`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin users (403)", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/organizations/some-id`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
  });

  test("should return 404 for non-existent organization", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/organizations/non-existent-org-id`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("ORGANIZATION_NOT_FOUND");
  });

  test("should return full organization details with members", async () => {
    const { headers } = await createTestAdminUser();

    const organization = await createTestOrganization({
      name: "Empresa Teste",
      tradeName: "Empresa Teste Ltda",
      email: "contato@empresa.com",
      phone: "11999999999",
    });

    const ownerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(ownerResult, {
      organizationId: organization.id,
      role: "owner",
    });

    const viewerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewerResult, {
      organizationId: organization.id,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/organizations/${organization.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const { data } = body;
    expect(data.id).toBe(organization.id);
    expect(data.name).toBe("Empresa Teste");
    expect(data.slug).toBe(organization.slug);
    expect(data.createdAt).toBeDefined();

    expect(data.profile).not.toBeNull();
    expect(data.profile.tradeName).toBe("Empresa Teste Ltda");
    expect(data.profile.email).toBe("contato@empresa.com");
    expect(data.profile.phone).toBe("11999999999");

    expect(data.memberCount).toBe(2);
    expect(data.members).toHaveLength(2);

    const owner = data.members.find(
      (m: { userId: string }) => m.userId === ownerResult.user.id
    );
    expect(owner).toBeDefined();
    expect(owner.role).toBe("owner");
    expect(owner.user.name).toBe(ownerResult.user.name);
    expect(owner.user.email).toBe(ownerResult.user.email);

    const viewer = data.members.find(
      (m: { userId: string }) => m.userId === viewerResult.user.id
    );
    expect(viewer).toBeDefined();
    expect(viewer.role).toBe("viewer");
  });

  test("should return null profile when org has no profile", async () => {
    const { headers } = await createTestAdminUser();

    const testId = crypto.randomUUID();
    const orgId = `test-org-${testId}`;

    await db.insert(schema.organizations).values({
      id: orgId,
      name: `Org Sem Profile ${testId.slice(0, 8)}`,
      slug: `org-sem-profile-${testId.slice(0, 8)}`,
      createdAt: new Date(),
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/organizations/${orgId}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.profile).toBeNull();
    expect(body.data.memberCount).toBe(0);
    expect(body.data.members).toHaveLength(0);
    expect(body.data.subscription).toBeNull();
  });
});

describe("PUT /v1/admin/organizations/:id/power-bi-url", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests (401)", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/organizations/some-id/power-bi-url`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://app.powerbi.com/test" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin users (403)", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/organizations/some-id/power-bi-url`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://app.powerbi.com/test" }),
      })
    );

    expect(response.status).toBe(403);
  });

  test("should update pbUrl with valid URL", async () => {
    const { headers } = await createTestAdminUser();
    const organization = await createTestOrganization();

    const pbUrl = "https://app.powerbi.com/view?r=test-embed-id";

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/admin/organizations/${organization.id}/power-bi-url`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ url: pbUrl }),
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.pbUrl).toBe(pbUrl);

    const [profile] = await db
      .select({ pbUrl: schema.organizationProfiles.pbUrl })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organization.id))
      .limit(1);

    expect(profile.pbUrl).toBe(pbUrl);
  });

  test("should remove pbUrl with null", async () => {
    const { headers } = await createTestAdminUser();
    const organization = await createTestOrganization();

    await db
      .update(schema.organizationProfiles)
      .set({ pbUrl: "https://app.powerbi.com/existing" })
      .where(eq(schema.organizationProfiles.organizationId, organization.id));

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/admin/organizations/${organization.id}/power-bi-url`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ url: null }),
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.pbUrl).toBeNull();

    const [profile] = await db
      .select({ pbUrl: schema.organizationProfiles.pbUrl })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organization.id))
      .limit(1);

    expect(profile.pbUrl).toBeNull();
  });

  test("should reject invalid URL (422)", async () => {
    const { headers } = await createTestAdminUser();
    const organization = await createTestOrganization();

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/admin/organizations/${organization.id}/power-bi-url`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ url: "not-a-valid-url" }),
        }
      )
    );

    expect(response.status).toBe(422);
  });

  test("should return 404 for non-existent organization", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/admin/organizations/non-existent-org-id/power-bi-url`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            url: "https://app.powerbi.com/test",
          }),
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("ORGANIZATION_NOT_FOUND");
  });
});
