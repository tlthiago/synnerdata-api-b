import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingProfiles } from "@/db/schema/billing-profiles";
import {
  BillingProfileAlreadyExistsError,
  BillingProfileNotFoundError,
} from "@/modules/payments/errors";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import { faker, generateCnpj, generateMobile } from "@/test/support/faker";
import { BillingService } from "../billing.service";

describe("BillingService - Profile Methods", () => {
  describe("getProfile", () => {
    test("should return null for non-existent organization", async () => {
      const result = await BillingService.getProfile("non-existent-org-id");

      expect(result).toBeNull();
    });

    test("should return null for organization without billing profile", async () => {
      const org = await OrganizationFactory.create();

      const result = await BillingService.getProfile(org.id);

      expect(result).toBeNull();
    });

    test("should return profile when it exists", async () => {
      const org = await OrganizationFactory.create();
      const createdProfile = await BillingProfileFactory.create({
        organizationId: org.id,
      });

      const result = await BillingService.getProfile(org.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(createdProfile.id);
      expect(result?.organizationId).toBe(org.id);
      expect(result?.legalName).toBe(createdProfile.legalName);
      expect(result?.taxId).toBe(createdProfile.taxId);
      expect(result?.email).toBe(createdProfile.email);
      expect(result?.phone).toBe(createdProfile.phone);
    });
  });

  describe("getProfileOrThrow", () => {
    test("should throw BillingProfileNotFoundError for non-existent organization", async () => {
      await expect(
        BillingService.getProfileOrThrow("non-existent-org-id")
      ).rejects.toBeInstanceOf(BillingProfileNotFoundError);
    });

    test("should throw BillingProfileNotFoundError for organization without profile", async () => {
      const org = await OrganizationFactory.create();

      await expect(
        BillingService.getProfileOrThrow(org.id)
      ).rejects.toBeInstanceOf(BillingProfileNotFoundError);
    });

    test("should return profile when it exists", async () => {
      const org = await OrganizationFactory.create();
      const createdProfile = await BillingProfileFactory.create({
        organizationId: org.id,
      });

      const result = await BillingService.getProfileOrThrow(org.id);

      expect(result.id).toBe(createdProfile.id);
      expect(result.organizationId).toBe(org.id);
    });
  });

  describe("createProfile", () => {
    test("should create profile with valid data", async () => {
      const org = await OrganizationFactory.create();
      const input = {
        legalName: faker.company.name(),
        taxId: generateCnpj(),
        email: faker.internet.email(),
        phone: generateMobile(),
      };

      const result = await BillingService.createProfile(org.id, input);

      expect(result.id).toStartWith("bp-");
      expect(result.organizationId).toBe(org.id);
      expect(result.legalName).toBe(input.legalName);
      expect(result.taxId).toBe(input.taxId);
      expect(result.email).toBe(input.email);
      expect(result.phone).toBe(input.phone);
      expect(result.pagarmeCustomerId).toBeNull();
    });

    test("should throw BillingProfileAlreadyExistsError when profile exists", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const input = {
        legalName: faker.company.name(),
        taxId: generateCnpj(),
        email: faker.internet.email(),
        phone: generateMobile(),
      };

      await expect(
        BillingService.createProfile(org.id, input)
      ).rejects.toBeInstanceOf(BillingProfileAlreadyExistsError);
    });
  });

  describe("updateProfile", () => {
    test("should update single field", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const newLegalName = faker.company.name();

      const result = await BillingService.updateProfile(org.id, {
        legalName: newLegalName,
      });

      expect(result.legalName).toBe(newLegalName);
    });

    test("should update multiple fields", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const updates = {
        legalName: faker.company.name(),
        taxId: generateCnpj(),
        email: faker.internet.email(),
        phone: generateMobile(),
      };

      const result = await BillingService.updateProfile(org.id, updates);

      expect(result.legalName).toBe(updates.legalName);
      expect(result.taxId).toBe(updates.taxId);
      expect(result.email).toBe(updates.email);
      expect(result.phone).toBe(updates.phone);
    });

    test("should throw BillingProfileNotFoundError for non-existent profile", async () => {
      const org = await OrganizationFactory.create();

      await expect(
        BillingService.updateProfile(org.id, { legalName: "New Name" })
      ).rejects.toBeInstanceOf(BillingProfileNotFoundError);
    });
  });

  describe("setCustomerIdIfNull", () => {
    test("should set pagarmeCustomerId when null and return true", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const customerId = `cus_${crypto.randomUUID().slice(0, 8)}`;

      const result = await BillingService.setCustomerIdIfNull(
        org.id,
        customerId
      );

      expect(result).toBe(true);

      const [profile] = await db
        .select({ pagarmeCustomerId: billingProfiles.pagarmeCustomerId })
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(customerId);
    });

    test("should NOT overwrite existing pagarmeCustomerId and return false", async () => {
      const org = await OrganizationFactory.create();
      const existingCustomerId = `cus_existing_${crypto.randomUUID().slice(0, 8)}`;
      await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: existingCustomerId,
      });

      const newCustomerId = `cus_new_${crypto.randomUUID().slice(0, 8)}`;

      const result = await BillingService.setCustomerIdIfNull(
        org.id,
        newCustomerId
      );

      expect(result).toBe(false);

      // Verify original customer ID is preserved
      const [profile] = await db
        .select({ pagarmeCustomerId: billingProfiles.pagarmeCustomerId })
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(existingCustomerId);
    });

    test("should return false for non-existent profile", async () => {
      const org = await OrganizationFactory.create();

      const result = await BillingService.setCustomerIdIfNull(
        org.id,
        "cus_test"
      );

      expect(result).toBe(false);
    });
  });

  describe("getCustomerId", () => {
    test("should return null for non-existent organization", async () => {
      const result = await BillingService.getCustomerId("non-existent-org-id");

      expect(result).toBeNull();
    });

    test("should return null for organization without billing profile", async () => {
      const org = await OrganizationFactory.create();

      const result = await BillingService.getCustomerId(org.id);

      expect(result).toBeNull();
    });

    test("should return null for profile without pagarmeCustomerId", async () => {
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      const result = await BillingService.getCustomerId(org.id);

      expect(result).toBeNull();
    });

    test("should return pagarmeCustomerId when it exists", async () => {
      const org = await OrganizationFactory.create();
      const customerId = `cus_${crypto.randomUUID().slice(0, 8)}`;
      await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: customerId,
      });

      const result = await BillingService.getCustomerId(org.id);

      expect(result).toBe(customerId);
    });
  });

  describe("createProfile — org profile propagation", () => {
    test("should propagate billing data to null org profile fields", async () => {
      const { schema } = await import("@/db/schema");
      const org = await OrganizationFactory.create();

      // Reset org profile fields to null (simulating minimal profile)
      await db
        .update(schema.organizationProfiles)
        .set({
          legalName: null,
          taxId: null,
          email: null,
          phone: null,
          mobile: null,
          street: null,
        })
        .where(eq(schema.organizationProfiles.organizationId, org.id));

      const input = {
        legalName: faker.company.name(),
        taxId: generateCnpj(),
        email: faker.internet.email(),
        phone: generateMobile(),
      };

      await BillingService.createProfile(org.id, input);

      // Wait for fire-and-forget propagation
      await new Promise((resolve) => setTimeout(resolve, 200));

      const [orgProfile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(orgProfile.legalName).toBe(input.legalName);
      expect(orgProfile.taxId).toBe(input.taxId);
      expect(orgProfile.email).toBe(input.email);
      expect(orgProfile.phone).toBe(input.phone);
      expect(orgProfile.mobile).toBe(input.phone);
    });

    test("should not overwrite existing org profile fields", async () => {
      const existingTaxId = `${Date.now()}`.slice(0, 14);
      const org = await OrganizationFactory.create({
        legalName: "Existing Legal Name",
        taxId: existingTaxId,
      });

      const input = {
        legalName: "New Billing Legal Name",
        taxId: generateCnpj(),
        email: faker.internet.email(),
        phone: generateMobile(),
      };

      await BillingService.createProfile(org.id, input);

      // Wait for fire-and-forget propagation
      await new Promise((resolve) => setTimeout(resolve, 200));

      const { schema } = await import("@/db/schema");
      const [orgProfile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      // Existing values should be preserved
      expect(orgProfile.legalName).toBe("Existing Legal Name");
      expect(orgProfile.taxId).toBe(existingTaxId);
    });
  });

  describe("updateProfile — org profile propagation", () => {
    test("should propagate updated billing data to null org profile fields", async () => {
      const { schema } = await import("@/db/schema");
      const org = await OrganizationFactory.create();
      await BillingProfileFactory.create({ organizationId: org.id });

      // Reset org profile fields to null
      await db
        .update(schema.organizationProfiles)
        .set({
          legalName: null,
          taxId: null,
          email: null,
          phone: null,
          mobile: null,
        })
        .where(eq(schema.organizationProfiles.organizationId, org.id));

      const newLegalName = faker.company.name();
      await BillingService.updateProfile(org.id, { legalName: newLegalName });

      // Wait for fire-and-forget propagation
      await new Promise((resolve) => setTimeout(resolve, 200));

      const [orgProfile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(orgProfile.legalName).toBe(newLegalName);
    });
  });
});
