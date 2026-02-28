import { count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type {
  ListOrganizationsData,
  ListOrganizationsInput,
} from "./admin-organization.model";

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
}
