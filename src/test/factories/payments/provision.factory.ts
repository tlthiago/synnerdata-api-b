import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { AdminOrgProvision } from "@/db/schema";
import { schema } from "@/db/schema";
import { getOrCreateSystemTestUser } from "@/test/helpers/system-user";

type CreateProvisionOptions = {
  userId: string;
  organizationId: string;
  type?: "trial" | "checkout";
  status?: "pending_payment" | "pending_activation" | "active" | "deleted";
  activationUrl?: string;
  checkoutUrl?: string;
  checkoutExpiresAt?: Date;
  notes?: string;
  createdBy?: string;
};

// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern for test utilities
export abstract class ProvisionFactory {
  static async create(
    options: CreateProvisionOptions
  ): Promise<AdminOrgProvision> {
    const {
      userId,
      organizationId,
      type = "trial",
      status = "pending_activation",
      activationUrl,
      checkoutUrl,
      checkoutExpiresAt,
      notes,
      createdBy,
    } = options;

    const id = `provision-${crypto.randomUUID()}`;
    const auditUserId = createdBy ?? (await getOrCreateSystemTestUser());

    const [provision] = await db
      .insert(schema.adminOrgProvisions)
      .values({
        id,
        userId,
        organizationId,
        type,
        status,
        activationUrl,
        checkoutUrl,
        checkoutExpiresAt,
        notes,
        createdBy: auditUserId,
        updatedBy: auditUserId,
      })
      .returning();

    return provision;
  }

  static createTrial(
    userId: string,
    organizationId: string,
    createdBy?: string
  ): Promise<AdminOrgProvision> {
    return ProvisionFactory.create({
      userId,
      organizationId,
      type: "trial",
      status: "pending_activation",
      createdBy,
    });
  }

  static createCheckout(
    userId: string,
    organizationId: string,
    createdBy?: string
  ): Promise<AdminOrgProvision> {
    return ProvisionFactory.create({
      userId,
      organizationId,
      type: "checkout",
      status: "pending_payment",
      checkoutUrl: "https://checkout.example.com/test",
      checkoutExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdBy,
    });
  }

  static async getById(
    provisionId: string
  ): Promise<AdminOrgProvision | undefined> {
    const [provision] = await db
      .select()
      .from(schema.adminOrgProvisions)
      .where(eq(schema.adminOrgProvisions.id, provisionId))
      .limit(1);

    return provision;
  }
}
