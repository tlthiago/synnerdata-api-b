# Grace Period Implementation Plan

> **Priority:** Medium | **Complexity:** Medium
> **Phase:** A.2 - Revenue Protection
> **Created:** 2025-12-14

## Overview

Implementar período de graça (grace period) formal para assinaturas em status `past_due`, com bloqueio automático de acesso após 7 dias de atraso no pagamento.

---

## Current State

### Problema Atual

```typescript
// Em subscription.service.ts:240-313 checkAccess()
case "past_due":
  return {
    hasAccess: true,  // ❌ Acesso indefinido para past_due
    status: "past_due",
    requiresPayment: true,
  };
```

**Comportamento atual:** Status `past_due` dá acesso indefinido sem enforcement formal do período de graça.

### Como Funciona Hoje

1. Webhook `charge.payment_failed` → status = `past_due`
2. `checkAccess()` retorna `hasAccess: true` indefinidamente
3. Sem tracking de quando entrou em past_due
4. Sem job para suspender após período de graça

---

## Implementation Plan

### 1. Database Schema Changes

**File:** `src/db/schema/payments.ts`

**Changes to `orgSubscriptions` table:**

```typescript
export const orgSubscriptions = pgTable("org_subscriptions", {
  // ... existing fields ...

  // NEW: Grace period tracking
  pastDueSince: timestamp("past_due_since"),
  gracePeriodEnds: timestamp("grace_period_ends"),
});
```

**Migration:**

```sql
-- Migration: add-grace-period-fields.sql
ALTER TABLE org_subscriptions
  ADD COLUMN past_due_since TIMESTAMP,
  ADD COLUMN grace_period_ends TIMESTAMP;
```

**Backfill Strategy:**

```typescript
// Para assinaturas existentes em past_due, definir:
// pastDueSince = updatedAt (aproximação)
// gracePeriodEnds = updatedAt + 7 days
```

---

### 2. Update SubscriptionService

**File:** `src/modules/payments/subscription/subscription.service.ts`

#### 2.1 Add Constants

```typescript
// Add at top of file after imports
const GRACE_PERIOD_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
```

#### 2.2 Update `markPastDue()`

**Current implementation (lines 384-389):**
```typescript
static async markPastDue(organizationId: string): Promise<void> {
  await db
    .update(schema.orgSubscriptions)
    .set({ status: "past_due" })
    .where(eq(schema.orgSubscriptions.organizationId, organizationId));
}
```

**New implementation:**
```typescript
static async markPastDue(organizationId: string): Promise<void> {
  const now = new Date();
  const gracePeriodEnds = new Date(now.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY);

  await db
    .update(schema.orgSubscriptions)
    .set({
      status: "past_due",
      pastDueSince: now,
      gracePeriodEnds,
    })
    .where(eq(schema.orgSubscriptions.organizationId, organizationId));
}
```

**Rationale:** Set grace period dates when subscription enters past_due status.

---

#### 2.3 Update `checkAccess()`

**Current implementation (lines 240-313):**
```typescript
case "past_due":
  return {
    hasAccess: true,
    status: "past_due",
    requiresPayment: true,
  };
```

**New implementation:**
```typescript
case "past_due": {
  const now = new Date();

  // Check if grace period has expired
  if (subscription.gracePeriodEnds && now > subscription.gracePeriodEnds) {
    return {
      hasAccess: false,
      status: "past_due",
      requiresPayment: true,
      reason: "grace_period_expired",
    };
  }

  // Calculate days remaining in grace period
  const graceDays = subscription.gracePeriodEnds
    ? Math.max(0, Math.ceil((subscription.gracePeriodEnds.getTime() - now.getTime()) / MS_PER_DAY))
    : GRACE_PERIOD_DAYS;

  return {
    hasAccess: true,
    status: "past_due",
    daysRemaining: graceDays,
    requiresPayment: true,
  };
}
```

**Changes:**
- Block access if `gracePeriodEnds` has passed
- Return `daysRemaining` for grace period (similar to trial)
- Add `reason: "grace_period_expired"` for clarity

---

#### 2.4 Add `suspend()` Method

**Location:** Add after `markPastDue()` method

```typescript
static async suspend(subscriptionId: string): Promise<void> {
  const [subscription] = await db
    .select()
    .from(schema.orgSubscriptions)
    .where(eq(schema.orgSubscriptions.id, subscriptionId))
    .limit(1);

  if (!subscription) {
    throw new SubscriptionNotFoundError(subscriptionId);
  }

  if (subscription.status !== "past_due") {
    return;
  }

  await db
    .update(schema.orgSubscriptions)
    .set({ status: "canceled" })
    .where(eq(schema.orgSubscriptions.id, subscriptionId));

  PaymentHooks.emit("subscription.canceled", { subscription });
}
```

**Rationale:**
- Suspend = transition from `past_due` to `canceled`
- Silent return if not in `past_due` status (idempotent)
- Emit event for downstream integrations

---

#### 2.5 Add Helper Method (Optional)

```typescript
static async isGracePeriodExpired(organizationId: string): Promise<boolean> {
  const [subscription] = await db
    .select({
      status: schema.orgSubscriptions.status,
      gracePeriodEnds: schema.orgSubscriptions.gracePeriodEnds,
    })
    .from(schema.orgSubscriptions)
    .where(eq(schema.orgSubscriptions.organizationId, organizationId))
    .limit(1);

  if (!subscription || subscription.status !== "past_due") {
    return false;
  }

  if (!subscription.gracePeriodEnds) {
    return false;
  }

  return new Date() > subscription.gracePeriodEnds;
}
```

---

### 3. Update JobsService

**File:** `src/modules/payments/jobs/jobs.service.ts`

#### 3.1 Add `suspendExpiredGracePeriods()` Job

**Location:** Add after `processScheduledCancellations()` method

```typescript
static async suspendExpiredGracePeriods(): Promise<{
  processed: number;
  suspended: string[];
}> {
  const now = new Date();

  const expiredGracePeriods = await db
    .select()
    .from(schema.orgSubscriptions)
    .where(
      and(
        eq(schema.orgSubscriptions.status, "past_due"),
        isNotNull(schema.orgSubscriptions.gracePeriodEnds),
        lt(schema.orgSubscriptions.gracePeriodEnds, now)
      )
    );

  const suspended: string[] = [];

  for (const subscription of expiredGracePeriods) {
    try {
      await db
        .update(schema.orgSubscriptions)
        .set({ status: "canceled" })
        .where(eq(schema.orgSubscriptions.id, subscription.id));

      const [org] = await db
        .select({ name: schema.organizations.name })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, subscription.organizationId))
        .limit(1);

      const [owner] = await db
        .select({
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.members)
        .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
        .where(
          and(
            eq(schema.members.organizationId, subscription.organizationId),
            eq(schema.members.role, "owner")
          )
        )
        .limit(1);

      if (owner?.email) {
        try {
          await sendGracePeriodExpiredEmail({
            to: owner.email,
            userName: owner.name ?? "User",
            organizationName: org?.name ?? "your organization",
          });
        } catch (emailError) {
          console.error(
            `Failed to send grace period expired email to ${owner.email}:`,
            emailError
          );
        }
      }

      PaymentHooks.emit("subscription.canceled", { subscription });
      suspended.push(subscription.id);
    } catch (error) {
      console.error(
        `Failed to suspend subscription ${subscription.id} after grace period:`,
        error
      );
    }
  }

  return {
    processed: expiredGracePeriods.length,
    suspended,
  };
}
```

**Rationale:**
- Query subscriptions: `status = "past_due"` AND `gracePeriodEnds < now`
- Update status to `canceled` (access revoked)
- Send email notification to org owner
- Emit `subscription.canceled` event
- Continue processing on errors (resilience)
- Return summary for monitoring

---

### 4. Update Jobs Controller

**File:** `src/modules/payments/jobs/index.ts`

#### 4.1 Add Endpoint

```typescript
.post(
  "/suspend-expired-grace-periods",
  async () => {
    const result = await JobsService.suspendExpiredGracePeriods();
    return { success: true, data: result };
  },
  {
    beforeHandle: validateApiKey,
    response: {
      200: successResponseSchema(
        z.object({
          processed: z.number(),
          suspended: z.array(z.string()),
        })
      ),
      401: unauthorizedErrorSchema,
    },
    detail: {
      summary: "Suspend expired grace periods",
      description: "Suspends subscriptions where grace period has expired (past_due → canceled).",
    },
  }
)
```

---

### 5. Update Jobs Model

**File:** `src/modules/payments/jobs/jobs.model.ts`

#### 5.1 Add Response Schema

```typescript
export const suspendExpiredGracePeriodsResponseSchema = successResponseSchema(
  z.object({
    processed: z.number().describe("Number of subscriptions processed"),
    suspended: z.array(z.string()).describe("IDs of suspended subscriptions"),
  })
);

export type SuspendExpiredGracePeriodsResponse = z.infer<
  typeof suspendExpiredGracePeriodsResponseSchema
>;
```

---

### 6. Update Email Service

**File:** `src/lib/email.ts`

#### 6.1 Add Email Template

```typescript
export async function sendGracePeriodExpiredEmail(params: {
  to: string;
  userName: string;
  organizationName: string;
}): Promise<void> {
  const { to, userName, organizationName } = params;

  await sendEmail({
    to,
    subject: `${organizationName} - Subscription Suspended`,
    text: `
Hi ${userName},

Your subscription for ${organizationName} has been suspended due to payment failure.

Your access has been revoked because the payment retry period (7 days) has expired.

To restore access:
1. Update your payment method
2. Contact support if you need assistance

Best regards,
The Team
    `.trim(),
    html: `
<p>Hi ${userName},</p>

<p>Your subscription for <strong>${organizationName}</strong> has been suspended due to payment failure.</p>

<p>Your access has been revoked because the payment retry period (7 days) has expired.</p>

<p><strong>To restore access:</strong></p>
<ol>
  <li>Update your payment method</li>
  <li>Contact support if you need assistance</li>
</ol>

<p>Best regards,<br>The Team</p>
    `.trim(),
  });
}
```

---

### 7. Update Webhook Service

**File:** `src/modules/payments/webhook/webhook.service.ts`

#### 7.1 Update `handleChargePaid()`

**Current:** When payment succeeds, update status to `active`

**Add:** Clear grace period fields when payment succeeds

```typescript
// In handleChargePaid() method, update the .set() call:
await db
  .update(schema.orgSubscriptions)
  .set({
    status: "active",
    pagarmeSubscriptionId: subscription.id,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    // NEW: Clear grace period fields on successful payment
    pastDueSince: null,
    gracePeriodEnds: null,
  })
  .where(eq(schema.orgSubscriptions.organizationId, organizationId));
```

**Rationale:** When payment is resolved, clear grace period tracking.

---

### 8. Update Cron Configuration

**File:** `src/lib/cron-plugin.ts`

#### 8.1 Add Scheduled Job

```typescript
cron.schedule("0 */6 * * *", async () => {  // Every 6 hours
  try {
    console.log("[CRON] Running suspendExpiredGracePeriods job...");

    const response = await fetch(`${env.API_URL}/v1/payments/jobs/suspend-expired-grace-periods`, {
      method: "POST",
      headers: {
        "x-api-key": env.INTERNAL_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Job failed with status ${response.status}`);
    }

    const result = await response.json();
    console.log(`[CRON] suspendExpiredGracePeriods completed:`, result.data);
  } catch (error) {
    console.error("[CRON] suspendExpiredGracePeriods failed:", error);
  }
});
```

**Schedule:** Every 6 hours (0 */6 * * *)

**Rationale:**
- More frequent than daily to catch expirations promptly
- Less aggressive than hourly to reduce load
- Runs at 00:00, 06:00, 12:00, 18:00 UTC

---

### 9. Update Subscription Model

**File:** `src/modules/payments/subscription/subscription.model.ts`

#### 9.1 Update Response Type

```typescript
// Update GetSubscriptionResponse data schema to include grace period fields
const subscriptionDataSchema = z.object({
  // ... existing fields ...

  // Add grace period fields
  pastDueSince: z.string().datetime().nullable().describe("When subscription entered past_due status"),
  gracePeriodEnds: z.string().datetime().nullable().describe("When grace period expires"),
});
```

#### 9.2 Update CheckAccess Response

```typescript
// Update checkAccessResponseSchema
export const checkAccessResponseSchema = successResponseSchema(
  z.object({
    hasAccess: z.boolean(),
    status: z.enum([
      "active",
      "trial",
      "trial_expired",
      "expired",
      "canceled",
      "past_due",
      "no_subscription",
    ]),
    daysRemaining: z.number().nullable(),
    trialEnd: z.string().datetime().nullable(),
    requiresPayment: z.boolean(),
    reason: z.string().optional(), // NEW: for "grace_period_expired"
  })
);
```

---

## Testing Strategy

### Test Files to Create/Update

#### 1. Service Integration Tests

**File:** `src/modules/payments/subscription/__tests__/subscription.service.test.ts`

**New tests to add:**

```typescript
describe("markPastDue", () => {
  test("should set grace period dates when marking past due", async () => {
    // Arrange
    const org = await createTestOrganization();
    await createTestSubscription(org.id, "test-plan-pro", "active");

    // Act
    await SubscriptionService.markPastDue(org.id);

    // Assert
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription.status).toBe("past_due");
    expect(subscription.pastDueSince).toBeInstanceOf(Date);
    expect(subscription.gracePeriodEnds).toBeInstanceOf(Date);

    const expectedGraceEnd = new Date(subscription.pastDueSince);
    expectedGraceEnd.setDate(expectedGraceEnd.getDate() + 7);
    expect(subscription.gracePeriodEnds?.getTime()).toBeCloseTo(
      expectedGraceEnd.getTime(),
      -3 // Within 1 second
    );
  });
});

describe("checkAccess", () => {
  test("should allow access for past_due within grace period", async () => {
    const org = await createTestOrganization();
    const now = new Date();
    const gracePeriodEnds = new Date(now.getTime() + 5 * MS_PER_DAY); // 5 days remaining

    await createTestSubscription(org.id, "test-plan-pro", {
      status: "past_due",
      pastDueSince: now,
      gracePeriodEnds,
    });

    const result = await SubscriptionService.checkAccess(org.id);

    expect(result.hasAccess).toBe(true);
    expect(result.status).toBe("past_due");
    expect(result.daysRemaining).toBe(5);
    expect(result.requiresPayment).toBe(true);
  });

  test("should deny access for past_due after grace period expires", async () => {
    const org = await createTestOrganization();
    const pastDueSince = new Date();
    pastDueSince.setDate(pastDueSince.getDate() - 10); // 10 days ago
    const gracePeriodEnds = new Date();
    gracePeriodEnds.setDate(gracePeriodEnds.getDate() - 3); // expired 3 days ago

    await createTestSubscription(org.id, "test-plan-pro", {
      status: "past_due",
      pastDueSince,
      gracePeriodEnds,
    });

    const result = await SubscriptionService.checkAccess(org.id);

    expect(result.hasAccess).toBe(false);
    expect(result.status).toBe("past_due");
    expect(result.requiresPayment).toBe(true);
    expect(result.reason).toBe("grace_period_expired");
  });
});

describe("suspend", () => {
  test("should suspend past_due subscription", async () => {
    const org = await createTestOrganization();
    const subscription = await createTestSubscription(org.id, "test-plan-pro", "past_due");

    await SubscriptionService.suspend(subscription.id);

    const [updated] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    expect(updated.status).toBe("canceled");
  });

  test("should be idempotent for non-past_due subscriptions", async () => {
    const org = await createTestOrganization();
    const subscription = await createTestSubscription(org.id, "test-plan-pro", "active");

    await SubscriptionService.suspend(subscription.id);

    const [updated] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    expect(updated.status).toBe("active");
  });
});
```

---

#### 2. Jobs Service Tests

**File:** `src/modules/payments/jobs/__tests__/jobs.service.test.ts`

**Add test suite:**

```typescript
describe("suspendExpiredGracePeriods", () => {
  test("should suspend subscriptions with expired grace periods", async () => {
    const org = await createTestOrganization();
    const pastDueSince = new Date();
    pastDueSince.setDate(pastDueSince.getDate() - 10);
    const gracePeriodEnds = new Date();
    gracePeriodEnds.setDate(gracePeriodEnds.getDate() - 1); // expired yesterday

    await createTestSubscription(org.id, "test-plan-pro", {
      status: "past_due",
      pastDueSince,
      gracePeriodEnds,
    });

    const result = await JobsService.suspendExpiredGracePeriods();

    expect(result.processed).toBe(1);
    expect(result.suspended.length).toBe(1);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription.status).toBe("canceled");
  });

  test("should skip subscriptions still within grace period", async () => {
    const org = await createTestOrganization();
    const gracePeriodEnds = new Date();
    gracePeriodEnds.setDate(gracePeriodEnds.getDate() + 3); // 3 days remaining

    await createTestSubscription(org.id, "test-plan-pro", {
      status: "past_due",
      pastDueSince: new Date(),
      gracePeriodEnds,
    });

    const result = await JobsService.suspendExpiredGracePeriods();

    expect(result.processed).toBe(0);
    expect(result.suspended.length).toBe(0);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription.status).toBe("past_due");
  });

  test("should skip subscriptions without gracePeriodEnds", async () => {
    const org = await createTestOrganization();
    await createTestSubscription(org.id, "test-plan-pro", {
      status: "past_due",
      pastDueSince: new Date(),
      gracePeriodEnds: null,
    });

    const result = await JobsService.suspendExpiredGracePeriods();

    expect(result.processed).toBe(0);
  });

  test("should continue processing after email failure", async () => {
    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();

    const gracePeriodEnds = new Date();
    gracePeriodEnds.setDate(gracePeriodEnds.getDate() - 1);

    await createTestSubscription(org1.id, "test-plan-pro", {
      status: "past_due",
      gracePeriodEnds,
    });
    await createTestSubscription(org2.id, "test-plan-pro", {
      status: "past_due",
      gracePeriodEnds,
    });

    const result = await JobsService.suspendExpiredGracePeriods();

    expect(result.processed).toBe(2);
    expect(result.suspended.length).toBe(2);
  });
});
```

---

#### 3. Jobs Endpoint Tests

**File:** `src/modules/payments/jobs/__tests__/jobs-endpoints.test.ts`

**Add test:**

```typescript
test("POST /suspend-expired-grace-periods should require API key", async () => {
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/jobs/suspend-expired-grace-periods`, {
      method: "POST",
    })
  );

  expect(response.status).toBe(401);
});

test("POST /suspend-expired-grace-periods should process expired grace periods", async () => {
  const org = await createTestOrganization();
  const gracePeriodEnds = new Date();
  gracePeriodEnds.setDate(gracePeriodEnds.getDate() - 1);

  await createTestSubscription(org.id, "test-plan-pro", {
    status: "past_due",
    gracePeriodEnds,
  });

  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/jobs/suspend-expired-grace-periods`, {
      method: "POST",
      headers: { "x-api-key": env.INTERNAL_API_KEY },
    })
  );

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data.processed).toBeGreaterThan(0);
});
```

---

#### 4. Webhook Tests

**File:** `src/modules/payments/webhook/__tests__/webhook.service.test.ts`

**Add test:**

```typescript
describe("handleChargePaid", () => {
  test("should clear grace period fields when payment succeeds", async () => {
    const org = await createTestOrganization();
    const gracePeriodEnds = new Date();
    gracePeriodEnds.setDate(gracePeriodEnds.getDate() + 5);

    await createTestSubscription(org.id, "test-plan-pro", {
      status: "past_due",
      pastDueSince: new Date(),
      gracePeriodEnds,
    });

    // Simulate charge.paid webhook
    // ... webhook processing logic ...

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription.status).toBe("active");
    expect(subscription.pastDueSince).toBeNull();
    expect(subscription.gracePeriodEnds).toBeNull();
  });
});
```

---

#### 5. E2E Use Case Test

**File:** `src/modules/payments/__tests__/grace-period-use-case.test.ts`

**Full lifecycle test:**

```typescript
import { beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestOrganization } from "@/test/helpers/organization";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import { JobsService } from "../jobs/jobs.service";
import { SubscriptionService } from "../subscription/subscription.service";

describe("Grace Period Use Case: Payment Failure to Suspension", () => {
  let organizationId: string;
  let originalTime: Date;

  beforeAll(async () => {
    await seedPlans();
    originalTime = new Date();
  });

  afterAll(async () => {
    setSystemTime();
  });

  describe("Phase 1: Active Subscription", () => {
    test("should create active subscription", async () => {
      const org = await createTestOrganization();
      organizationId = org.id;

      await createTestSubscription(organizationId, "test-plan-pro", "active");

      const access = await SubscriptionService.checkAccess(organizationId);
      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("active");
    });
  });

  describe("Phase 2: Payment Failure", () => {
    test("should mark subscription as past_due with grace period", async () => {
      await SubscriptionService.markPastDue(organizationId);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("past_due");
      expect(subscription.pastDueSince).toBeInstanceOf(Date);
      expect(subscription.gracePeriodEnds).toBeInstanceOf(Date);
    });

    test("should still have access during grace period", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("past_due");
      expect(access.daysRemaining).toBe(7);
      expect(access.requiresPayment).toBe(true);
    });
  });

  describe("Phase 3: Mid-Grace Period (Day 4)", () => {
    test("should advance time to day 4 of grace period", () => {
      const futureDate = new Date(originalTime);
      futureDate.setDate(futureDate.getDate() + 4);
      setSystemTime(futureDate);
    });

    test("should still have access with 3 days remaining", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("past_due");
      expect(access.daysRemaining).toBe(3);
    });
  });

  describe("Phase 4: Grace Period Expired (Day 8)", () => {
    test("should advance time to day 8 (grace period expired)", () => {
      const futureDate = new Date(originalTime);
      futureDate.setDate(futureDate.getDate() + 8);
      setSystemTime(futureDate);
    });

    test("should deny access after grace period expires", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe("past_due");
      expect(access.requiresPayment).toBe(true);
      expect(access.reason).toBe("grace_period_expired");
    });

    test("job should suspend expired grace periods", async () => {
      const result = await JobsService.suspendExpiredGracePeriods();

      expect(result.processed).toBeGreaterThan(0);
      expect(result.suspended).toContain(
        (await db
          .select()
          .from(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.organizationId, organizationId))
          .limit(1))[0].id
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });
  });
});
```

---

## Test Helper Updates

**File:** `src/test/helpers/subscription.ts`

### Update `createTestSubscription`

```typescript
export async function createTestSubscription(
  organizationId: string,
  planId: string,
  statusOrOptions:
    | SubscriptionStatus
    | {
        status?: SubscriptionStatus;
        trialDays?: number;
        pastDueSince?: Date;        // NEW
        gracePeriodEnds?: Date;     // NEW
        cancelAtPeriodEnd?: boolean;
        pagarmeSubscriptionId?: string;
      }
) {
  // ... existing logic ...

  // Add grace period fields support
  const pastDueSince = typeof statusOrOptions === "object"
    ? statusOrOptions.pastDueSince
    : undefined;

  const gracePeriodEnds = typeof statusOrOptions === "object"
    ? statusOrOptions.gracePeriodEnds
    : undefined;

  const [subscription] = await db
    .insert(schema.orgSubscriptions)
    .values({
      // ... existing fields ...
      pastDueSince,
      gracePeriodEnds,
    })
    .returning();

  return subscription;
}
```

---

## Migration Strategy

### 1. Schema Migration

```bash
# Generate migration
bun run db:generate

# Apply migration
bun run db:migrate
```

### 2. Backfill Existing Data

**File:** `src/db/migrations/backfill-grace-periods.ts`

```typescript
import { db } from "@/db";
import { schema } from "@/db/schema";
import { eq } from "drizzle-orm";

const GRACE_PERIOD_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function backfillGracePeriods() {
  const pastDueSubscriptions = await db
    .select()
    .from(schema.orgSubscriptions)
    .where(eq(schema.orgSubscriptions.status, "past_due"));

  for (const subscription of pastDueSubscriptions) {
    const pastDueSince = subscription.updatedAt ?? new Date();
    const gracePeriodEnds = new Date(
      pastDueSince.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY
    );

    await db
      .update(schema.orgSubscriptions)
      .set({
        pastDueSince,
        gracePeriodEnds,
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));
  }

  console.log(`Backfilled ${pastDueSubscriptions.length} past_due subscriptions`);
}
```

**Run once after deployment:**
```bash
bun run src/db/migrations/backfill-grace-periods.ts
```

---

## Rollout Plan

### Stage 1: Schema & Service (Safe)
1. Add database columns (nullable, no behavior change)
2. Update `markPastDue()` to set grace period dates
3. Deploy - no user impact yet

### Stage 2: Access Control (Breaking)
1. Update `checkAccess()` to enforce grace period
2. Deploy - past_due subscriptions beyond 7 days lose access

### Stage 3: Automation
1. Add `suspendExpiredGracePeriods()` job
2. Add cron schedule
3. Deploy - automated suspension begins

### Stage 4: Backfill (Cleanup)
1. Run backfill script for existing past_due subscriptions
2. Monitor suspension job logs

---

## Monitoring & Alerts

### Metrics to Track

1. **Grace period suspensions per day**
   - Expected: Low (indicates healthy payment retry)
   - Alert if spike (payment gateway issue?)

2. **Average time in past_due before suspension**
   - Target: 7 days
   - Alert if consistently < 7 days (job running too aggressively?)

3. **Subscriptions in past_due status**
   - Monitor count over time
   - Trend indicates payment health

### Logging

```typescript
console.log(`[GRACE_PERIOD] Suspended ${suspended.length} subscriptions`);
console.log(`[GRACE_PERIOD] Organization ${orgId} lost access (grace period expired)`);
```

---

## Documentation Updates

### Files to Update

1. **`docs/payments-module.md`**
   - Update subscription lifecycle diagram
   - Add grace period to status matrix
   - Document new job

2. **`docs/payments-backlog.md`**
   - Mark 8.3.1 as ✅ Done

3. **API Documentation (OpenAPI)**
   - Update `GET /subscription` response schema
   - Update `checkAccess` response

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Backfill sets incorrect dates | Users suspended prematurely | Test backfill on staging, use `updatedAt` as safe approximation |
| Email delivery failures | Users not notified of suspension | Log failures, continue processing, add email retry queue (future) |
| Job runs too frequently | Database load | Cron at 6-hour intervals (not hourly) |
| Grace period too short/long | User complaints | Make GRACE_PERIOD_DAYS configurable via env (future) |

---

## Success Criteria

- [ ] All tests pass (unit, integration, E2E)
- [ ] Schema migration successful on staging
- [ ] Backfill completes without errors
- [ ] Job runs successfully in cron (monitor for 48h)
- [ ] Zero unintended suspensions (grace period respected)
- [ ] Documentation updated
- [ ] Code review approved

---

## Implementation Checklist

### Schema & Database
- [ ] Add `pastDueSince` and `gracePeriodEnds` columns to `orgSubscriptions`
- [ ] Generate and apply migration
- [ ] Create backfill script
- [ ] Run backfill on staging

### Service Layer
- [ ] Add `GRACE_PERIOD_DAYS` constant
- [ ] Update `markPastDue()` to set grace period dates
- [ ] Update `checkAccess()` to enforce grace period
- [ ] Add `suspend()` method
- [ ] Add `isGracePeriodExpired()` helper (optional)

### Jobs
- [ ] Add `suspendExpiredGracePeriods()` to JobsService
- [ ] Add endpoint to jobs controller
- [ ] Add response schema to jobs model
- [ ] Add cron schedule (6-hour interval)

### Webhook Integration
- [ ] Update `handleChargePaid()` to clear grace period fields

### Email
- [ ] Add `sendGracePeriodExpiredEmail()` template

### Types & Models
- [ ] Update subscription model with grace period fields
- [ ] Update checkAccess response type with `reason` field

### Tests
- [ ] Add tests to `subscription.service.test.ts`
- [ ] Add tests to `jobs.service.test.ts`
- [ ] Add tests to `jobs-endpoints.test.ts`
- [ ] Add webhook test for clearing grace period
- [ ] Create `grace-period-use-case.test.ts`
- [ ] Update test helpers

### Documentation
- [ ] Update `payments-module.md`
- [ ] Update `payments-backlog.md` (mark 8.3.1 as done)
- [ ] Update API documentation

### Deployment
- [ ] Code review
- [ ] Deploy to staging
- [ ] Test on staging
- [ ] Run backfill on staging
- [ ] Monitor staging for 24h
- [ ] Deploy to production
- [ ] Run backfill on production
- [ ] Monitor production for 48h

---

## Timeline Estimate

- **Schema & Service:** 2-3 hours
- **Jobs & Cron:** 2 hours
- **Tests:** 3-4 hours
- **Documentation:** 1 hour
- **Code Review & Deploy:** 1-2 hours

**Total:** ~10-12 hours of development time

---

## References

- **Backlog:** `docs/payments-backlog.md` (Section 8.3.1)
- **Current State:** `docs/payments-module.md`
- **Code Standards:** `docs/code-standards/module-code-standards.md`
- **Testing Standards:** `docs/code-standards/testing-standards.md`
- **Test Gaps:** `docs/code-standards/payments-test-gaps.md`
