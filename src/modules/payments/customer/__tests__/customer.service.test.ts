import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingProfiles } from "@/db/schema/billing-profiles";
import { CustomerService } from "@/modules/payments/customer/customer.service";
import { BillingProfileNotFoundError } from "@/modules/payments/errors";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import { generateCnpj } from "@/test/support/faker";
import { skipIntegration } from "@/test/support/skip-integration";

describe("CustomerService", () => {
  describe("getCustomerId (no Pagarme API)", () => {
    test("should return null for organization without billing profile", async () => {
      const org = await OrganizationFactory.create();

      const result = await CustomerService.getCustomerId(org.id);

      expect(result).toBeNull();
    });

    test("should return null for billing profile without pagarmeCustomerId", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const result = await CustomerService.getCustomerId(org.id);

      expect(result).toBeNull();
    });

    test("should return pagarmeCustomerId when it exists", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.createWithCustomer({
        organizationId: org.id,
      });

      const result = await CustomerService.getCustomerId(org.id);

      expect(result).toBeDefined();
      expect(result).toStartWith("cus_test_");
    });

    test("should return null for non-existent organization", async () => {
      const result = await CustomerService.getCustomerId("non-existent-org");

      expect(result).toBeNull();
    });
  });

  describe.skipIf(skipIntegration)("create (Pagarme API)", () => {
    test("should create customer in Pagarme without persisting customerId", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const result = await CustomerService.create({
        organizationId: org.id,
        name: "Test Company",
        email: "test@example.com",
        document: generateCnpj(),
        phone: "11999999999",
      });

      expect(result.pagarmeCustomerId).toBeDefined();
      expect(result.pagarmeCustomerId).toStartWith("cus_");

      // Verify that create() does NOT persist the customerId
      // (this is now the responsibility of getOrCreateForCheckout)
      const [profile] = await db
        .select({ pagarmeCustomerId: billingProfiles.pagarmeCustomerId })
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBeNull();
    });

    test("should parse phone with country code correctly", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const result = await CustomerService.create({
        organizationId: org.id,
        name: "Test Company",
        email: "test@example.com",
        document: generateCnpj(),
        phone: "+5511999999999",
      });

      expect(result.pagarmeCustomerId).toBeDefined();
      expect(result.pagarmeCustomerId).toStartWith("cus_");
    });

    test("should parse phone without country code correctly", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const result = await CustomerService.create({
        organizationId: org.id,
        name: "Test Company",
        email: "test@example.com",
        document: generateCnpj(),
        phone: "11999999999",
      });

      expect(result.pagarmeCustomerId).toBeDefined();
      expect(result.pagarmeCustomerId).toStartWith("cus_");
    });

    test("should strip non-numeric characters from document", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const taxId = generateCnpj();
      const formattedTaxId = `${taxId.slice(0, 2)}.${taxId.slice(2, 5)}.${taxId.slice(5, 8)}/${taxId.slice(8, 12)}-${taxId.slice(12)}`;

      const result = await CustomerService.create({
        organizationId: org.id,
        name: "Test Company",
        email: "test@example.com",
        document: formattedTaxId,
        phone: "11999999999",
      });

      expect(result.pagarmeCustomerId).toBeDefined();
      expect(result.pagarmeCustomerId).toStartWith("cus_");
    });
  });

  describe.skipIf(skipIntegration)(
    "getOrCreateForCheckout (Pagarme API)",
    () => {
      test("should throw BillingProfileNotFoundError for non-existent profile", async () => {
        await expect(
          CustomerService.getOrCreateForCheckout("non-existent-org")
        ).rejects.toBeInstanceOf(BillingProfileNotFoundError);
      });

      test("should return existing pagarmeCustomerId if already set", async () => {
        const existingCustomerId = `cus_existing_${crypto.randomUUID().slice(0, 8)}`;
        const org = await OrganizationFactory.create();
        await BillingProfileFactory.create({
          organizationId: org.id,
          pagarmeCustomerId: existingCustomerId,
        });

        const result = await CustomerService.getOrCreateForCheckout(org.id);

        expect(result.pagarmeCustomerId).toBe(existingCustomerId);
      });

      test("should create new customer when pagarmeCustomerId is null", async () => {
        const org = await OrganizationFactory.create();
        await BillingProfileFactory.create({
          organizationId: org.id,
          phone: "11999999999",
        });

        const result = await CustomerService.getOrCreateForCheckout(org.id);

        expect(result.pagarmeCustomerId).toBeDefined();
        expect(result.pagarmeCustomerId).toStartWith("cus_");

        const [profile] = await db
          .select({ pagarmeCustomerId: billingProfiles.pagarmeCustomerId })
          .from(billingProfiles)
          .where(eq(billingProfiles.organizationId, org.id))
          .limit(1);

        expect(profile.pagarmeCustomerId).toBe(result.pagarmeCustomerId);
      });
    }
  );
});
