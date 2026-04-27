import { aliasedTable, and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import type { AdminOrgProvision } from "@/db/schema";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { sendBestEffort } from "@/lib/emails/mailer";
import { sendProvisionCheckoutLinkEmail } from "@/lib/emails/senders/payments";
import { logger } from "@/lib/logger";
import { AdminCheckoutService } from "@/modules/payments/admin-checkout/admin-checkout.service";
import { PlansService } from "@/modules/payments/plans/plans.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type {
  CreateProvisionCheckoutInput,
  CreateProvisionTrialInput,
  ListProvisionsQuery,
  ProvisionData,
} from "./admin-provision.model";
import {
  ProvisionAlreadyActiveError,
  ProvisionAlreadyDeletedError,
  ProvisionNotCheckoutTypeError,
  ProvisionNotFoundError,
  ProvisionPendingPaymentError,
  SlugAlreadyExistsError,
  UserAlreadyExistsError,
} from "./errors";

const creatorUser = aliasedTable(schema.users, "creator_user");
const checkoutTier = aliasedTable(schema.planPricingTiers, "checkout_tier");
const checkoutPlan = aliasedTable(schema.subscriptionPlans, "checkout_plan");
const basePlanAlias = aliasedTable(schema.subscriptionPlans, "base_plan");

type SubscriptionInfo = {
  status: string;
  planName: string | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  maxEmployees: number | null;
  billingCycle: string | null;
  customPriceMonthly: number | null;
};

type ProvisionQueryRow = {
  provision: typeof schema.adminOrgProvisions.$inferSelect;
  userName: string;
  userEmail: string;
  orgName: string;
  creatorId: string | null;
  creatorName: string | null;
  subscriptionStatus: string | null;
  planName: string | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  maxEmployees: number | null;
  billingCycle: string | null;
  customPriceMonthly: number | null;
  // Checkout contract data (from pending_checkouts)
  checkoutMaxEmployees: number | null;
  checkoutBillingCycle: string | null;
  checkoutCustomPriceMonthly: number | null;
  checkoutPlanName: string | null;
};

function buildSubscriptionData(sub: SubscriptionInfo | null) {
  if (!sub) {
    return null;
  }

  const trialDays =
    sub.trialStart && sub.trialEnd
      ? Math.round(
          (sub.trialEnd.getTime() - sub.trialStart.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

  return {
    status: sub.status,
    planName: sub.planName,
    trialDays,
    trialEnd: sub.trialEnd?.toISOString() ?? null,
    maxEmployees: sub.maxEmployees,
    billingCycle: sub.billingCycle,
    customPriceMonthly: sub.customPriceMonthly,
  };
}

function toProvisionData(params: {
  provision: typeof schema.adminOrgProvisions.$inferSelect;
  user: { name: string; email: string };
  org: { name: string };
  createdByUser: { id: string; name: string } | null;
  subscription?: SubscriptionInfo | null;
}): ProvisionData {
  const { provision, user, org, createdByUser, subscription } = params;
  return {
    id: provision.id,
    userId: provision.userId,
    organizationId: provision.organizationId,
    ownerName: user.name,
    ownerEmail: user.email,
    organizationName: org.name,
    type: provision.type,
    status: provision.status,
    activationUrl: provision.activationUrl,
    activatedAt: provision.activatedAt?.toISOString() ?? null,
    checkoutUrl: provision.checkoutUrl,
    checkoutExpiresAt: provision.checkoutExpiresAt?.toISOString() ?? null,
    notes: provision.notes,
    createdBy: createdByUser,
    createdAt: provision.createdAt.toISOString(),
    subscription: buildSubscriptionData(subscription ?? null),
  };
}

/**
 * Creates an organization + member directly via Drizzle, bypassing Better Auth's
 * `allowUserToCreateOrganization` check (which blocks admin/super_admin roles).
 * Also creates the trial subscription that the afterCreateOrganization hook would normally create.
 */
async function createOrganizationForUser(params: {
  name: string;
  tradeName?: string;
  slug: string;
  userId: string;
  trialOptions?: { customPricingTierId?: string; customTrialDays?: number };
}): Promise<{ id: string }> {
  const orgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.organizations).values({
    id: orgId,
    name: params.name,
    slug: params.slug,
    createdAt: now,
  });

  await db.insert(schema.members).values({
    id: memberId,
    organizationId: orgId,
    userId: params.userId,
    role: "owner",
    createdAt: now,
  });

  // Replicate afterCreateOrganization hook: create trial subscription
  await SubscriptionService.createTrial(orgId, params.trialOptions);

  // Create minimal organization profile (tradeName for profile, name for org table)
  const { OrganizationService } = await import(
    "@/modules/organizations/profile/organization.service"
  );
  await OrganizationService.createMinimalProfile(
    orgId,
    params.tradeName ?? params.name
  );

  return { id: orgId };
}

export abstract class AdminProvisionService {
  // ============================================================
  // CREATE WITH TRIAL (#105)
  // ============================================================

  static async createWithTrial(
    input: CreateProvisionTrialInput
  ): Promise<ProvisionData> {
    const {
      ownerName,
      ownerEmail,
      organization,
      organizationSlug,
      trialDays,
      maxEmployees,
      notes,
      adminUserId,
      adminUserName,
      headers,
    } = input;

    // 1. Validate email unique
    await AdminProvisionService.ensureEmailUnique(ownerEmail);

    // 2. Validate slug unique
    await AdminProvisionService.ensureSlugUnique(organizationSlug);

    // 3. Create user via Better Auth admin API (requires admin headers)
    const { user: createdUser } = await auth.api.createUser({
      body: {
        email: ownerEmail,
        password: `P@${crypto.randomUUID()}`,
        name: ownerName,
        role: "user",
      },
      headers,
    });

    try {
      // 4. Create organization directly (bypasses allowUserToCreateOrganization)
      const createdOrg = await createOrganizationForUser({
        name: organization.name,
        tradeName: organization.tradeName,
        slug: organizationSlug,
        userId: createdUser.id,
        trialOptions: trialDays ? { customTrialDays: trialDays } : undefined,
      });

      // Create private trial plan with custom tier if maxEmployees is specified
      if (maxEmployees) {
        const trialPlan = await PlansService.getTrialPlan();
        const { planId, tierId } =
          await AdminProvisionService.createCustomTrialPlan(
            trialPlan,
            maxEmployees,
            createdOrg.id
          );

        // Update subscription to reference the private plan and custom tier
        await db
          .update(schema.orgSubscriptions)
          .set({ planId, pricingTierId: tierId })
          .where(eq(schema.orgSubscriptions.organizationId, createdOrg.id));
      }

      // 5. Enrich org profile with provided data
      const { OrganizationService } = await import(
        "@/modules/organizations/profile/organization.service"
      );
      const {
        name: _name,
        tradeName: _tradeName,
        ...profileData
      } = organization;
      await OrganizationService.enrichProfile(createdOrg.id, profileData);

      // 6. Insert provision record
      const provisionId = `provision-${crypto.randomUUID()}`;
      await db.insert(schema.adminOrgProvisions).values({
        id: provisionId,
        userId: createdUser.id,
        organizationId: createdOrg.id,
        type: "trial",
        status: "pending_activation",
        notes: notes ?? null,
        createdBy: adminUserId,
      });

      // 7. Trigger activation email via requestPasswordReset
      await auth.api.requestPasswordReset({
        body: { email: ownerEmail },
        headers,
      });

      // 8. Return provision data
      const [provision] = await db
        .select()
        .from(schema.adminOrgProvisions)
        .where(eq(schema.adminOrgProvisions.id, provisionId))
        .limit(1);

      const subscriptionInfo =
        await AdminProvisionService.fetchSubscriptionInfo(createdOrg.id);

      return toProvisionData({
        provision,
        user: { name: ownerName, email: ownerEmail },
        org: { name: organization.name },
        createdByUser: { id: adminUserId, name: adminUserName },
        subscription: subscriptionInfo,
      });
    } catch (error) {
      // Cleanup: delete user if org creation or subsequent steps fail
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, createdUser.id))
        .catch((cleanupError) => {
          logger.error({
            type: "admin-provision:cleanup:failed",
            userId: createdUser.id,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          });
        });
      throw error;
    }
  }

  // ============================================================
  // CREATE WITH CHECKOUT (#106)
  // ============================================================

  static async createWithCheckout(
    input: CreateProvisionCheckoutInput
  ): Promise<ProvisionData> {
    const {
      ownerName,
      ownerEmail,
      organization,
      organizationSlug,
      basePlanId,
      maxEmployees,
      billingCycle,
      customPriceMonthly,
      notes,
      adminUserId,
      adminUserName,
      headers,
    } = input;

    // 1. Validate email and slug unique
    await AdminProvisionService.ensureEmailUnique(ownerEmail);
    await AdminProvisionService.ensureSlugUnique(organizationSlug);

    // 2. Create user (emailVerified stays false — blocked until payment)
    const { user: createdUser } = await auth.api.createUser({
      body: {
        email: ownerEmail,
        password: `P@${crypto.randomUUID()}`,
        name: ownerName,
        role: "user",
      },
      headers,
    });

    try {
      // 3. Create organization directly (bypasses allowUserToCreateOrganization)
      const createdOrg = await createOrganizationForUser({
        name: organization.name,
        tradeName: organization.tradeName,
        slug: organizationSlug,
        userId: createdUser.id,
      });

      // 4. Enrich org profile with provided data
      const { OrganizationService } = await import(
        "@/modules/organizations/profile/organization.service"
      );
      const {
        name: _name,
        tradeName: _tradeName,
        ...profileData
      } = organization;
      await OrganizationService.enrichProfile(createdOrg.id, profileData);

      // 5. Insert provision record (pending_payment)
      const provisionId = `provision-${crypto.randomUUID()}`;
      await db.insert(schema.adminOrgProvisions).values({
        id: provisionId,
        userId: createdUser.id,
        organizationId: createdOrg.id,
        type: "checkout",
        status: "pending_payment",
        notes: notes ?? null,
        createdBy: adminUserId,
      });

      // 6. Map organization data to billing object for AdminCheckoutService
      const billing = {
        legalName: organization.legalName,
        taxId: organization.taxId,
        email: organization.email,
        phone: organization.phone,
        street: organization.street,
        number: organization.number,
        complement: organization.complement,
        neighborhood: organization.neighborhood,
        city: organization.city,
        state: organization.state,
        zipCode: organization.zipCode,
      };

      // 7. Build successUrl automatically (frontend activation page)
      const successUrl = `${env.APP_URL}/ativacao?email=${encodeURIComponent(ownerEmail)}`;

      // 8. Call AdminCheckoutService.create() for checkout link
      const checkoutResult = await AdminCheckoutService.create({
        organizationId: createdOrg.id,
        adminUserId,
        basePlanId,
        minEmployees: 0,
        maxEmployees,
        billingCycle,
        customPriceMonthly,
        successUrl,
        notes,
        billing,
      });

      // 9. Update provision with checkout data
      const expiresAt = new Date(checkoutResult.expiresAt);
      await db
        .update(schema.adminOrgProvisions)
        .set({
          checkoutUrl: checkoutResult.checkoutUrl,
          checkoutExpiresAt: expiresAt,
          pendingCheckoutId: checkoutResult.paymentLinkId,
        })
        .where(eq(schema.adminOrgProvisions.id, provisionId));

      // 10. Send checkout link email to owner
      const [plan] = await db
        .select({ displayName: schema.subscriptionPlans.displayName })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, basePlanId))
        .limit(1);

      // Admin-triggered provision já persistida em DB — email falhar não pode
      // reverter a criação da org+user. Admin vê 200 e pode reenviar o email
      // via /admin/provisions/:id/resend-activation.
      await sendBestEffort(
        () =>
          sendProvisionCheckoutLinkEmail({
            to: ownerEmail,
            userName: ownerName,
            organizationName: organization.name,
            planName: plan?.displayName ?? "Plano Customizado",
            checkoutUrl: checkoutResult.checkoutUrl,
            expiresAt,
          }),
        {
          type: "admin-provision:checkout-link-email:failed",
          organizationId: createdOrg.id,
          provisionId,
          ownerEmail,
        }
      );

      // 11. Return provision data (show contracted plan, not interim trial)
      const [provision] = await db
        .select()
        .from(schema.adminOrgProvisions)
        .where(eq(schema.adminOrgProvisions.id, provisionId))
        .limit(1);

      const contractInfo =
        await AdminProvisionService.fetchCheckoutContractInfo(createdOrg.id);

      return toProvisionData({
        provision,
        user: { name: ownerName, email: ownerEmail },
        org: { name: organization.name },
        createdByUser: { id: adminUserId, name: adminUserName },
        subscription: contractInfo,
      });
    } catch (error) {
      // Cleanup: delete user (CASCADE deletes org, members, subscriptions)
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, createdUser.id))
        .catch((cleanupError) => {
          logger.error({
            type: "admin-provision:cleanup:failed",
            userId: createdUser.id,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          });
        });
      throw error;
    }
  }

  // ============================================================
  // LIST (#107)
  // ============================================================

  static async list(query: ListProvisionsQuery) {
    const { status, type, limit, offset } = query;

    const conditions: ReturnType<typeof eq>[] = [];

    if (status) {
      conditions.push(eq(schema.adminOrgProvisions.status, status));
    } else {
      // By default exclude soft-deleted provisions
      conditions.push(isNull(schema.adminOrgProvisions.deletedAt));
    }

    if (type) {
      conditions.push(eq(schema.adminOrgProvisions.type, type));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [totalResult]] = await Promise.all([
      db
        .select({
          provision: schema.adminOrgProvisions,
          userName: schema.users.name,
          userEmail: schema.users.email,
          orgName: schema.organizations.name,
          creatorId: creatorUser.id,
          creatorName: creatorUser.name,
          subscriptionStatus: schema.orgSubscriptions.status,
          planName: schema.subscriptionPlans.displayName,
          trialStart: schema.orgSubscriptions.trialStart,
          trialEnd: schema.orgSubscriptions.trialEnd,
          maxEmployees: schema.planPricingTiers.maxEmployees,
          billingCycle: schema.orgSubscriptions.billingCycle,
          customPriceMonthly: schema.orgSubscriptions.priceAtPurchase,
          // Checkout contract data (from pending_checkouts → private plan → base plan)
          checkoutMaxEmployees: checkoutTier.maxEmployees,
          checkoutBillingCycle: schema.pendingCheckouts.billingCycle,
          checkoutCustomPriceMonthly:
            schema.pendingCheckouts.customPriceMonthly,
          checkoutPlanName: basePlanAlias.displayName,
        })
        .from(schema.adminOrgProvisions)
        .innerJoin(
          schema.users,
          eq(schema.adminOrgProvisions.userId, schema.users.id)
        )
        .innerJoin(
          schema.organizations,
          eq(schema.adminOrgProvisions.organizationId, schema.organizations.id)
        )
        .leftJoin(
          creatorUser,
          eq(schema.adminOrgProvisions.createdBy, creatorUser.id)
        )
        .leftJoin(
          schema.orgSubscriptions,
          eq(
            schema.adminOrgProvisions.organizationId,
            schema.orgSubscriptions.organizationId
          )
        )
        .leftJoin(
          schema.subscriptionPlans,
          eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
        )
        .leftJoin(
          schema.planPricingTiers,
          eq(schema.orgSubscriptions.pricingTierId, schema.planPricingTiers.id)
        )
        // Join pending_checkouts → checkout tier → checkout plan → base plan
        .leftJoin(
          schema.pendingCheckouts,
          and(
            eq(
              schema.adminOrgProvisions.organizationId,
              schema.pendingCheckouts.organizationId
            ),
            eq(schema.pendingCheckouts.status, "pending")
          )
        )
        .leftJoin(
          checkoutTier,
          eq(schema.pendingCheckouts.pricingTierId, checkoutTier.id)
        )
        .leftJoin(
          checkoutPlan,
          eq(schema.pendingCheckouts.planId, checkoutPlan.id)
        )
        .leftJoin(basePlanAlias, eq(checkoutPlan.basePlanId, basePlanAlias.id))
        .where(whereClause)
        .orderBy(sql`${schema.adminOrgProvisions.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(schema.adminOrgProvisions)
        .where(whereClause),
    ]);

    const data = (items as ProvisionQueryRow[]).map((item) => {
      // For checkout pending_payment: show contracted plan data, not interim trial
      const isCheckoutPending =
        item.provision.type === "checkout" &&
        item.provision.status === "pending_payment" &&
        item.checkoutMaxEmployees !== null;

      let subscription: SubscriptionInfo | null = null;
      if (isCheckoutPending) {
        subscription = {
          status: "pending_payment",
          planName: item.checkoutPlanName,
          trialStart: null,
          trialEnd: null,
          maxEmployees: item.checkoutMaxEmployees,
          billingCycle: item.checkoutBillingCycle,
          customPriceMonthly: item.checkoutCustomPriceMonthly,
        };
      } else if (item.subscriptionStatus) {
        subscription = {
          status: item.subscriptionStatus,
          planName: item.planName,
          trialStart: item.trialStart,
          trialEnd: item.trialEnd,
          maxEmployees: item.maxEmployees,
          billingCycle: item.billingCycle,
          customPriceMonthly: item.customPriceMonthly,
        };
      }

      return toProvisionData({
        provision: item.provision,
        user: { name: item.userName, email: item.userEmail },
        org: { name: item.orgName },
        createdByUser: item.creatorId
          ? { id: item.creatorId, name: item.creatorName ?? "" }
          : null,
        subscription,
      });
    });

    return {
      data,
      pagination: { total: totalResult.count, limit, offset },
    };
  }

  // ============================================================
  // RESEND ACTIVATION (#107)
  // ============================================================

  static async resendActivation(
    provisionId: string,
    headers: Headers
  ): Promise<ProvisionData> {
    const provision =
      await AdminProvisionService.getProvisionOrThrow(provisionId);

    if (provision.status === "active") {
      throw new ProvisionAlreadyActiveError(provisionId);
    }

    if (provision.status === "pending_payment") {
      throw new ProvisionPendingPaymentError(provisionId);
    }

    if (provision.status === "deleted") {
      throw new ProvisionAlreadyDeletedError(provisionId);
    }

    // Get user email
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, provision.userId),
    });

    if (!user) {
      throw new ProvisionNotFoundError(provisionId);
    }

    // Trigger new activation email
    await auth.api.requestPasswordReset({
      body: { email: user.email },
      headers,
    });

    // Re-fetch provision (URL updated by callback)
    const [updated] = await db
      .select()
      .from(schema.adminOrgProvisions)
      .where(eq(schema.adminOrgProvisions.id, provisionId))
      .limit(1);

    const [org] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, provision.organizationId))
      .limit(1);

    const [createdByUser, subscriptionInfo] = await Promise.all([
      AdminProvisionService.fetchCreatedByUser(updated.createdBy),
      AdminProvisionService.fetchSubscriptionInfo(provision.organizationId),
    ]);

    return toProvisionData({
      provision: updated,
      user: { name: user.name, email: user.email },
      org: { name: org?.name ?? "" },
      createdByUser,
      subscription: subscriptionInfo,
    });
  }

  // ============================================================
  // REGENERATE CHECKOUT (#107)
  // ============================================================

  static async regenerateCheckout(
    provisionId: string,
    adminUserId: string
  ): Promise<ProvisionData> {
    const provision =
      await AdminProvisionService.getProvisionOrThrow(provisionId);

    AdminProvisionService.validateForRegeneration(provision);

    const [{ oldCheckout, plan, tier }, provisionUser] = await Promise.all([
      AdminProvisionService.fetchRegenerationContext(provision),
      db.query.users.findFirst({
        where: eq(schema.users.id, provision.userId),
      }),
    ]);

    // Create new checkout using AdminCheckoutService
    const basePlanId = plan.basePlanId ?? plan.id;
    const successUrl = `${env.APP_URL}/ativacao?email=${encodeURIComponent(provisionUser?.email ?? "")}`;
    const checkoutResult = await AdminCheckoutService.create({
      organizationId: provision.organizationId,
      adminUserId,
      basePlanId,
      minEmployees: tier.minEmployees,
      maxEmployees: tier.maxEmployees,
      billingCycle: (oldCheckout.billingCycle ?? "monthly") as
        | "monthly"
        | "yearly",
      customPriceMonthly: oldCheckout.customPriceMonthly ?? tier.priceMonthly,
      successUrl,
      notes: provision.notes ?? undefined,
    });

    // Update provision with new checkout data
    const expiresAt = new Date(checkoutResult.expiresAt);
    await db
      .update(schema.adminOrgProvisions)
      .set({
        checkoutUrl: checkoutResult.checkoutUrl,
        checkoutExpiresAt: expiresAt,
        pendingCheckoutId: checkoutResult.paymentLinkId,
        updatedBy: adminUserId,
      })
      .where(eq(schema.adminOrgProvisions.id, provisionId));

    // Send new checkout link email
    await AdminProvisionService.sendRegenerationEmail(
      provision,
      plan.displayName,
      checkoutResult.checkoutUrl,
      expiresAt
    );

    return AdminProvisionService.fetchProvisionData(provision);
  }

  // ============================================================
  // DELETE PROVISION (#107)
  // ============================================================

  static async deleteProvision(
    provisionId: string,
    adminUserId: string
  ): Promise<void> {
    const provision =
      await AdminProvisionService.getProvisionOrThrow(provisionId);

    if (provision.status === "deleted") {
      throw new ProvisionAlreadyDeletedError(provisionId);
    }

    // Hard delete org (CASCADE removes members, subscriptions, billing, pending_checkouts)
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, provision.organizationId));

    // Hard delete user (CASCADE removes sessions, accounts)
    await db.delete(schema.users).where(eq(schema.users.id, provision.userId));

    // Soft-delete provision for audit trail
    await db
      .update(schema.adminOrgProvisions)
      .set({
        status: "deleted",
        deletedAt: new Date(),
        deletedBy: adminUserId,
      })
      .where(eq(schema.adminOrgProvisions.id, provisionId));
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private static validateForRegeneration(provision: AdminOrgProvision): void {
    if (provision.type !== "checkout") {
      throw new ProvisionNotCheckoutTypeError(provision.id);
    }

    if (provision.status === "active") {
      throw new ProvisionAlreadyActiveError(provision.id);
    }

    if (provision.status === "deleted") {
      throw new ProvisionAlreadyDeletedError(provision.id);
    }
  }

  private static async fetchRegenerationContext(provision: AdminOrgProvision) {
    const [oldCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(
        and(
          eq(schema.pendingCheckouts.organizationId, provision.organizationId),
          eq(schema.pendingCheckouts.status, "pending")
        )
      )
      .limit(1);

    if (!oldCheckout) {
      throw new ProvisionNotFoundError(provision.id);
    }

    // Mark old checkout as expired
    await db
      .update(schema.pendingCheckouts)
      .set({ status: "expired" })
      .where(eq(schema.pendingCheckouts.id, oldCheckout.id));

    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, oldCheckout.planId))
      .limit(1);

    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.planId, oldCheckout.planId))
      .limit(1);

    if (!(plan && tier)) {
      throw new ProvisionNotFoundError(provision.id);
    }

    return { oldCheckout, plan, tier };
  }

  private static async sendRegenerationEmail(
    provision: AdminOrgProvision,
    planDisplayName: string,
    checkoutUrl: string,
    expiresAt: Date
  ): Promise<void> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, provision.userId),
    });

    if (!user) {
      return;
    }

    const [org] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, provision.organizationId))
      .limit(1);

    // Regenerate checkout — admin action de retry. Checkout link já foi gerado
    // e salvo; email falhar não pode reverter a regeneração. Admin pode chamar
    // resend-activation se precisar.
    await sendBestEffort(
      () =>
        sendProvisionCheckoutLinkEmail({
          to: user.email,
          userName: user.name,
          organizationName: org?.name ?? "",
          planName: planDisplayName,
          checkoutUrl,
          expiresAt,
        }),
      {
        type: "admin-provision:regenerate-email:failed",
        provisionId: provision.id,
        userEmail: user.email,
      }
    );
  }

  private static async fetchProvisionData(
    provision: AdminOrgProvision
  ): Promise<ProvisionData> {
    const [updated] = await db
      .select()
      .from(schema.adminOrgProvisions)
      .where(eq(schema.adminOrgProvisions.id, provision.id))
      .limit(1);

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, provision.userId),
    });

    const [org] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, provision.organizationId))
      .limit(1);

    const isCheckoutPending =
      updated.type === "checkout" && updated.status === "pending_payment";

    const [createdByUser, subscriptionInfo] = await Promise.all([
      AdminProvisionService.fetchCreatedByUser(updated.createdBy),
      isCheckoutPending
        ? AdminProvisionService.fetchCheckoutContractInfo(
            provision.organizationId
          )
        : AdminProvisionService.fetchSubscriptionInfo(provision.organizationId),
    ]);

    return toProvisionData({
      provision: updated,
      user: { name: user?.name ?? "", email: user?.email ?? "" },
      org: { name: org?.name ?? "" },
      createdByUser,
      subscription: subscriptionInfo,
    });
  }

  /**
   * Creates a private trial plan with a custom tier for admin provisions.
   * Unlike the old approach that added tiers to the default trial plan (polluting it),
   * this creates an isolated private plan per provision — same pattern as admin-checkout.
   */
  private static async createCustomTrialPlan(
    trialPlan: { id: string; displayName: string; trialDays: number },
    maxEmployees: number,
    organizationId: string
  ): Promise<{ planId: string; tierId: string }> {
    const planId = `plan-${crypto.randomUUID()}`;
    const tierId = `tier-${crypto.randomUUID()}`;
    const timestamp = Date.now();

    await db.transaction(async (tx) => {
      await tx.insert(schema.subscriptionPlans).values({
        id: planId,
        name: `custom-trial-${organizationId}-${timestamp}`,
        displayName: trialPlan.displayName,
        description: `Custom trial plan for org ${organizationId}`,
        trialDays: trialPlan.trialDays,
        isActive: true,
        isPublic: false,
        isTrial: true,
        sortOrder: -1,
        organizationId,
        basePlanId: trialPlan.id,
      });

      // Copy features from base trial plan
      const baseFeatures = await tx
        .select({ featureId: schema.planFeatures.featureId })
        .from(schema.planFeatures)
        .where(eq(schema.planFeatures.planId, trialPlan.id));

      if (baseFeatures.length > 0) {
        await tx.insert(schema.planFeatures).values(
          baseFeatures.map((f) => ({
            planId,
            featureId: f.featureId,
          }))
        );
      }

      // Copy limits from base trial plan (with custom maxEmployees)
      const baseLimits = await tx
        .select({
          limitKey: schema.planLimits.limitKey,
          limitValue: schema.planLimits.limitValue,
        })
        .from(schema.planLimits)
        .where(eq(schema.planLimits.planId, trialPlan.id));

      if (baseLimits.length > 0) {
        await tx.insert(schema.planLimits).values(
          baseLimits.map((l) => ({
            planId,
            limitKey: l.limitKey,
            limitValue:
              l.limitKey === "max_employees" ? maxEmployees : l.limitValue,
          }))
        );
      }

      await tx.insert(schema.planPricingTiers).values({
        id: tierId,
        planId,
        minEmployees: 0,
        maxEmployees,
        priceMonthly: 0,
        priceYearly: 0,
      });
    });

    return { planId, tierId };
  }

  private static async fetchSubscriptionInfo(
    organizationId: string
  ): Promise<SubscriptionInfo | null> {
    const [row] = await db
      .select({
        status: schema.orgSubscriptions.status,
        planName: schema.subscriptionPlans.displayName,
        trialStart: schema.orgSubscriptions.trialStart,
        trialEnd: schema.orgSubscriptions.trialEnd,
        maxEmployees: schema.planPricingTiers.maxEmployees,
        billingCycle: schema.orgSubscriptions.billingCycle,
        customPriceMonthly: schema.orgSubscriptions.priceAtPurchase,
      })
      .from(schema.orgSubscriptions)
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .leftJoin(
        schema.planPricingTiers,
        eq(schema.orgSubscriptions.pricingTierId, schema.planPricingTiers.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Fetches contracted plan data from a pending checkout.
   * Used to show the admin what was contracted (not the interim trial).
   */
  private static async fetchCheckoutContractInfo(
    organizationId: string
  ): Promise<SubscriptionInfo | null> {
    const [row] = await db
      .select({
        maxEmployees: schema.planPricingTiers.maxEmployees,
        billingCycle: schema.pendingCheckouts.billingCycle,
        customPriceMonthly: schema.pendingCheckouts.customPriceMonthly,
        basePlanId: schema.subscriptionPlans.basePlanId,
      })
      .from(schema.pendingCheckouts)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.pendingCheckouts.planId, schema.subscriptionPlans.id)
      )
      .leftJoin(
        schema.planPricingTiers,
        eq(schema.pendingCheckouts.pricingTierId, schema.planPricingTiers.id)
      )
      .where(
        and(
          eq(schema.pendingCheckouts.organizationId, organizationId),
          eq(schema.pendingCheckouts.status, "pending")
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    // Get display name from the base plan (the public plan the admin selected)
    let planName: string | null = null;
    if (row.basePlanId) {
      const [basePlan] = await db
        .select({ displayName: schema.subscriptionPlans.displayName })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, row.basePlanId))
        .limit(1);
      planName = basePlan?.displayName ?? null;
    }

    return {
      status: "pending_payment",
      planName,
      trialStart: null,
      trialEnd: null,
      maxEmployees: row.maxEmployees,
      billingCycle: row.billingCycle,
      customPriceMonthly: row.customPriceMonthly,
    };
  }

  private static async ensureEmailUnique(email: string): Promise<void> {
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (existing) {
      throw new UserAlreadyExistsError(email);
    }
  }

  private static async ensureSlugUnique(slug: string): Promise<void> {
    const existing = await db.query.organizations.findFirst({
      where: eq(schema.organizations.slug, slug),
    });
    if (existing) {
      throw new SlugAlreadyExistsError(slug);
    }
  }

  private static async fetchCreatedByUser(
    createdBy: string | null
  ): Promise<{ id: string; name: string } | null> {
    if (!createdBy) {
      return null;
    }

    const [user] = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, createdBy))
      .limit(1);

    return user ?? null;
  }

  private static async getProvisionOrThrow(provisionId: string) {
    const provision = await db.query.adminOrgProvisions.findFirst({
      where: eq(schema.adminOrgProvisions.id, provisionId),
    });

    if (!provision) {
      throw new ProvisionNotFoundError(provisionId);
    }

    return provision;
  }
}
