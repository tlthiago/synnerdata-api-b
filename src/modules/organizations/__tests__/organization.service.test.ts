import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  ProfileAlreadyExistsError,
  ProfileNotFoundError,
} from "@/modules/organizations/profile/errors";
import { OrganizationService } from "@/modules/organizations/profile/organization.service";
import { createTestOrganization } from "@/test/helpers/organization";

function generateUniqueTaxId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 14);
}

async function createOrganizationWithoutProfile(): Promise<{
  id: string;
  name: string;
  slug: string;
}> {
  const testId = crypto.randomUUID();
  const organizationId = `test-org-${testId}`;
  const name = `Test Org ${testId.slice(0, 8)}`;
  const slug = `test-org-${testId.slice(0, 8)}`;

  await db.insert(schema.organizations).values({
    id: organizationId,
    name,
    slug,
    createdAt: new Date(),
  });

  return { id: organizationId, name, slug };
}

describe("OrganizationService", () => {
  describe("getProfile", () => {
    test("should return profile when it exists", async () => {
      const uniqueTaxId = generateUniqueTaxId();
      const org = await createTestOrganization({
        tradeName: "Test Company",
        taxId: uniqueTaxId,
        phone: "11999999999",
      });

      const profile = await OrganizationService.getProfile(org.id);

      expect(profile).not.toBeNull();
      expect(profile?.organizationId).toBe(org.id);
      expect(profile?.tradeName).toBe("Test Company");
      expect(profile?.taxId).toBe(uniqueTaxId);
    });

    test("should return null when profile does not exist", async () => {
      const org = await createOrganizationWithoutProfile();

      const profile = await OrganizationService.getProfile(org.id);

      expect(profile).toBeNull();
    });

    test("should return null for non-existent organization", async () => {
      const profile = await OrganizationService.getProfile("non-existent-org");

      expect(profile).toBeNull();
    });
  });

  describe("getProfileOrThrow", () => {
    test("should return profile when it exists", async () => {
      const org = await createTestOrganization();

      const profile = await OrganizationService.getProfileOrThrow(org.id);

      expect(profile.organizationId).toBe(org.id);
    });

    test("should throw ProfileNotFoundError when profile does not exist", async () => {
      const org = await createOrganizationWithoutProfile();

      await expect(
        OrganizationService.getProfileOrThrow(org.id)
      ).rejects.toBeInstanceOf(ProfileNotFoundError);
    });
  });

  describe("getOrganization", () => {
    test("should return organization data when it exists", async () => {
      const org = await createTestOrganization({ name: "My Company" });

      const orgData = await OrganizationService.getOrganization(org.id);

      expect(orgData).not.toBeNull();
      expect(orgData?.id).toBe(org.id);
      expect(orgData?.name).toBe("My Company");
    });

    test("should return null for non-existent organization", async () => {
      const orgData =
        await OrganizationService.getOrganization("non-existent-org");

      expect(orgData).toBeNull();
    });
  });

  describe("hasProfile", () => {
    test("should return true when profile exists", async () => {
      const org = await createTestOrganization();

      const result = await OrganizationService.hasProfile(org.id);

      expect(result).toBe(true);
    });

    test("should return false when profile does not exist", async () => {
      const org = await createOrganizationWithoutProfile();

      const result = await OrganizationService.hasProfile(org.id);

      expect(result).toBe(false);
    });
  });

  describe("createProfile", () => {
    test("should create profile with provided data", async () => {
      const org = await createOrganizationWithoutProfile();
      const uniqueTaxId = generateUniqueTaxId();

      await OrganizationService.createProfile(org.id, {
        tradeName: "New Company",
        taxId: uniqueTaxId,
        phone: "21888888888",
        email: "billing@newcompany.com",
      });

      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(profile).toBeDefined();
      expect(profile.tradeName).toBe("New Company");
      expect(profile.taxId).toBe(uniqueTaxId);
      expect(profile.phone).toBe("21888888888");
      expect(profile.email).toBe("billing@newcompany.com");
    });

    test("should use tradeName as legalName when legalName is not provided", async () => {
      const org = await createOrganizationWithoutProfile();
      const uniqueTaxId = generateUniqueTaxId();

      await OrganizationService.createProfile(org.id, {
        tradeName: "Trade Name Only",
        taxId: uniqueTaxId,
        phone: "11999999999",
      });

      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.legalName).toBe("Trade Name Only");
    });

    test("should throw ProfileAlreadyExistsError when profile already exists", async () => {
      const org = await createTestOrganization();

      await expect(
        OrganizationService.createProfile(org.id, {
          tradeName: "Duplicate Profile",
          taxId: generateUniqueTaxId(),
          phone: "11999999999",
        })
      ).rejects.toBeInstanceOf(ProfileAlreadyExistsError);
    });
  });

  describe("checkBillingRequirements", () => {
    test("should return complete=true when profile has all required fields", async () => {
      const org = await createTestOrganization({
        taxId: generateUniqueTaxId(),
        phone: "11999999999",
      });

      const result = await OrganizationService.checkBillingRequirements(org.id);

      expect(result.complete).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    test("should return complete=false with profile in missingFields when profile does not exist", async () => {
      const org = await createOrganizationWithoutProfile();

      const result = await OrganizationService.checkBillingRequirements(org.id);

      expect(result.complete).toBe(false);
      expect(result.missingFields).toContain("profile");
    });

    test("should return complete=false for non-existent organization", async () => {
      const result =
        await OrganizationService.checkBillingRequirements("non-existent-org");

      expect(result.complete).toBe(false);
      expect(result.missingFields).toContain("profile");
    });
  });

  describe("createMinimalProfile", () => {
    test("should create profile with tradeName only", async () => {
      const org = await createOrganizationWithoutProfile();

      await OrganizationService.createMinimalProfile(org.id, org.name);

      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(profile).toBeDefined();
      expect(profile.id).toStartWith("profile-");
      expect(profile.tradeName).toBe(org.name);
      expect(profile.legalName).toBeNull();
      expect(profile.taxId).toBeNull();
      expect(profile.phone).toBeNull();
      expect(profile.mobile).toBeNull();
      expect(profile.email).toBeNull();
    });

    test("should be idempotent — return silently if profile already exists", async () => {
      const org = await createTestOrganization({ tradeName: "Original Name" });

      await OrganizationService.createMinimalProfile(org.id, "New Name");

      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.tradeName).toBe("Original Name");
    });
  });

  describe("enrichProfile", () => {
    test("should fill null fields with provided data", async () => {
      const org = await createOrganizationWithoutProfile();
      await OrganizationService.createMinimalProfile(org.id, org.name);

      await OrganizationService.enrichProfile(org.id, {
        legalName: "Enriched Legal Name",
        taxId: generateUniqueTaxId(),
        email: "enriched@example.com",
        phone: "11888888888",
        street: "Rua Teste",
        number: "123",
        city: "São Paulo",
        state: "SP",
        zipCode: "01001000",
      });

      const profile = await OrganizationService.getProfile(org.id);

      expect(profile?.legalName).toBe("Enriched Legal Name");
      expect(profile?.email).toBe("enriched@example.com");
      expect(profile?.phone).toBe("11888888888");
      expect(profile?.mobile).toBe("11888888888");
      expect(profile?.street).toBe("Rua Teste");
      expect(profile?.number).toBe("123");
      expect(profile?.city).toBe("São Paulo");
      expect(profile?.state).toBe("SP");
      expect(profile?.zipCode).toBe("01001000");
    });

    test("should not overwrite fields that already have values", async () => {
      const existingTaxId = generateUniqueTaxId();
      const org = await createTestOrganization({
        tradeName: "Existing Company",
        legalName: "Existing Legal",
        taxId: existingTaxId,
        phone: "11999999999",
        email: "existing@example.com",
      });

      await OrganizationService.enrichProfile(org.id, {
        legalName: "Should Not Overwrite",
        taxId: "99999999999999",
        email: "should-not@example.com",
        phone: "21888888888",
        street: "New Street",
      });

      const profile = await OrganizationService.getProfile(org.id);

      expect(profile?.legalName).toBe("Existing Legal");
      expect(profile?.taxId).toBe(existingTaxId);
      expect(profile?.email).toBe("existing@example.com");
      expect(profile?.phone).toBe("11999999999");
      expect(profile?.street).toBe("New Street");
    });

    test("should do nothing if profile does not exist", async () => {
      await OrganizationService.enrichProfile("non-existent-org-id", {
        legalName: "Test",
      });

      // Should not throw
    });

    test("should do nothing if all fields already have values", async () => {
      const org = await createTestOrganization({
        tradeName: "Full Company",
        legalName: "Full Legal",
        taxId: generateUniqueTaxId(),
        phone: "11999999999",
        email: "full@example.com",
      });

      await OrganizationService.enrichProfile(org.id, {
        legalName: "New Legal",
        email: "new@example.com",
      });

      const profile = await OrganizationService.getProfile(org.id);

      expect(profile?.legalName).toBe("Full Legal");
      expect(profile?.email).toBe("full@example.com");
    });
  });

  describe("setCustomerId", () => {
    test("should update pagarmeCustomerId for existing profile", async () => {
      const org = await createTestOrganization();
      const customerId = `cus_test_${crypto.randomUUID().slice(0, 8)}`;

      await OrganizationService.setCustomerId(org.id, customerId);

      const [profile] = await db
        .select({
          pagarmeCustomerId: schema.organizationProfiles.pagarmeCustomerId,
        })
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(customerId);
    });
  });
});
