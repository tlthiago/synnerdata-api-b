import { db } from "@/db";
import type { BillingProfile } from "@/db/schema";
import { billingProfiles } from "@/db/schema/billing-profiles";
import { faker, generateCnpj, generateMobile } from "@/test/helpers/faker";

export type CreateBillingProfileOptions = {
  organizationId: string;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  pagarmeCustomerId?: string;
};

function generateBillingProfileId(): string {
  return `bp-${crypto.randomUUID()}`;
}

/**
 * Creates a test billing profile.
 *
 * @example
 * // Create a billing profile for an organization
 * const profile = await createTestBillingProfile({
 *   organizationId: org.id,
 * });
 *
 * // Create with custom data
 * const profile = await createTestBillingProfile({
 *   organizationId: org.id,
 *   legalName: "Custom Company",
 *   taxId: "12345678000190",
 * });
 */
export async function createTestBillingProfile(
  options: CreateBillingProfileOptions
): Promise<BillingProfile> {
  const id = generateBillingProfileId();

  const [profile] = await db
    .insert(billingProfiles)
    .values({
      id,
      organizationId: options.organizationId,
      legalName: options.legalName ?? faker.company.name(),
      taxId: options.taxId ?? generateCnpj(),
      email: options.email ?? faker.internet.email(),
      phone: options.phone ?? generateMobile(),
      pagarmeCustomerId: options.pagarmeCustomerId,
    })
    .returning();

  return profile;
}

/**
 * Creates a billing profile with a Pagarme customer ID already set.
 * Useful for testing scenarios where customer already exists.
 */
export function createTestBillingProfileWithCustomer(
  options: Omit<CreateBillingProfileOptions, "pagarmeCustomerId">
): Promise<BillingProfile> {
  return createTestBillingProfile({
    ...options,
    pagarmeCustomerId: `cus_test_${crypto.randomUUID().slice(0, 8)}`,
  });
}
