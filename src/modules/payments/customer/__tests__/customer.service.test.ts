import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { CustomerService } from "@/modules/payments/customer/customer.service";
import { createTestOrganization } from "@/test/helpers/organization";
import { skipIntegration } from "@/test/helpers/skip-integration";

function generateUniqueTaxId(): string {
  const random = Math.floor(Math.random() * 100_000_000)
    .toString()
    .padStart(8, "0");
  return `${random}000190`;
}

describe("CustomerService", () => {
  describe("getCustomerId (no Pagarme API)", () => {
    test("should return null for organization without pagarmeCustomerId", async () => {
      const org = await createTestOrganization();

      const result = await CustomerService.getCustomerId(org.id);

      expect(result).toBeNull();
    });

    test("should return pagarmeCustomerId when it exists", async () => {
      const org = await createTestOrganization({
        pagarmeCustomerId: `cus_test_${crypto.randomUUID().slice(0, 8)}`,
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
    test("should create customer in Pagarme and update profile", async () => {
      const org = await createTestOrganization({
        taxId: generateUniqueTaxId(),
      });

      const result = await CustomerService.create({
        organizationId: org.id,
        name: "Test Company",
        email: "test@example.com",
        document: generateUniqueTaxId(),
        phone: "11999999999",
      });

      expect(result.pagarmeCustomerId).toBeDefined();
      expect(result.pagarmeCustomerId).toStartWith("cus_");

      const [profile] = await db
        .select({
          pagarmeCustomerId: schema.organizationProfiles.pagarmeCustomerId,
        })
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(result.pagarmeCustomerId);
    });

    test("should parse phone with country code correctly", async () => {
      const org = await createTestOrganization({
        taxId: generateUniqueTaxId(),
      });

      const result = await CustomerService.create({
        organizationId: org.id,
        name: "Test Company",
        email: "test@example.com",
        document: generateUniqueTaxId(),
        phone: "+5511999999999",
      });

      expect(result.pagarmeCustomerId).toBeDefined();
      expect(result.pagarmeCustomerId).toStartWith("cus_");
    });

    test("should parse phone without country code correctly", async () => {
      const org = await createTestOrganization({
        taxId: generateUniqueTaxId(),
      });

      const result = await CustomerService.create({
        organizationId: org.id,
        name: "Test Company",
        email: "test@example.com",
        document: generateUniqueTaxId(),
        phone: "11999999999",
      });

      expect(result.pagarmeCustomerId).toBeDefined();
      expect(result.pagarmeCustomerId).toStartWith("cus_");
    });

    test("should strip non-numeric characters from document", async () => {
      const org = await createTestOrganization({
        taxId: generateUniqueTaxId(),
      });

      const taxId = generateUniqueTaxId();
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
      test("should throw CustomerNotFoundError for non-existent organization", async () => {
        const { CustomerNotFoundError } = await import("../../errors");

        await expect(
          CustomerService.getOrCreateForCheckout("non-existent-org")
        ).rejects.toBeInstanceOf(CustomerNotFoundError);
      });

      test("should return existing pagarmeCustomerId if already set", async () => {
        const existingCustomerId = `cus_existing_${crypto.randomUUID().slice(0, 8)}`;
        const org = await createTestOrganization({
          pagarmeCustomerId: existingCustomerId,
          taxId: generateUniqueTaxId(),
        });

        const result = await CustomerService.getOrCreateForCheckout(org.id);

        expect(result.pagarmeCustomerId).toBe(existingCustomerId);
      });

      test("should create new customer when pagarmeCustomerId is null", async () => {
        const org = await createTestOrganization({
          taxId: generateUniqueTaxId(),
          phone: "11999999999",
        });

        const result = await CustomerService.getOrCreateForCheckout(org.id);

        expect(result.pagarmeCustomerId).toBeDefined();
        expect(result.pagarmeCustomerId).toStartWith("cus_");

        const [profile] = await db
          .select({
            pagarmeCustomerId: schema.organizationProfiles.pagarmeCustomerId,
          })
          .from(schema.organizationProfiles)
          .where(eq(schema.organizationProfiles.organizationId, org.id))
          .limit(1);

        expect(profile.pagarmeCustomerId).toBe(result.pagarmeCustomerId);
      });

      test("should use billingData to override profile data", async () => {
        const org = await createTestOrganization({
          taxId: generateUniqueTaxId(),
          phone: "11999999999",
        });

        const newTaxId = generateUniqueTaxId();
        const result = await CustomerService.getOrCreateForCheckout(org.id, {
          document: newTaxId,
          phone: "21888888888",
          billingEmail: "billing@example.com",
        });

        expect(result.pagarmeCustomerId).toBeDefined();
        expect(result.pagarmeCustomerId).toStartWith("cus_");

        const [profile] = await db
          .select()
          .from(schema.organizationProfiles)
          .where(eq(schema.organizationProfiles.organizationId, org.id))
          .limit(1);

        expect(profile.taxId).toBe(newTaxId);
        expect(profile.phone).toBe("21888888888");
        expect(profile.email).toBe("billing@example.com");
      });

      test("should update profile with billingData even when customer exists", async () => {
        const existingCustomerId = `cus_update_${crypto.randomUUID().slice(0, 8)}`;
        const originalTaxId = generateUniqueTaxId();
        const newTaxId = generateUniqueTaxId();

        const org = await createTestOrganization({
          pagarmeCustomerId: existingCustomerId,
          taxId: originalTaxId,
        });

        const result = await CustomerService.getOrCreateForCheckout(org.id, {
          document: newTaxId,
        });

        expect(result.pagarmeCustomerId).toBe(existingCustomerId);

        const [profile] = await db
          .select({ taxId: schema.organizationProfiles.taxId })
          .from(schema.organizationProfiles)
          .where(eq(schema.organizationProfiles.organizationId, org.id))
          .limit(1);

        expect(profile.taxId).toBe(newTaxId);
      });
    }
  );
});
