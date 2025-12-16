# Payments Module - Backlog

> Features pending implementation. Last updated: 2025-12-15

## Progress Summary

```
CORE FEATURES (Phases 1-6)     ████████████████████ 100% ✅
AUTOMATION (Phase 7)           ████████████████████ 100% ✅
BILLING ANNUAL (8.2.1)         ████████████████████ 100% ✅
SOFT CANCEL (8.3.3)            ████████████████████ 100% ✅
GRACE PERIOD (8.3.1)           ████████████████████ 100% ✅
PLAN CHANGE (8.2.2)            ████████████████████ 100% ✅
PLAN LIMITS (8.3.2)            ████████████████████ 100% ✅
IMPROVEMENTS (Phase 8)         ██████████████░░░░░░  70% 🟡

OVERALL: ~97% (production ready, improvements ongoing)
```

---

## Backlog Overview

| #     | Module                                                               | Priority   | Complexity | Status     |
| ----- | -------------------------------------------------------------------- | ---------- | ---------- | ---------- |
| 8.2.2 | [Plan Change (Upgrade/Downgrade)](#822-plan-change-upgradedowngrade) | **High**   | High       | ✅ Done    |
| 8.3.1 | [Grace Period](#831-grace-period)                                    | **Medium** | Medium     | ✅ Done    |
| 8.3.2 | [Plan Limits Enforcement](#832-plan-limits-enforcement)              | **Medium** | Medium     | ✅ Done    |
| 8.3.3 | [Soft Cancel](#833-soft-cancel)                                      | **Medium** | Medium     | ✅ Done    |
| 8.4   | [Promotion Codes (Coupons)](#84-promotion-codes)                     | Medium     | Medium     | ⏳ Pending |
| 8.5   | [Seats for Teams](#85-seats-for-teams)                               | Medium     | Medium     | ⏳ Pending |
| 8.6   | [Notifications (Dunning)](#86-notifications-dunning)                 | Low        | Low        | ⏳ Pending |
| 8.7   | [Analytics (MRR, Churn)](#87-analytics)                              | Low        | Medium     | ⏳ Pending |
| 8.8   | [Win-Back (Re-engagement)](#88-win-back-re-engagement)               | Low        | Low        | 💡 Future  |

---

## Recommended Implementation Order

### Phase A: Revenue Protection ✅

1. ~~**8.3.3 Soft Cancel** - Prevent irreversible cancellations~~ ✅
2. ~~**8.3.1 Grace Period** - Formalize past_due handling~~ ✅

### Phase B: Revenue Growth ✅

3. ~~**8.2.2 Plan Change** - Enable upsells~~ ✅
4. ~~**8.3.2 Plan Limits** - Enforce upgrade incentives~~ ✅

### Phase C: Acquisition & Retention

5. **8.4 Promotions** - Marketing campaigns
6. **8.6 Notifications** - Recover failed payments

### Phase D: Scale & Optimize

7. **8.5 Seats** - B2B pricing model
8. **8.7 Analytics** - Business visibility

---

## 8.2.2 Plan Change (Upgrade/Downgrade) ✅

> **Priority:** High | **Complexity:** High | **Status:** Done

### Problem

Users cannot change plans without canceling and resubscribing.

### Pagar.me Limitation

**API v5 does not support direct plan change.** There's no `PUT /subscriptions/{id}` with `plan_id`.

### Solution: Cancel + Recreate Strategy

```
UPGRADE                         DOWNGRADE
   │                               │
   ▼                               ▼
Calculate proration            Schedule for next cycle
(manual)                       (pendingPlanId)
   │                               │
   ▼                               │
Charge via Payment Link        │
(proration amount)             │
   │                               │
   ▼                               ▼
Cancel current subscription    Job processes at period end
   │                               │
   ▼                               ▼
Create new subscription        Cancel + create new
via Payment Link               subscription
```

### Schema Changes

```typescript
// org_subscriptions - added fields:
pendingPlanId: text("pending_plan_id"),
pendingBillingCycle: text("pending_billing_cycle"),
planChangeAt: timestamp("plan_change_at"),
```

### Endpoints

| Method | Path                               | Description                |
| ------ | ---------------------------------- | -------------------------- |
| POST   | `/subscription/change-plan`        | Upgrade/downgrade plan     |
| POST   | `/subscription/change-billing-cycle` | Switch monthly/yearly    |
| GET    | `/subscription/scheduled-change`   | Get pending change info    |
| DELETE | `/subscription/scheduled-change`   | Cancel pending change      |

### Service Methods

```typescript
// PlanChangeService (plan-change.service.ts)
static getChangeType(input): "upgrade" | "downgrade";
static calculateProration(input): number;
static changePlan(input): Promise<ChangePlanResponse>;
static changeBillingCycle(input): Promise<ChangeBillingCycleResponse>;
static getScheduledChange(organizationId): Promise<GetScheduledChangeResponse>;
static cancelScheduledChange(input): Promise<CancelScheduledChangeResponse>;
static executeScheduledChange(subscriptionId): Promise<void>;
static getScheduledChangesForExecution(): Promise<OrgSubscription[]>;
```

### Proration Formula

```typescript
// For upgrades: charge proportional to remaining days
const priceDifference = newPlanPrice - currentPlanPrice;
if (priceDifference <= 0) return 0; // Downgrades: no proration

const totalDays = (periodEnd - periodStart) / MS_PER_DAY;
const remainingDays = Math.max(0, (periodEnd - now) / MS_PER_DAY);
const proration = Math.round(priceDifference * (remainingDays / totalDays));

// Minimum: 100 centavos (R$ 1.00 - Pagar.me minimum)
```

### Billing Cycle Change Logic

```typescript
// Billing cycle change takes precedence over price comparison
// - monthly → yearly = upgrade (more commitment)
// - yearly → monthly = downgrade (less commitment)
```

### Hook Events

```typescript
"planChange.scheduled": { subscription, pendingPlanId, scheduledAt }
"planChange.executed": { subscription, previousPlanId, prorationAmount? }
"planChange.canceled": { subscription, canceledPlanId }
```

### Checklist

- [x] Add schema fields (`pendingPlanId`, `pendingBillingCycle`, `planChangeAt`)
- [x] Implement `getChangeType()` helper
- [x] Implement `calculateProration()` helper
- [x] Implement `POST /subscription/change-plan` endpoint
- [x] Implement `POST /subscription/change-billing-cycle` endpoint
- [x] Implement `GET /subscription/scheduled-change` endpoint
- [x] Implement `DELETE /subscription/scheduled-change` endpoint
- [x] Create job for processing scheduled plan changes
- [x] Add hook events for plan change lifecycle
- [x] Add email notification for plan change executed
- [x] Tests (43 tests passing)

---

## 8.3.1 Grace Period ✅

> **Priority:** Medium | **Complexity:** Medium | **Status:** Done

### Problem

Currently `past_due` returns `hasAccess: true` indefinitely. No formal enforcement of grace period.

### Solution

Add explicit grace period tracking with automatic suspension.

### Schema Changes

```typescript
// org_subscriptions - added fields:
pastDueSince: timestamp("past_due_since"),
gracePeriodEnds: timestamp("grace_period_ends"),
```

### Configuration

```typescript
const GRACE_PERIOD_DAYS = 15; // Aligned with Pagar.me 12-day retry cycle + 3 days buffer
```

### Implementation Details

**Key changes:**

1. **Webhook handlers:** `invoice.payment_failed` now handled same as `charge.payment_failed`
2. **Status mapping:** Pagar.me `unpaid` status now maps to `past_due`
3. **Idempotent `markPastDue()`:** Multiple failures don't reset grace period dates
4. **`charge.paid` clears grace period:** When payment succeeds, `pastDueSince` and `gracePeriodEnds` are set to null
5. **`checkAccess()` enforced:** Returns `hasAccess: false` when grace period expires
6. **New job:** `suspendExpiredGracePeriods()` runs every 6 hours

### Checklist

- [x] Add schema fields (`pastDueSince`, `gracePeriodEnds`)
- [x] Update `markPastDue()` to set grace period dates (idempotent)
- [x] Update `checkAccess()` to enforce grace period
- [x] Handle `invoice.payment_failed` webhook
- [x] Map `unpaid` status to `past_due`
- [x] Clear grace period fields on `charge.paid`
- [x] Create `suspendExpiredGracePeriods()` job
- [x] Add job endpoint (`POST /jobs/suspend-expired-grace-periods`)
- [x] Add cron (every 6 hours)
- [x] Tests (333 tests passing)

---

## 8.3.2 Plan Limits Enforcement ✅

> **Priority:** Medium | **Complexity:** Medium | **Status:** Done

### Problem

`PlanLimits` interface exists but no enforcement service.

### Solution

Created `LimitsService` with feature-based access control per plan.

### Implemented Service

```typescript
// src/modules/payments/limits/limits.service.ts

export abstract class LimitsService {
  // Check single feature (returns status, doesn't throw)
  static async checkFeature(organizationId: string, featureName: string): Promise<CheckFeatureResponse>;

  // Require feature (throws FeatureNotAvailableError if not available)
  static async requireFeature(organizationId: string, featureName: string): Promise<void>;

  // Check multiple features at once
  static async checkFeatures(organizationId: string, featureNames: string[]): Promise<CheckFeaturesResponse>;

  // Get all available features for org's plan
  static async getAvailableFeatures(organizationId: string): Promise<string[]>;

  // Check if org has plan or higher tier (gold < diamond < platinum)
  static async hasPlanOrHigher(organizationId: string, requiredPlan: string): Promise<boolean>;
}
```

### Feature Matrix

| Feature              | Gold | Diamond | Platinum |
| -------------------- | ---- | ------- | -------- |
| terminated_employees | ✅   | ✅      | ✅       |
| absences             | ✅   | ✅      | ✅       |
| medical_certificates | ✅   | ✅      | ✅       |
| accidents            | ✅   | ✅      | ✅       |
| warnings             | ✅   | ✅      | ✅       |
| employee_status      | ✅   | ✅      | ✅       |
| birthdays            | ❌   | ✅      | ✅       |
| ppe                  | ❌   | ✅      | ✅       |
| employee_record      | ❌   | ✅      | ✅       |
| payroll              | ❌   | ❌      | ✅       |

### Usage Example

```typescript
// Check if feature is available (doesn't throw)
const result = await LimitsService.checkFeature(organizationId, "payroll");
// Returns: { success: true, data: { featureName, hasAccess, requiredPlan } }

// Require feature (throws if not available)
await LimitsService.requireFeature(organizationId, "payroll");
// Throws FeatureNotAvailableError if org doesn't have access
```

### Implemented Error

```typescript
export class FeatureNotAvailableError extends PaymentError {
  status = 403;
  constructor(featureName: string, requiredPlan?: string) {
    super(`Feature not available: ${featureName}`, "FEATURE_NOT_AVAILABLE", {
      feature: featureName,
      requiredPlan,
    });
  }
}
```

### Checklist

- [x] Create `LimitsService` with verification methods
- [x] Add `FeatureNotAvailableError`
- [x] Implement `checkFeature()` and `requireFeature()`
- [x] Implement `checkFeatures()` for bulk checks
- [x] Implement `getAvailableFeatures()`
- [x] Implement `hasPlanOrHigher()`
- [x] Tests (limits.service.test.ts)

---

## 8.3.3 Soft Cancel ✅

> **Priority:** Medium | **Complexity:** Medium | **Status:** Done

### Problem

**Pagar.me cancellation is IRREVERSIBLE.** Current `cancel()` calls Pagar.me immediately, making `restore()` impossible.

### Solution

Delay Pagar.me cancellation until period end.

### Current Flow (Problematic)

```
User cancels → PagarmeClient.cancelSubscription() → IRREVERSIBLE
```

### New Flow

```
User cancels
    ↓
Mark cancelAtPeriodEnd = true (LOCAL ONLY)
    ↓
Subscription stays ACTIVE until currentPeriodEnd
    ↓
User can RESTORE anytime before period end
    ↓
[If not restored] → Job cancels on Pagar.me at period end
```

### Updated cancel()

```typescript
static async cancel(input: CancelSubscriptionInput): Promise<CancelSubscriptionResponse> {
  // DO NOT call PagarmeClient.cancelSubscription() here!

  await db
    .update(schema.orgSubscriptions)
    .set({
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    })
    .where(eq(schema.orgSubscriptions.id, subscription.id));

  PaymentHooks.emit("subscription.cancelScheduled", { subscription });

  return {
    success: true,
    data: {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
    },
  };
}
```

### New Job

```typescript
// JobsService.processScheduledCancellations()
// Runs daily, processes subscriptions where:
// - cancelAtPeriodEnd = true
// - currentPeriodEnd < now
// - status in ['active', 'trial']

// For each: call PagarmeClient.cancelSubscription(), update status to 'canceled'
```

### New Hooks

```typescript
"subscription.cancelScheduled": { subscription: OrgSubscription };
"subscription.restored": { subscription: OrgSubscription };
```

### Checklist

- [x] Remove `PagarmeClient.cancelSubscription()` from `cancel()` method
- [x] Update `cancel()` to only set local flags
- [x] Create `processScheduledCancellations()` job
- [x] Add job endpoint (`POST /jobs/process-cancellations`)
- [x] Add new hook events (`subscription.cancelScheduled`, `subscription.restored`)
- [x] Add cancellation scheduled email (`sendCancellationScheduledEmail`)
- [x] Add cron job (daily at 12:00 UTC)
- [x] Tests: cancel → restore → verify still active

---

## 8.4 Promotion Codes

> **Priority:** Medium | **Complexity:** Medium

### Problem

No discount/coupon system for marketing campaigns.

### Solution

Create promotion codes with validation at checkout.

### Schema

```typescript
export const promotionCodes = pgTable("promotion_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull(), // "percentage" | "fixed"
  discountValue: integer("discount_value").notNull(), // percentage (0-100) or centavos
  maxRedemptions: integer("max_redemptions"),
  currentRedemptions: integer("current_redemptions").default(0),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  applicablePlanIds: text("applicable_plan_ids").array(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Endpoints

| Method | Path                   | Description                      |
| ------ | ---------------------- | -------------------------------- |
| POST   | `/promotions`          | Create promotion code (admin)    |
| GET    | `/promotions`          | List promotion codes (admin)     |
| POST   | `/promotions/validate` | Validate code at checkout        |
| POST   | `/checkout`            | Accept `promotionCode` parameter |

### Checklist

- [ ] Create `promotion_codes` table
- [ ] Create `PromotionService` with CRUD and validation
- [ ] Add admin endpoints for management
- [ ] Add validation endpoint for frontend
- [ ] Integrate with checkout (apply discount)
- [ ] Track redemptions
- [ ] Tests

---

## 8.5 Seats for Teams

> **Priority:** Medium | **Complexity:** Medium

### Problem

No per-seat pricing model for B2B customers.

### Solution

Plans with included seats + purchasable extra seats.

### Schema Changes

```typescript
// subscription_plans - add:
includedSeats: integer("included_seats").default(1),
pricePerExtraSeat: integer("price_per_extra_seat"),

// org_subscriptions - add:
extraSeats: integer("extra_seats").default(0),
```

### Logic

```typescript
const totalSeats = plan.includedSeats + subscription.extraSeats;
const currentMembers = await countMembers(organizationId);

if (currentMembers >= totalSeats) {
  // Block invite, prompt to buy more seats
}
```

### Endpoints

| Method | Path                         | Description               |
| ------ | ---------------------------- | ------------------------- |
| GET    | `/subscription/seats`        | Get seats info            |
| POST   | `/subscription/seats/add`    | Purchase extra seats      |
| POST   | `/subscription/seats/remove` | Reduce seats (next cycle) |

### Checklist

- [ ] Add schema fields
- [ ] Create seats calculation logic
- [ ] Integrate with member invite flow
- [ ] Create seats management endpoints
- [ ] Handle proration for mid-cycle seat purchases
- [ ] Tests

---

## 8.6 Notifications (Dunning)

> **Priority:** Low | **Complexity:** Low

### Problem

No email sequence for failed payments (dunning).

### Solution

Automated email sequence to recover failed payments.

### Dunning Schedule

| Day | Email          | Content                               |
| --- | -------------- | ------------------------------------- |
| 0   | Payment Failed | "Payment failed, please update card"  |
| 3   | Reminder       | "Your subscription is at risk"        |
| 5   | Urgent         | "Last chance to update payment"       |
| 7   | Final          | "Access suspended, update to restore" |

### Internal Notifications (Optional)

- Slack/Discord webhook for:
  - New customer
  - Churn (cancellation)
  - Failed payment

### Checklist

- [ ] Create email templates for dunning sequence
- [ ] Create job for Day 0 email (on `charge.payment_failed`)
- [ ] Create job for Day 3, 5, 7 emails
- [ ] Optional: Slack/Discord integration
- [ ] Tests

---

## 8.7 Analytics

> **Priority:** Low | **Complexity:** Medium

### Problem

No visibility into business metrics.

### Solution

Dashboard with key subscription metrics.

### Metrics

| Metric               | Description               | Calculation                                 |
| -------------------- | ------------------------- | ------------------------------------------- |
| **MRR**              | Monthly Recurring Revenue | Sum of all active monthly + (yearly/12)     |
| **ARR**              | Annual Recurring Revenue  | MRR \* 12                                   |
| **ARPU**             | Average Revenue Per User  | MRR / active subscriptions                  |
| **Churn Rate**       | Monthly churn             | Canceled this month / Active start of month |
| **Trial Conversion** | Trial to paid             | Converted trials / Total trials             |

### Endpoint

```
GET /admin/analytics
Response: {
  mrr: number,
  arr: number,
  arpu: number,
  activeSubscriptions: number,
  trialSubscriptions: number,
  churnRate: number,
  trialConversionRate: number,
  mrrHistory: { month: string, value: number }[],
  subscriptionsByPlan: { plan: string, count: number }[],
}
```

### Checklist

- [ ] Create `AnalyticsService` with metric calculations
- [ ] Create admin endpoint
- [ ] Add historical MRR tracking (monthly snapshots)
- [ ] Optional: Breakdown by plan
- [ ] Tests

---

## Dependencies Between Modules

```
┌─────────────────┐
│   Core (1-7)    │
│   (Complete)    │
└────────┬────────┘
         │
         ├────────────────────────────────┐
         │                                │
         ▼                                ▼
┌─────────────────┐              ┌─────────────────┐
│ 8.3 Lifecycle   │              │ 8.6 Notifications│
│ (independent)   │              │ (independent)   │
└────────┬────────┘              └─────────────────┘
         │
         ▼
┌─────────────────┐
│ 8.2 Plan Change │
│ (needs 8.3.3)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐              ┌─────────────────┐
│ 8.4 Promotions  │              │ 8.5 Seats       │
│ (checkout)      │              │ (independent)   │
└─────────────────┘              └─────────────────┘

┌─────────────────┐
│ 8.7 Analytics   │
│ (independent)   │
└─────────────────┘
```

---

## Future Improvements

### 8.8 Win-Back (Re-engagement)

> **Priority:** Low | **Complexity:** Low

#### Problem

Ex-customers who return use the same checkout flow as new customers, missing opportunity for personalized re-engagement.

#### Current Behavior

User with canceled/expired subscription → goes to billing → checkout → new subscription (same flow as new customer).

**This already works.** No separate flow needed.

#### Future Enhancements (Optional)

| Enhancement          | Description                               |
| -------------------- | ----------------------------------------- |
| "Welcome back" email | Different email for returning customers   |
| Win-back promotion   | Special discount code for ex-customers    |
| Analytics tracking   | Distinguish new vs returning customers    |
| Churn reason survey  | Ask why they left before showing checkout |

#### Implementation Hint

```typescript
// In handleSubscriptionCreated() webhook
const hadPreviousSubscription = await db
  .select()
  .from(schema.subscriptionEvents)
  .where(eq(schema.subscriptionEvents.organizationId, organizationId))
  .limit(1);

if (hadPreviousSubscription.length > 0) {
  // Returning customer: different email, analytics event, etc.
  await sendWelcomeBackEmail(...);
  PaymentHooks.emit("customer.winback", { subscription });
}
```

#### Decision

**Not implementing now.** Existing unified checkout flow is sufficient. Revisit when:

- Marketing requests win-back campaigns
- Churn rate becomes a concern
- Need analytics on customer retention

---

## References

### Pagar.me Documentation

- [Subscriptions API v5](https://docs.pagar.me/reference/assinaturas-1)
- [Upgrade/Downgrade (Help)](https://pagarme.helpjuice.com/pt_BR/p1-funcionalidades/assinatura-%C3%A9-poss%C3%ADvel-fazer-upgrade-e-downgrade-de-assinatura)
- [Recurrence Concepts](https://docs.pagar.me/v3/docs/conceitos-de-recorr%C3%AAncia)
- [Edit Subscription Item](https://docs.pagar.me/reference/editar-item)

### API v5 Limitations

| Feature             | API v1/v2                                | API v5 (current) |
| ------------------- | ---------------------------------------- | ---------------- |
| Plan change         | `PUT /subscriptions/{id}` with `plan_id` | Not available    |
| Cycle change        | Via plan change                          | Not available    |
| Native proration    | Yes                                      | No               |
| Reactivate canceled | No                                       | No               |

---

## Decision Log

| Date    | Decision                                 | Rationale                                     |
| ------- | ---------------------------------------- | --------------------------------------------- |
| 2024-12 | Use cancel+recreate for plan change      | API v5 has no direct plan change              |
| 2024-12 | Soft cancel (delay Pagar.me call)        | Pagar.me cancellation is irreversible         |
| 2024-12 | Manual proration calculation             | API v5 has no native proration                |
| 2024-12 | Basic Auth for webhooks                  | Pagar.me doesn't support HMAC signatures      |
| 2024-12 | Trial per organization (not user)        | Allows team members to share trial            |
| 2025-12 | Payment Link for upgrade proration       | Allows user to pay proration via checkout     |
| 2025-12 | Billing cycle priority over price        | monthly→yearly=upgrade, yearly→monthly=downgrade |
| 2025-12 | Schedule downgrades (no credit)          | Simplifies flow, user keeps current plan until period end |

---

## See Also

- **Current State:** `docs/payments-module.md` - What's implemented
