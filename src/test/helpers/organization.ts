import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type Role, schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp } from "./app";
import type { TestUserResult } from "./user";

const BASE_URL = env.API_URL;

export type TestOrganization = {
  id: string;
  name: string;
  slug: string;
  profileId: string;
};

type CreateTestOrganizationOptions = {
  name?: string;
  slug?: string;
  tradeName?: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  pagarmeCustomerId?: string;
};

/**
 * Creates a test organization with its profile.
 * Does NOT add any members - use addMemberToOrganization for that.
 */
export async function createTestOrganization(
  options: CreateTestOrganizationOptions = {}
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

type AddMemberOptions = {
  organizationId: string;
  role: Role;
};

/**
 * Adds a user to an organization with a specific role.
 * Sets the organization as active in the user's session.
 */
export async function addMemberToOrganization(
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

  await setActiveOrganization(userResult, organizationId);
}

/**
 * Sets the active organization for a user's session.
 */
export async function setActiveOrganization(
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

/**
 * Updates organization profile with pagarmeCustomerId.
 */
export async function setOrganizationCustomerId(
  organizationId: string,
  pagarmeCustomerId: string
): Promise<void> {
  await db
    .update(schema.organizationProfiles)
    .set({ pagarmeCustomerId })
    .where(eq(schema.organizationProfiles.organizationId, organizationId));
}

type CreateOrganizationViaApiOptions = {
  name?: string;
  slug?: string;
  tradeName?: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
};

type CreateOrganizationViaApiResult = {
  organizationId: string;
  name: string;
  slug: string;
};

/**
 * Creates an organization via Better Auth API.
 * This triggers the afterCreateOrganization hook which creates the trial subscription.
 * Use this when you need to test flows that depend on the trial subscription.
 */
export async function createOrganizationViaApi(
  userResult: TestUserResult,
  options: CreateOrganizationViaApiOptions = {}
): Promise<CreateOrganizationViaApiResult> {
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
