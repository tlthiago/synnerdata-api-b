import { count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type {
  ListOrganizationsData,
  ListOrganizationsInput,
  MemberData,
  OrganizationDetailsData,
  UpdatePowerBiUrlInput,
} from "./admin-organization.model";
import { OrganizationNotFoundError } from "./errors";

export abstract class AdminOrganizationService {
  static async list(
    input: ListOrganizationsInput
  ): Promise<ListOrganizationsData> {
    const { page, limit, search } = input;
    const offset = (page - 1) * limit;

    const searchConditions = search
      ? or(
          ilike(schema.organizations.name, `%${search}%`),
          ilike(schema.organizationProfiles.tradeName, `%${search}%`)
        )
      : undefined;

    const memberCountSq = db
      .select({
        organizationId: schema.members.organizationId,
        count: count().as("member_count"),
      })
      .from(schema.members)
      .groupBy(schema.members.organizationId)
      .as("member_counts");

    const baseConditions = isNull(schema.organizationProfiles.deletedAt);
    const whereCondition = searchConditions
      ? sql`${baseConditions} AND ${searchConditions}`
      : baseConditions;

    const [totalResult, items] = await Promise.all([
      db
        .select({ count: count() })
        .from(schema.organizations)
        .leftJoin(
          schema.organizationProfiles,
          eq(
            schema.organizations.id,
            schema.organizationProfiles.organizationId
          )
        )
        .where(whereCondition),
      db
        .select({
          id: schema.organizations.id,
          name: schema.organizations.name,
          slug: schema.organizations.slug,
          createdAt: schema.organizations.createdAt,
          tradeName: schema.organizationProfiles.tradeName,
          taxId: schema.organizationProfiles.taxId,
          pbUrl: schema.organizationProfiles.pbUrl,
          status: schema.organizationProfiles.status,
          memberCount: memberCountSq.count,
        })
        .from(schema.organizations)
        .leftJoin(
          schema.organizationProfiles,
          eq(
            schema.organizations.id,
            schema.organizationProfiles.organizationId
          )
        )
        .leftJoin(
          memberCountSq,
          eq(schema.organizations.id, memberCountSq.organizationId)
        )
        .where(whereCondition)
        .orderBy(sql`${schema.organizations.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        createdAt: row.createdAt.toISOString(),
        tradeName: row.tradeName ?? null,
        taxId: row.taxId ?? null,
        hasPowerBiUrl: row.pbUrl !== null && row.pbUrl !== undefined,
        memberCount: row.memberCount ?? 0,
        status: row.status ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  static async getDetails(
    organizationId: string
  ): Promise<OrganizationDetailsData> {
    const [org] = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        createdAt: schema.organizations.createdAt,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new OrganizationNotFoundError(organizationId);
    }

    const [profile] = await db
      .select({
        tradeName: schema.organizationProfiles.tradeName,
        legalName: schema.organizationProfiles.legalName,
        taxId: schema.organizationProfiles.taxId,
        email: schema.organizationProfiles.email,
        phone: schema.organizationProfiles.phone,
        street: schema.organizationProfiles.street,
        number: schema.organizationProfiles.number,
        neighborhood: schema.organizationProfiles.neighborhood,
        city: schema.organizationProfiles.city,
        state: schema.organizationProfiles.state,
        zipCode: schema.organizationProfiles.zipCode,
        industry: schema.organizationProfiles.industry,
        businessArea: schema.organizationProfiles.businessArea,
        pbUrl: schema.organizationProfiles.pbUrl,
        status: schema.organizationProfiles.status,
      })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    const membersRows = await db
      .select({
        id: schema.members.id,
        userId: schema.members.userId,
        role: schema.members.role,
        userName: schema.users.name,
        userEmail: schema.users.email,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
      .where(eq(schema.members.organizationId, organizationId));

    const members: MemberData[] = membersRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      role: row.role,
      user: {
        name: row.userName,
        email: row.userEmail,
      },
    }));

    const [subscription] = await db
      .select({
        planName: schema.subscriptionPlans.displayName,
        status: schema.orgSubscriptions.status,
        startDate: schema.orgSubscriptions.currentPeriodStart,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    return {
      ...org,
      profile: profile ?? null,
      memberCount: members.length,
      members,
      subscription: subscription ?? null,
    };
  }

  static async updatePowerBiUrl(
    organizationId: string,
    data: UpdatePowerBiUrlInput
  ): Promise<{ pbUrl: string | null }> {
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new OrganizationNotFoundError(organizationId);
    }

    const [profile] = await db
      .select({ id: schema.organizationProfiles.id })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    if (!profile) {
      throw new OrganizationNotFoundError(organizationId);
    }

    await db
      .update(schema.organizationProfiles)
      .set({ pbUrl: data.url })
      .where(eq(schema.organizationProfiles.organizationId, organizationId));

    return { pbUrl: data.url };
  }
}
