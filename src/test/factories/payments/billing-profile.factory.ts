import { db } from "@/db";
import type { BillingProfile } from "@/db/schema";
import { billingProfiles } from "@/db/schema/billing-profiles";
import { getOrCreateSystemTestUser } from "@/test/helpers/system-user";
import { faker, generateCnpj, generateMobile } from "@/test/support/faker";

type CreateBillingProfileOptions = {
  organizationId: string;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  pagarmeCustomerId?: string;
  creatorUserId?: string;
};

function generateBillingProfileId(): string {
  return `bp-${crypto.randomUUID()}`;
}

/**
 * Factory for creating test billing profiles.
 *
 * Follows Elysia's recommended pattern of abstract class with static methods.
 *
 * @example
 * // Create a billing profile for an organization
 * const profile = await BillingProfileFactory.create({
 *   organizationId: org.id,
 * });
 *
 * // Create with Pagarme customer already set
 * const profile = await BillingProfileFactory.createWithCustomer({
 *   organizationId: org.id,
 * });
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern for test utilities
export abstract class BillingProfileFactory {
  /**
   * Creates a test billing profile.
   */
  static async create(
    options: CreateBillingProfileOptions
  ): Promise<BillingProfile> {
    const id = generateBillingProfileId();
    const creatorUserId =
      options.creatorUserId ?? (await getOrCreateSystemTestUser());

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
        createdBy: creatorUserId,
        updatedBy: creatorUserId,
      })
      .returning();

    return profile;
  }

  /**
   * Creates a billing profile with a Pagarme customer ID already set.
   * Useful for testing scenarios where customer already exists.
   */
  static createWithCustomer(
    options: Omit<CreateBillingProfileOptions, "pagarmeCustomerId">
  ): Promise<BillingProfile> {
    return BillingProfileFactory.create({
      ...options,
      pagarmeCustomerId: `cus_test_${crypto.randomUUID().slice(0, 8)}`,
    });
  }
}
