import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import {
  ProfileAlreadyExistsError,
  ProfileNotFoundError,
  TaxIdAlreadyExistsError,
} from "./errors";
import type {
  BillingStatusData,
  CreateProfileData,
  OrganizationData,
  OrganizationProfileData,
  UpdateProfileInput,
} from "./organization.model";

export abstract class OrganizationService {
  private static async findByOrganizationId(
    organizationId: string
  ): Promise<OrganizationProfileData | null> {
    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    return (profile as OrganizationProfileData) ?? null;
  }

  static async getOrganization(
    organizationId: string
  ): Promise<OrganizationData | null> {
    const [org] = await db
      .select({ id: schema.organizations.id, name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    return org ?? null;
  }

  static async getProfile(
    organizationId: string
  ): Promise<OrganizationProfileData | null> {
    return await OrganizationService.findByOrganizationId(organizationId);
  }

  static async getProfileOrThrow(
    organizationId: string
  ): Promise<OrganizationProfileData> {
    const profile =
      await OrganizationService.findByOrganizationId(organizationId);
    if (!profile) {
      throw new ProfileNotFoundError(organizationId);
    }
    return profile;
  }

  static async hasProfile(organizationId: string): Promise<boolean> {
    const profile =
      await OrganizationService.findByOrganizationId(organizationId);
    return profile !== null;
  }

  static async createProfile(
    organizationId: string,
    data: CreateProfileData
  ): Promise<void> {
    const existingProfile =
      await OrganizationService.findByOrganizationId(organizationId);
    if (existingProfile) {
      throw new ProfileAlreadyExistsError(organizationId);
    }

    const profileId = `profile-${crypto.randomUUID()}`;

    await db.insert(schema.organizationProfiles).values({
      id: profileId,
      organizationId,
      tradeName: data.tradeName,
      legalName: data.legalName ?? data.tradeName,
      taxId: data.taxId,
      phone: data.phone,
      mobile: data.phone,
      email: data.email,
    });
  }

  static async updateProfile(
    organizationId: string,
    data: UpdateProfileInput,
    userId?: string
  ): Promise<OrganizationProfileData> {
    const existing =
      await OrganizationService.findByOrganizationId(organizationId);
    if (!existing) {
      throw new ProfileNotFoundError(organizationId);
    }

    if (data.taxId && data.taxId !== existing.taxId) {
      const [conflict] = await db
        .select({ id: schema.organizationProfiles.id })
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.taxId, data.taxId))
        .limit(1);

      if (conflict) {
        throw new TaxIdAlreadyExistsError(data.taxId);
      }
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.phone) {
      updateData.mobile = data.phone;
    }

    const [updated] = await db.transaction(async (tx) => {
      const result = await tx
        .update(schema.organizationProfiles)
        .set(updateData)
        .where(eq(schema.organizationProfiles.organizationId, organizationId))
        .returning();

      if (data.tradeName) {
        await tx
          .update(schema.organizations)
          .set({ name: data.tradeName })
          .where(eq(schema.organizations.id, organizationId));
      }

      return result;
    });

    if (userId && (data.taxId || data.email)) {
      await AuditService.log({
        organizationId,
        userId,
        action: "update",
        resource: "organization",
        resourceId: existing.id,
        changes: {
          before: { taxId: existing.taxId, email: existing.email },
          after: {
            taxId: data.taxId ?? existing.taxId,
            email: data.email ?? existing.email,
          },
        },
      });
    }

    return updated as OrganizationProfileData;
  }

  static async checkBillingRequirements(
    organizationId: string
  ): Promise<BillingStatusData> {
    const profile =
      await OrganizationService.findByOrganizationId(organizationId);

    const missingFields: string[] = [];

    if (!profile) {
      missingFields.push("profile");
      return { complete: false, missingFields };
    }

    if (!profile.taxId) {
      missingFields.push("taxId");
    }

    const hasPhone = profile.phone || profile.mobile;
    if (!hasPhone) {
      missingFields.push("phone");
    }

    return {
      complete: missingFields.length === 0,
      missingFields,
    };
  }

  static async getPowerBiUrl(
    organizationId: string
  ): Promise<{ url: string | null }> {
    const [profile] = await db
      .select({ pbUrl: schema.organizationProfiles.pbUrl })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    return { url: profile?.pbUrl ?? null };
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

  /**
   * Creates a minimal profile (tradeName = org.name, other fields null).
   * Idempotent: returns silently if profile already exists.
   */
  static async createMinimalProfile(
    organizationId: string,
    orgName: string
  ): Promise<void> {
    const existing =
      await OrganizationService.findByOrganizationId(organizationId);
    if (existing) {
      return;
    }

    const profileId = `profile-${crypto.randomUUID()}`;

    await db.insert(schema.organizationProfiles).values({
      id: profileId,
      organizationId,
      tradeName: orgName,
    });
  }

  /**
   * Enriches the organization profile with data from billing profile.
   * Only fills fields that are currently null — never overwrites existing data.
   */
  static async enrichProfile(
    organizationId: string,
    data: {
      legalName?: string;
      taxId?: string;
      email?: string;
      phone?: string;
      street?: string;
      number?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }
  ): Promise<void> {
    const profile =
      await OrganizationService.findByOrganizationId(organizationId);
    if (!profile) {
      return;
    }

    const fieldsToCheck = [
      "legalName",
      "taxId",
      "email",
      "phone",
      "street",
      "number",
      "complement",
      "neighborhood",
      "city",
      "state",
      "zipCode",
    ] as const;

    const updates: Record<string, string> = {};

    for (const field of fieldsToCheck) {
      const value = data[field];
      if (value && profile[field] === null) {
        updates[field] = value;
      }
    }

    // Sync phone to mobile
    if (updates.phone && profile.mobile === null) {
      updates.mobile = updates.phone;
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    await db
      .update(schema.organizationProfiles)
      .set(updates)
      .where(eq(schema.organizationProfiles.organizationId, organizationId));
  }
}
