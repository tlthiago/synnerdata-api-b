import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type Role, schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp } from "@/test/support/app";
import type { TestUserResult } from "./user.factory";

const BASE_URL = env.API_URL;

export type TestOrganization = {
  id: string;
  name: string;
  slug: string;
  profileId: string;
};

type CreateOrganizationOptions = {
  name?: string;
  slug?: string;
  tradeName?: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  pagarmeCustomerId?: string;
};

type AddMemberOptions = {
  organizationId: string;
  role: Role;
};

type CreateViaApiOptions = {
  name?: string;
  slug?: string;
  tradeName?: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
};

type CreateViaApiResult = {
  organizationId: string;
  name: string;
  slug: string;
};

// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern for test utilities
export abstract class OrganizationFactory {
  static async create(
    options: CreateOrganizationOptions = {}
  ): Promise<TestOrganization> {
    const testId = crypto.randomUUID();
    const organizationId = `test-org-${testId}`;
    const profileId = `test-profile-${testId}`;

    const name = options.name ?? `Test Org ${testId.slice(0, 8)}`;
    const slug = options.slug ?? `test-org-${testId.slice(0, 8)}`;

    await db.insert(schema.organizations).values({
      id: organizationId,
      name,
      slug,
      createdAt: new Date(),
    });

    await db.insert(schema.organizationProfiles).values({
      id: profileId,
      organizationId,
      tradeName: options.tradeName ?? `Test Company ${testId.slice(0, 8)}`,
      legalName: options.legalName ?? `Test Legal Name ${testId.slice(0, 8)}`,
      taxId: options.taxId ?? `test-${testId.slice(0, 14)}`,
      phone: options.phone ?? "11999999999",
      mobile: options.phone ?? "11999999999",
      email: options.email ?? `org-${testId}@example.com`,
      pagarmeCustomerId: options.pagarmeCustomerId,
    });

    return {
      id: organizationId,
      name,
      slug,
      profileId,
    };
  }

  static async addMember(
    userResult: TestUserResult,
    options: AddMemberOptions
  ): Promise<void> {
    const { organizationId, role } = options;
    const memberId = `test-member-${crypto.randomUUID()}`;

    await db.insert(schema.members).values({
      id: memberId,
      organizationId,
      userId: userResult.user.id,
      role,
      createdAt: new Date(),
    });

    await OrganizationFactory.setActive(userResult, organizationId);
  }

  static async setActive(
    userResult: TestUserResult,
    organizationId: string
  ): Promise<void> {
    const app = createTestApp();

    const response = await app.handle(
      new Request("http://localhost/api/auth/organization/set-active", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${userResult.session.token}`,
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ organizationId }),
      })
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to set active organization (${response.status}): ${errorBody || "No response body"}`
      );
    }
  }

  static async setCustomerId(
    organizationId: string,
    pagarmeCustomerId: string
  ): Promise<void> {
    await db
      .update(schema.organizationProfiles)
      .set({ pagarmeCustomerId })
      .where(eq(schema.organizationProfiles.organizationId, organizationId));
  }

  static async createViaApi(
    userResult: TestUserResult,
    options: CreateViaApiOptions = {}
  ): Promise<CreateViaApiResult> {
    const app = createTestApp();
    const testId = crypto.randomUUID();

    const name = options.name ?? `Test Org ${testId.slice(0, 8)}`;
    const slug = options.slug ?? `test-org-${testId.slice(0, 8)}`;

    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/organization/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${userResult.session.token}`,
        },
        body: JSON.stringify({ name, slug }),
      })
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to create organization (${response.status}): ${errorBody || "No response body"}`
      );
    }

    const body = await response.json();
    const organizationId = body.id;

    // Update the auto-created minimal profile with test data
    const uniqueTaxId =
      options.taxId ??
      `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 14);

    await db
      .update(schema.organizationProfiles)
      .set({
        tradeName: options.tradeName ?? `Test Company ${testId.slice(0, 8)}`,
        legalName: options.legalName ?? `Test Legal Name ${testId.slice(0, 8)}`,
        taxId: uniqueTaxId,
        phone: options.phone ?? "11999999999",
        mobile: options.phone ?? "11999999999",
        email: options.email ?? `org-${testId}@example.com`,
      })
      .where(eq(schema.organizationProfiles.organizationId, organizationId));

    return {
      organizationId,
      name,
      slug,
    };
  }
}
