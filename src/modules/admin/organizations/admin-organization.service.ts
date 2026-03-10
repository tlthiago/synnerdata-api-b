import { and, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type {
  ListOrganizationsData,
  ListOrganizationsInput,
  MemberData,
  OrganizationDetailsData,
  UpdatePowerBiUrlInput,
  VirtualSubscriptionStatus,
} from "./admin-organization.model";
import { OrganizationNotFoundError } from "./errors";

export abstract class AdminOrganizationService {
  private static buildSubscriptionStatusFilter(
    statuses: VirtualSubscriptionStatus[]
  ) {
    const conditions = statuses.map((status) => {
      switch (status) {
        case "trial":
          return and(
            eq(schema.orgSubscriptions.status, "active"),
            eq(schema.subscriptionPlans.isTrial, true)
          );
        case "active":
          return and(
            eq(schema.orgSubscriptions.status, "active"),
            eq(schema.subscriptionPlans.isTrial, false)
          );
        case "past_due":
          return eq(schema.orgSubscriptions.status, "past_due");
        case "canceled":
          return eq(schema.orgSubscriptions.status, "canceled");
        case "expired":
          return eq(schema.orgSubscriptions.status, "expired");
        default:
          return eq(schema.orgSubscriptions.status, "active");
      }
    });

    return conditions.length === 1 ? conditions[0] : or(...conditions);
  }

  private static resolveVirtualStatus(
    subStatus: string | null,
    isTrial: boolean | null
  ): VirtualSubscriptionStatus | null {
    if (!subStatus) {
      return null;
    }
    if (subStatus === "active") {
      return isTrial ? "trial" : "active";
    }
    return subStatus as VirtualSubscriptionStatus;
  }

  static async list(
    input: ListOrganizationsInput
  ): Promise<ListOrganizationsData> {
    const { page, limit, search, subscriptionStatus } = input;
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

    const conditions = [isNull(schema.organizationProfiles.deletedAt)];

    if (searchConditions) {
      conditions.push(searchConditions);
    }

    if (subscriptionStatus?.length) {
      const statusFilter =
        AdminOrganizationService.buildSubscriptionStatusFilter(
          subscriptionStatus
        );
      if (statusFilter) {
        conditions.push(statusFilter);
      }
    }

    const whereCondition = and(...conditions);

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
        .leftJoin(
          schema.orgSubscriptions,
          eq(schema.organizations.id, schema.orgSubscriptions.organizationId)
        )
        .leftJoin(
          schema.subscriptionPlans,
          eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
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
          subscriptionId: schema.orgSubscriptions.id,
          subStatus: schema.orgSubscriptions.status,
          planIsTrial: schema.subscriptionPlans.isTrial,
          planName: schema.subscriptionPlans.displayName,
          billingCycle: schema.orgSubscriptions.billingCycle,
          priceAtPurchase: schema.orgSubscriptions.priceAtPurchase,
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
          schema.orgSubscriptions,
          eq(schema.organizations.id, schema.orgSubscriptions.organizationId)
        )
        .leftJoin(
          schema.subscriptionPlans,
          eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
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
        subscriptionId: row.subscriptionId ?? null,
        subscriptionStatus: AdminOrganizationService.resolveVirtualStatus(
          row.subStatus,
          row.planIsTrial
        ),
        planName: row.planName ?? null,
        billingCycle: row.billingCycle ?? null,
        priceAtPurchase: row.priceAtPurchase ?? null,
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

    const [subscriptionRow] = await db
      .select({
        id: schema.orgSubscriptions.id,
        planName: schema.subscriptionPlans.displayName,
        status: schema.orgSubscriptions.status,
        isTrial: schema.subscriptionPlans.isTrial,
        billingCycle: schema.orgSubscriptions.billingCycle,
        priceAtPurchase: schema.orgSubscriptions.priceAtPurchase,
        isCustomPrice: schema.orgSubscriptions.isCustomPrice,
        startDate: schema.orgSubscriptions.currentPeriodStart,
        maxEmployees: schema.planPricingTiers.maxEmployees,
        trialStart: schema.orgSubscriptions.trialStart,
        trialEnd: schema.orgSubscriptions.trialEnd,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .leftJoin(
        schema.planPricingTiers,
        eq(schema.orgSubscriptions.pricingTierId, schema.planPricingTiers.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    const subscription = subscriptionRow
      ? {
          id: subscriptionRow.id,
          planName: subscriptionRow.planName,
          status: subscriptionRow.status,
          isTrial: subscriptionRow.isTrial,
          billingCycle: subscriptionRow.billingCycle ?? null,
          priceAtPurchase: subscriptionRow.priceAtPurchase ?? null,
          isCustomPrice: subscriptionRow.isCustomPrice,
          startDate: subscriptionRow.startDate,
          maxEmployees: subscriptionRow.maxEmployees ?? null,
          trialDays:
            subscriptionRow.trialStart && subscriptionRow.trialEnd
              ? Math.round(
                  (subscriptionRow.trialEnd.getTime() -
                    subscriptionRow.trialStart.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : null,
          trialEnd: subscriptionRow.trialEnd ?? null,
        }
      : null;

    return {
      ...org,
      profile: profile ?? null,
      memberCount: members.length,
      members,
      subscription,
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
