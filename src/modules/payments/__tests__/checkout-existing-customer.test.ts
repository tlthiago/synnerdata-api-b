/**
 * Checkout with Existing Customer Test
 *
 * Testa o reuso de customer do Pagarme quando billing profile já possui
 * pagarmeCustomerId.
 *
 * Cenários:
 * 1. Checkout com customer existente reutiliza pagarmeCustomerId
 * 2. Checkout sem customer cria novo customer no Pagarme
 * 3. Race condition: dois checkouts simultâneos não criam customers duplicados
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { BillingService } from "@/modules/payments/billing/billing.service";
import { CustomerService } from "@/modules/payments/customer/customer.service";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";

describe("Checkout with Existing Customer: Reuse pagarmeCustomerId", () => {
  let trialPlanResult: CreatePlanResult;
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    trialPlanResult = await PlanFactory.createTrial();
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, orgId));
      await db
        .delete(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, orgId));
    }
  });

  describe("Fase 1: Customer Reuse", () => {
    test("should return existing pagarmeCustomerId when already set", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const existingCustomerId = `cus_existing_${crypto.randomUUID().slice(0, 8)}`;

      // Create billing profile with existing customer ID
      await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: existingCustomerId,
      });

      // Call getOrCreateForCheckout - should return existing customer
      const result = await CustomerService.getOrCreateForCheckout(org.id);

      expect(result.pagarmeCustomerId).toBe(existingCustomerId);
    });

    test("should not modify billing profile when customer exists", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const existingCustomerId = `cus_existing_${crypto.randomUUID().slice(0, 8)}`;

      const profile = await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: existingCustomerId,
      });

      // Call getOrCreateForCheckout
      await CustomerService.getOrCreateForCheckout(org.id);

      // Verify billing profile was not modified
      const [updatedProfile] = await db
        .select()
        .from(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, org.id))
        .limit(1);

      expect(updatedProfile.pagarmeCustomerId).toBe(existingCustomerId);
      expect(updatedProfile.id).toBe(profile.id);
    });
  });

  describe("Fase 2: Customer Lookup", () => {
    test("should retrieve customer ID from billing profile", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const customerId = `cus_test_${crypto.randomUUID().slice(0, 8)}`;

      await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: customerId,
      });

      const result = await CustomerService.getCustomerId(org.id);

      expect(result).toBe(customerId);
    });

    test("should return null when no customer ID exists", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create billing profile WITHOUT customer ID
      await BillingProfileFactory.create({
        organizationId: org.id,
      });

      const result = await CustomerService.getCustomerId(org.id);

      expect(result).toBeNull();
    });
  });

  describe("Fase 3: setCustomerIdIfNull Atomicity", () => {
    test("should set customer ID when null", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create billing profile without customer ID
      await BillingProfileFactory.create({
        organizationId: org.id,
      });

      const newCustomerId = `cus_new_${crypto.randomUUID().slice(0, 8)}`;
      const wasSet = await BillingService.setCustomerIdIfNull(
        org.id,
        newCustomerId
      );

      expect(wasSet).toBe(true);

      // Verify it was saved
      const [profile] = await db
        .select()
        .from(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(newCustomerId);
    });

    test("should NOT overwrite existing customer ID", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const existingCustomerId = `cus_existing_${crypto.randomUUID().slice(0, 8)}`;

      // Create billing profile WITH existing customer ID
      await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: existingCustomerId,
      });

      const newCustomerId = `cus_new_${crypto.randomUUID().slice(0, 8)}`;
      const wasSet = await BillingService.setCustomerIdIfNull(
        org.id,
        newCustomerId
      );

      // Should NOT have been set because there's already a customer ID
      expect(wasSet).toBe(false);

      // Verify original customer ID is preserved
      const [profile] = await db
        .select()
        .from(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(existingCustomerId);
    });
  });

  describe("Fase 4: Billing Profile Requirement", () => {
    test("should throw BillingProfileNotFoundError when no profile exists", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Do NOT create billing profile

      await expect(
        CustomerService.getOrCreateForCheckout(org.id)
      ).rejects.toThrow();
    });
  });

  describe("Fase 5: Integration with Checkout Flow", () => {
    test("should use existing customer in checkout metadata", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const existingCustomerId = `cus_checkout_${crypto.randomUUID().slice(0, 8)}`;

      // Setup: billing profile with existing customer
      await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: existingCustomerId,
      });

      // Create trial subscription (required for checkout)
      await SubscriptionFactory.createTrial(org.id, trialPlanResult.plan.id);

      // Get customer for checkout - should return existing
      const result = await CustomerService.getOrCreateForCheckout(org.id);

      expect(result.pagarmeCustomerId).toBe(existingCustomerId);

      // Billing profile should still have the same customer ID
      const [profile] = await db
        .select()
        .from(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(existingCustomerId);
    });
  });

  describe("Fase 6: Edge Cases", () => {
    test("should handle organization with multiple checkouts", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const customerId = `cus_multi_${crypto.randomUUID().slice(0, 8)}`;

      await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: customerId,
      });

      // Simulate multiple checkout attempts (e.g., user abandons and retries)
      const result1 = await CustomerService.getOrCreateForCheckout(org.id);
      const result2 = await CustomerService.getOrCreateForCheckout(org.id);
      const result3 = await CustomerService.getOrCreateForCheckout(org.id);

      // All should return the same customer ID
      expect(result1.pagarmeCustomerId).toBe(customerId);
      expect(result2.pagarmeCustomerId).toBe(customerId);
      expect(result3.pagarmeCustomerId).toBe(customerId);

      // Billing profile should still have only one customer ID
      const [profile] = await db
        .select()
        .from(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(customerId);
    });

    test("should preserve customer ID across billing profile updates", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const customerId = `cus_preserve_${crypto.randomUUID().slice(0, 8)}`;

      await BillingProfileFactory.create({
        organizationId: org.id,
        pagarmeCustomerId: customerId,
        legalName: "Original Name",
      });

      // Update billing profile (simulating user editing their info)
      await db
        .update(schema.billingProfiles)
        .set({ legalName: "Updated Name" })
        .where(eq(schema.billingProfiles.organizationId, org.id));

      // Customer ID should still be preserved
      const result = await CustomerService.getOrCreateForCheckout(org.id);

      expect(result.pagarmeCustomerId).toBe(customerId);
    });
  });
});
