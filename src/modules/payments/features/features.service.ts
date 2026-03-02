import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  FeatureAlreadyExistsError,
  FeatureNotFoundError,
} from "@/modules/payments/errors";
import type {
  CreateFeatureInput,
  FeatureData,
  ListFeaturesData,
  ListPublicFeaturesData,
  UpdateFeatureInput,
} from "./features.model";

export abstract class FeaturesService {
  static async listPublic(): Promise<ListPublicFeaturesData> {
    const rows = await db
      .select({
        id: schema.features.id,
        displayName: schema.features.displayName,
        description: schema.features.description,
        category: schema.features.category,
        sortOrder: schema.features.sortOrder,
        isDefault: schema.features.isDefault,
        isPremium: schema.features.isPremium,
      })
      .from(schema.features)
      .where(eq(schema.features.isActive, true))
      .orderBy(schema.features.sortOrder);

    return { features: rows };
  }

  static async list(): Promise<ListFeaturesData> {
    const rows = await db
      .select({
        id: schema.features.id,
        displayName: schema.features.displayName,
        description: schema.features.description,
        category: schema.features.category,
        sortOrder: schema.features.sortOrder,
        isActive: schema.features.isActive,
        isDefault: schema.features.isDefault,
        isPremium: schema.features.isPremium,
        createdAt: schema.features.createdAt,
        updatedAt: schema.features.updatedAt,
        planCount: count(schema.planFeatures.planId),
      })
      .from(schema.features)
      .leftJoin(
        schema.planFeatures,
        eq(schema.features.id, schema.planFeatures.featureId)
      )
      .groupBy(schema.features.id)
      .orderBy(schema.features.sortOrder);

    return {
      features: rows.map((row) => FeaturesService.mapFeature(row)),
    };
  }

  static async create(data: CreateFeatureInput): Promise<FeatureData> {
    const existing = await db
      .select({ id: schema.features.id })
      .from(schema.features)
      .where(eq(schema.features.id, data.id))
      .limit(1);

    if (existing.length > 0) {
      throw new FeatureAlreadyExistsError(data.id);
    }

    const [feature] = await db
      .insert(schema.features)
      .values({
        id: data.id,
        displayName: data.displayName,
        description: data.description,
        category: data.category,
        sortOrder: data.sortOrder,
        isDefault: data.isDefault,
        isPremium: data.isPremium,
      })
      .returning();

    return FeaturesService.mapFeature({ ...feature, planCount: 0 });
  }

  static async update(
    featureId: string,
    data: UpdateFeatureInput
  ): Promise<FeatureData> {
    const existing = await db
      .select()
      .from(schema.features)
      .where(eq(schema.features.id, featureId))
      .limit(1);

    if (existing.length === 0) {
      throw new FeatureNotFoundError(featureId);
    }

    const updateData: Record<string, unknown> = {};
    if (data.displayName !== undefined) {
      updateData.displayName = data.displayName;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.category !== undefined) {
      updateData.category = data.category;
    }
    if (data.sortOrder !== undefined) {
      updateData.sortOrder = data.sortOrder;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }
    if (data.isDefault !== undefined) {
      updateData.isDefault = data.isDefault;
    }
    if (data.isPremium !== undefined) {
      updateData.isPremium = data.isPremium;
    }

    const [updated] = await db
      .update(schema.features)
      .set(updateData)
      .where(eq(schema.features.id, featureId))
      .returning();

    const [planCountResult] = await db
      .select({ planCount: count() })
      .from(schema.planFeatures)
      .where(eq(schema.planFeatures.featureId, featureId));

    return FeaturesService.mapFeature({
      ...updated,
      planCount: planCountResult.planCount,
    });
  }

  static async delete(
    featureId: string
  ): Promise<{ deactivated: true; planCount: number } | { deleted: true }> {
    const existing = await db
      .select()
      .from(schema.features)
      .where(eq(schema.features.id, featureId))
      .limit(1);

    if (existing.length === 0) {
      throw new FeatureNotFoundError(featureId);
    }

    const [planCountResult] = await db
      .select({ planCount: count() })
      .from(schema.planFeatures)
      .where(eq(schema.planFeatures.featureId, featureId));

    const planCount = planCountResult.planCount;

    if (planCount > 0) {
      await db
        .update(schema.features)
        .set({ isActive: false })
        .where(eq(schema.features.id, featureId));

      return { deactivated: true, planCount };
    }

    await db.delete(schema.features).where(eq(schema.features.id, featureId));

    return { deleted: true };
  }

  private static mapFeature(row: {
    id: string;
    displayName: string;
    description: string | null;
    category: string | null;
    sortOrder: number;
    isActive: boolean;
    isDefault: boolean;
    isPremium: boolean;
    createdAt: Date;
    updatedAt: Date;
    planCount: number;
  }): FeatureData {
    return {
      id: row.id,
      displayName: row.displayName,
      description: row.description,
      category: row.category,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      isDefault: row.isDefault,
      isPremium: row.isPremium,
      planCount: row.planCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
