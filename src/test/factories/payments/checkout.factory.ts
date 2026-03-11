import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

type PendingCheckout = typeof schema.pendingCheckouts.$inferSelect;

type CreateCheckoutOptions = {
  paymentLinkId?: string;
  checkoutUrl?: string;
  expirationHours?: number;
  pricingTierId?: string;
  billingCycle?: "monthly" | "yearly";
};

function generateCheckoutId(): string {
  return `checkout-${crypto.randomUUID()}`;
}

function generatePaymentLinkId(): string {
  return `pl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Factory for creating test pending checkouts.
 *
 * Follows Elysia's recommended pattern of abstract class with static methods.
 *
 * @example
 * // Create a pending checkout
 * const checkout = await CheckoutFactory.create(orgId, planId);
 *
 * // Create with specific payment link (for webhook testing)
 * const checkout = await CheckoutFactory.createWithPaymentLink(
 *   orgId,
 *   planId,
 *   "pl_specific123"
 * );
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern for test utilities
export abstract class CheckoutFactory {
  /**
   * Creates a pending checkout for testing.
   */
  static async create(
    organizationId: string,
    planId: string,
    options: CreateCheckoutOptions = {}
  ): Promise<PendingCheckout> {
    const {
      paymentLinkId = generatePaymentLinkId(),
      checkoutUrl,
      expirationHours = 24,
      pricingTierId,
      billingCycle = "monthly",
    } = options;

    const id = generateCheckoutId();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);

    const [checkout] = await db
      .insert(schema.pendingCheckouts)
      .values({
        id,
        organizationId,
        planId,
        pricingTierId,
        billingCycle,
        paymentLinkId,
        checkoutUrl:
          checkoutUrl ?? `https://pagar.me/checkout/${paymentLinkId}`,
        status: "pending",
        expiresAt,
      })
      .returning();

    return checkout;
  }

  /**
   * Creates a pending checkout with a specific payment link ID.
   * Useful for testing webhook flows where you need to match the payment link.
   */
  static createWithPaymentLink(
    organizationId: string,
    planId: string,
    paymentLinkId: string,
    options: Omit<CreateCheckoutOptions, "paymentLinkId"> = {}
  ): Promise<PendingCheckout> {
    return CheckoutFactory.create(organizationId, planId, {
      ...options,
      paymentLinkId,
    });
  }

  /**
   * Gets a checkout by payment link ID.
   */
  static async getByPaymentLinkId(
    paymentLinkId: string
  ): Promise<PendingCheckout | undefined> {
    const [checkout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
      .limit(1);

    return checkout;
  }

  /**
   * Marks a checkout as completed.
   */
  static async markCompleted(paymentLinkId: string): Promise<void> {
    await db
      .update(schema.pendingCheckouts)
      .set({ status: "completed" })
      .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId));
  }
}
