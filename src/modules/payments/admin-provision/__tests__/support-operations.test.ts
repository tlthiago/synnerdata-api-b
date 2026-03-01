import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { generateCnpj } from "@/test/support/faker";

const BASE_URL = env.API_URL;
const PROVISIONS_URL = `${BASE_URL}/v1/payments/admin/provisions`;

async function createTrialProvision(
  app: TestApp,
  headers: Record<string, string>
) {
  const id = crypto.randomUUID().slice(0, 8);
  const payload = {
    ownerName: `Support Owner ${id}`,
    ownerEmail: `support-${id}@example.com`,
    organization: {
      tradeName: `Support Org ${id}`,
      taxId: generateCnpj(),
      email: `support-org-${id}@example.com`,
      phone: "11999990000",
    },
    organizationSlug: `support-org-${id}`,
  };

  const response = await app.handle(
    new Request(`${PROVISIONS_URL}/trial`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

  const body = await response.json();
  return body.data;
}

describe("Admin Provision Support Operations", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();
  });

  // ── Resend Activation ───────────────────────────────────────

  describe("POST /provisions/:id/resend-activation", () => {
    test("should return 401 without session", async () => {
      const response = await app.handle(
        new Request(`${PROVISIONS_URL}/fake-id/resend-activation`, {
          method: "POST",
        })
      );

      expect(response.status).toBe(401);
    });

    test("should return 403 for non-admin user", async () => {
      const { headers } = await UserFactory.create();

      const response = await app.handle(
        new Request(`${PROVISIONS_URL}/fake-id/resend-activation`, {
          method: "POST",
          headers,
        })
      );

      expect(response.status).toBe(403);
    });

    test("should return 404 for non-existent provision", async () => {
      const { headers } = await UserFactory.createAdmin();

      const response = await app.handle(
        new Request(
          `${PROVISIONS_URL}/provision-nonexistent/resend-activation`,
          {
            method: "POST",
            headers,
          }
        )
      );

      expect(response.status).toBe(404);
    });

    test("should resend activation for pending_activation provision", async () => {
      const { headers } = await UserFactory.createAdmin();
      const provision = await createTrialProvision(app, headers);

      const response = await app.handle(
        new Request(`${PROVISIONS_URL}/${provision.id}/resend-activation`, {
          method: "POST",
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.activationUrl).toBeString();
    });
  });

  // ── Delete Provision ───────────────────────────────────────

  describe("DELETE /provisions/:id", () => {
    test("should return 401 without session", async () => {
      const response = await app.handle(
        new Request(`${PROVISIONS_URL}/fake-id`, {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(401);
    });

    test("should return 403 for non-admin user", async () => {
      const { headers } = await UserFactory.create();

      const response = await app.handle(
        new Request(`${PROVISIONS_URL}/fake-id`, {
          method: "DELETE",
          headers,
        })
      );

      expect(response.status).toBe(403);
    });

    test("should return 404 for non-existent provision", async () => {
      const { headers } = await UserFactory.createAdmin();

      const response = await app.handle(
        new Request(`${PROVISIONS_URL}/provision-nonexistent`, {
          method: "DELETE",
          headers,
        })
      );

      expect(response.status).toBe(404);
    });

    test("should delete provision successfully", async () => {
      const { headers } = await UserFactory.createAdmin();
      const provision = await createTrialProvision(app, headers);

      const response = await app.handle(
        new Request(`${PROVISIONS_URL}/${provision.id}`, {
          method: "DELETE",
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);

      // Verify provision is soft-deleted
      const [deletedProvision] = await db
        .select()
        .from(schema.adminOrgProvisions)
        .where(eq(schema.adminOrgProvisions.id, provision.id))
        .limit(1);

      expect(deletedProvision.status).toBe("deleted");
      expect(deletedProvision.deletedAt).toBeDefined();

      // Verify org was hard-deleted
      const [org] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, provision.organizationId))
        .limit(1);

      expect(org).toBeUndefined();

      // Verify user was hard-deleted
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, provision.userId))
        .limit(1);

      expect(user).toBeUndefined();
    });

    test("should return 400 for already-deleted provision", async () => {
      const { headers } = await UserFactory.createAdmin();
      const provision = await createTrialProvision(app, headers);

      // Delete once
      await app.handle(
        new Request(`${PROVISIONS_URL}/${provision.id}`, {
          method: "DELETE",
          headers,
        })
      );

      // Try to delete again
      const response = await app.handle(
        new Request(`${PROVISIONS_URL}/${provision.id}`, {
          method: "DELETE",
          headers,
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("PROVISION_ALREADY_DELETED");
    });
  });
});
