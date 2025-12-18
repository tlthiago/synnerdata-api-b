# Payments Module

> Reference for AI agents. Last updated: 2025-12-15

## Quick Reference

| Key         | Value                                  |
| ----------- | -------------------------------------- |
| Gateway     | Pagar.me (Brazilian processor, API v5) |
| Location    | `src/modules/payments/`                |
| Integration | REST API + Webhooks                    |
| Database    | Drizzle ORM + PostgreSQL               |
| Paridade    | ~97% vs Better Auth + Stripe           |

### Environment Variables

```bash
PAGARME_SECRET_KEY=sk_...
PAGARME_BASE_URL=https://api.pagar.me/core/v5
PAGARME_WEBHOOK_USERNAME=...
PAGARME_WEBHOOK_PASSWORD=...
```

---

## Business Model

### Acquisition Flow

```
ORGANIC / SALES / REFERRAL
           ↓
    FREE SIGNUP (30 sec, no card)
           ↓
    TRIAL (14 days, full features)
           ↓
    ┌──────┴──────┐
    ↓             ↓
SELF-SERVICE   SALES-ASSISTED
(Checkout)     (Demo → Proposal)
```

### Why This Model?

| Aspect            | Benefit                                |
| ----------------- | -------------------------------------- |
| Low friction      | Signup in 30 seconds, no card required |
| Experimentation   | User knows the product before paying   |
| Valuable data     | Usage data before conversion           |
| Trust             | User pays knowing what they're buying  |
| Higher conversion | Payers are already engaged             |
| Market aligned    | Same pattern as Slack, Notion, Linear  |

### Progressive Data Collection

| Stage          | Fields                            | Required?             |
| -------------- | --------------------------------- | --------------------- |
| **Signup**     | Email, Password, Name, Company    | Yes                   |
| **Onboarding** | Phone, Role, Company size, Source | No (skip allowed)     |
| **Checkout**   | CNPJ, Phone, Billing email        | Collected by Pagar.me |

**Email verification:** Not required for trial, required for upgrade.

---

## Module Structure

```
payments/
├── pagarme/        # HTTP client for Pagar.me API
├── customer/       # Customer management
├── plan/           # Subscription plans CRUD
├── pricing/        # Pricing tiers based on employee count
├── limits/         # Feature access control by plan
├── subscription/   # Subscription lifecycle
├── checkout/       # Payment Link creation
├── billing/        # Invoices, usage, card updates
├── plan-change/    # Upgrade/downgrade subscriptions
├── webhook/        # Webhook processing
├── hooks/          # Internal event emitter
├── jobs/           # Scheduled jobs
└── errors.ts       # Domain-specific errors
```

---

## Implementation Status

### Implemented

| Feature                             | Service               | Method                                                                           |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------------------- |
| Create customer                     | `CustomerService`     | `create()`                                                                       |
| Get/update customer                 | `PagarmeClient`       | `getCustomer()`, `updateCustomer()`                                              |
| Get or create customer for checkout | `CustomerService`     | `getOrCreateForCheckout()`                                                       |
| List customers                      | `CustomerService`     | `list()`                                                                         |
| Get customer ID                     | `CustomerService`     | `getCustomerId()`                                                                |
| CRUD plans                          | `PlanService`         | `create()`, `update()`, `delete()`, `list()`                                     |
| Sync plans to Pagar.me              | `PlanService`         | `syncToPagarme()`, `ensureSynced()`                                              |
| Create checkout                     | `CheckoutService`     | `create()`                                                                       |
| Get subscription                    | `SubscriptionService` | `getByOrganizationId()`                                                          |
| Cancel subscription                 | `SubscriptionService` | `cancel()`                                                                       |
| Restore subscription                | `SubscriptionService` | `restore()`                                                                      |
| Trial management                    | `SubscriptionService` | `createTrial()`, `canUseTrial()`, `expireTrial()`                                |
| Access check                        | `SubscriptionService` | `checkAccess()`                                                                  |
| Subscription status helpers         | `SubscriptionService` | `hasActiveSubscription()`, `hasPaidSubscription()`, `ensureNoPaidSubscription()` |
| Activate subscription               | `SubscriptionService` | `activate()`                                                                     |
| Mark past due (with grace period)   | `SubscriptionService` | `markPastDue()` - idempotent, sets grace period dates                            |
| Suspend subscription                | `SubscriptionService` | `suspend()` - transitions past_due to canceled after grace period                |
| Grace period job                    | `JobsService`         | `suspendExpiredGracePeriods()` - runs every 6 hours                              |
| List invoices                       | `BillingService`      | `listInvoices()`                                                                 |
| Download invoice                    | `BillingService`      | `getInvoiceDownloadUrl()`                                                        |
| Update card                         | `BillingService`      | `updateCard()`                                                                   |
| Update billing info                 | `BillingService`      | `updateBillingInfo()`                                                            |
| Usage metrics                       | `BillingService`      | `getUsage()`                                                                     |
| Webhook processing                  | `WebhookService`      | `process()`                                                                      |
| Trial expiration jobs               | `JobsService`         | `expireTrials()`, `notifyExpiringTrials()`                                       |
| Scheduled cancellations job         | `JobsService`         | `processScheduledCancellations()`                                                |
| Billing cycle (monthly/yearly)      | `CheckoutService`     | `billingCycle` parameter                                                         |
| Change plan (upgrade/downgrade)     | `PlanChangeService`   | `changePlan()`                                                                   |
| Change billing cycle                | `PlanChangeService`   | `changeBillingCycle()`                                                           |
| Get scheduled change                | `PlanChangeService`   | `getScheduledChange()`                                                           |
| Cancel scheduled change             | `PlanChangeService`   | `cancelScheduledChange()`                                                        |
| Process scheduled plan changes      | `JobsService`         | `processScheduledPlanChanges()` - runs daily                                     |
| **Pricing tiers**                   | `PricingTierService`  | `getTierForEmployeeCount()`, `getTierForCheckout()`                              |
| Lazy Pagar.me plan creation         | `PricingTierService`  | `ensurePagarmePlan()` - creates plan on demand                                   |
| List pricing tiers                  | `PricingTierService`  | `listTiersForPlan()`                                                             |
| Validate employee count             | `PricingTierService`  | `validateEmployeeCount()` - blocks > 180 employees                               |
| **Feature limits by plan**          | `LimitsService`       | `checkFeature()`, `requireFeature()`                                             |
| Check multiple features             | `LimitsService`       | `checkFeatures()` - bulk check                                                   |
| Get available features              | `LimitsService`       | `getAvailableFeatures()`                                                         |
| Check plan level                    | `LimitsService`       | `hasPlanOrHigher()`                                                              |

### Gaps (See payments-backlog.md)

| Feature                | Priority | Status      |
| ---------------------- | -------- | ----------- |
| Coupons/discounts      | Medium   | Backlog 8.4 |
| Seats management       | Medium   | Backlog 8.5 |
| Dunning emails         | Low      | Backlog 8.6 |
| Analytics (MRR, churn) | Low      | Backlog 8.7 |

### Pagar.me Limitations (Cannot Implement)

| Feature                  | Stripe Equivalent       |
| ------------------------ | ----------------------- |
| Billing Portal           | `createPortalSession()` |
| Metered billing          | `usage_type: "metered"` |
| Embedded checkout        | Embedded Checkout       |
| Upcoming invoice preview | `retrieveUpcoming()`    |
| Multi-currency           | 135+ currencies         |
| Direct plan change       | `update({ items })`     |

---

## Authorization

| Action                   | Allowed Roles |
| ------------------------ | ------------- |
| View subscription        | Any member    |
| Upgrade/checkout         | Owner, Admin  |
| Cancel subscription      | Owner, Admin  |
| Restore subscription     | Owner, Admin  |
| Change plan              | Owner, Admin  |
| Change billing cycle     | Owner, Admin  |
| Cancel scheduled change  | Owner, Admin  |
| View scheduled change    | Any member    |
| Update billing/card      | Owner, Admin  |
| View invoices            | Owner, Admin  |

---

## Subscription Lifecycle

```
trial → active → past_due → canceled → expired
```

### Status Matrix

| Status                         | hasAccess | Grace Period       | Allowed Actions               |
| ------------------------------ | --------- | ------------------ | ----------------------------- |
| `trial`                        | Yes       | -                  | upgrade, cancel               |
| `active`                       | Yes       | -                  | cancel, change plan           |
| `active` + `cancelAtPeriodEnd` | Yes       | -                  | restore (soft cancel pending) |
| `past_due` (within grace)      | Yes       | 15 days remaining  | update card                   |
| `past_due` (grace expired)     | No        | 0 days (suspended) | update card, new subscription |
| `canceled`                     | No        | -                  | new subscription              |
| `expired`                      | No        | -                  | new subscription              |

**Grace Period (15 days):**

- When payment fails → `pastDueSince` and `gracePeriodEnds` are set
- User has 15 days to update payment method
- Multiple failures don't reset the dates (idempotent)
- After 15 days → job suspends subscription (status → `canceled`)
- If payment succeeds during grace → dates are cleared, status → `active`

**Soft Cancel Flow:**

- User cancels → `cancelAtPeriodEnd=true`, status stays `active`
- User can restore anytime before `currentPeriodEnd`
- Job processes at `currentPeriodEnd` → status becomes `canceled`

### Key Types

```typescript
type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";
type BillingCycle = "monthly" | "yearly";
type PlanLimits = { maxMembers?: number; features?: string[] };
```

---

## Pricing Tiers

Pricing is based on **employee count**. Each plan has multiple pricing tiers:

| Employees | Gold (Ouro)    | Diamond (Diamante) | Platinum (Platina) |
| --------- | -------------- | ------------------ | ------------------ |
| 0-10      | R$ 399,00/mês  | R$ 499,00/mês      | R$ 599,00/mês      |
| 11-20     | R$ 475,90/mês  | R$ 591,90/mês      | R$ 710,90/mês      |
| 21-30     | R$ 539,90/mês  | R$ 669,90/mês      | R$ 806,90/mês      |
| ...       | ...            | ...                | ...                |
| 91-180    | R$ 1.079,90/mês| R$ 1.288,90/mês    | R$ 1.549,90/mês    |

**Key Rules:**
- Maximum employees: **180** (above requires enterprise contact)
- Annual billing: **20% discount**
- Pagar.me plans are created **lazily** (on first checkout for each tier/cycle)

### Checkout with Employee Count

```typescript
// Checkout now requires employeeCount
await CheckoutService.create({
  userId: "user-123",
  organizationId: "org-456",
  planId: "plan-diamond",
  employeeCount: 25, // Required - selects 21-30 tier
  billingCycle: "monthly",
  successUrl: "https://app.example.com?upgraded=true",
});
```

### PricingTierService Methods

```typescript
// Validate employee count (throws if invalid)
PricingTierService.validateEmployeeCount(employeeCount);

// Get tier for employee count
const { tier } = await PricingTierService.getTierForEmployeeCount(planId, 25);
// Returns: { id, planId, minEmployees, maxEmployees, priceMonthly, priceYearly }

// List all tiers for a plan
const { tiers } = await PricingTierService.listTiersForPlan(planId);

// Get tier for checkout (includes Pagarme plan ID)
const tier = await PricingTierService.getTierForCheckout(planId, 25, "monthly");
// Returns: { ...tierData, pagarmePlanId }
```

---

## Feature Limits by Plan

Each plan has specific features. The `LimitsService` controls access:

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

### LimitsService Methods

```typescript
// Check single feature (returns status, doesn't throw)
const result = await LimitsService.checkFeature(organizationId, "payroll");
// Returns: { success: true, data: { featureName, hasAccess, requiredPlan } }

// Require feature (throws FeatureNotAvailableError if not available)
await LimitsService.requireFeature(organizationId, "payroll");

// Check multiple features
const result = await LimitsService.checkFeatures(organizationId, [
  "absences",
  "payroll",
]);
// Returns: { success: true, data: { features: [...], planName, planDisplayName } }

// Get all available features for org
const features = await LimitsService.getAvailableFeatures(organizationId);
// Returns: ["absences", "birthdays", ...]

// Check if org has at least X plan
const hasDiamond = await LimitsService.hasPlanOrHigher(organizationId, "diamond");
```

---

## Checkout Flow

Checkout opens in a **new browser tab**:

```
[App Tab]                    [New Tab - Pagar.me]
    │                              │
    │ POST /checkout               │
    │ ─────────────────────────────→
    │                              │
    │ Returns { url }              │
    │ ←─────────────────────────────
    │                              │
    │ window.open(url)             │
    │ ─────────────────────────────→
    │                              │ User fills payment
    │                              │ ─────────────────→ Payment
    │                              │
    │                              │ Redirect to successUrl
    │                              │ (same tab as checkout)
    │                              │
    │ Webhook subscription.created │
    │ ←─────────────────────────────
```

**Notes:**

- No `cancel_url` needed (user just closes tab)
- `success_url` should include query param: `?upgraded=true`
- Webhook updates subscription status asynchronously

---

## API Endpoints

### Public

| Method | Path                   | Description       |
| ------ | ---------------------- | ----------------- |
| GET    | `/v1/payments/plans`   | List public plans |
| POST   | `/v1/payments/webhooks/pagarme` | Pagar.me webhooks |

### Protected (requires auth)

| Method | Path                                              | Description                  |
| ------ | ------------------------------------------------- | ---------------------------- |
| GET    | `/v1/payments/plans/:id`                          | Get plan details             |
| POST   | `/v1/payments/checkout`                           | Create checkout session      |
| GET    | `/v1/payments/subscription`                       | Get current subscription     |
| POST   | `/v1/payments/subscription/cancel`                | Cancel subscription          |
| POST   | `/v1/payments/subscription/restore`               | Restore pending cancellation |
| POST   | `/v1/payments/subscription/change-plan`           | Change to different plan     |
| POST   | `/v1/payments/subscription/change-billing-cycle`  | Switch monthly/yearly        |
| GET    | `/v1/payments/subscription/scheduled-change`      | Get pending plan change      |
| DELETE | `/v1/payments/subscription/scheduled-change`      | Cancel pending plan change   |
| GET    | `/v1/payments/billing/invoices`                   | List invoices                |
| GET    | `/v1/payments/billing/invoices/:id/download`      | Download invoice             |
| GET    | `/v1/payments/billing/usage`                      | Get usage metrics            |
| PUT    | `/v1/payments/billing/info`                       | Update billing info          |
| POST   | `/v1/payments/billing/update-card`                | Update payment card          |

### Internal (API key)

| Method | Path                                               | Description                         |
| ------ | -------------------------------------------------- | ----------------------------------- |
| POST   | `/v1/payments/jobs/expire-trials`                  | Cron job (daily)                    |
| POST   | `/v1/payments/jobs/notify-expiring-trials`         | Cron job (daily)                    |
| POST   | `/v1/payments/jobs/process-cancellations`          | Cron job (daily)                    |
| POST   | `/v1/payments/jobs/suspend-expired-grace-periods`  | Cron job (every 6h) - Grace period  |
| POST   | `/v1/payments/jobs/process-scheduled-plan-changes` | Cron job (daily) - Plan changes     |

---

## Webhook Events

| Pagar.me Event          | Handler                        | Action                                                    |
| ----------------------- | ------------------------------ | --------------------------------------------------------- |
| `subscription.created`  | `handleSubscriptionCreated()`  | Activate subscription, sync customer, send email          |
| `subscription.updated`  | `handleSubscriptionUpdated()`  | Update status/period/card (maps `unpaid` → `past_due`)    |
| `subscription.canceled` | `handleSubscriptionCanceled()` | Set status=canceled, send email                           |
| `charge.paid`           | `handleChargePaid()`           | Set status=active, update period, clear grace period      |
| `charge.payment_failed` | `handleChargeFailed()`         | Set status=past_due, set grace period dates (idempotent)  |
| `invoice.payment_failed`| `handleChargeFailed()`         | Same as charge.payment_failed                             |
| `charge.refunded`       | `handleChargeRefunded()`       | Set status=canceled                                       |

**Idempotency:** `subscription_events` table stores `pagarmeEventId`.

---

## Transactional Emails

| Trigger                         | Email Function                     | Recipient          |
| ------------------------------- | ---------------------------------- | ------------------ |
| `subscription.created` webhook  | `sendUpgradeConfirmationEmail()`   | Organization owner |
| `subscription.canceled` webhook | `sendSubscriptionCanceledEmail()`  | Organization owner |
| Cancel request (soft cancel)    | `sendCancellationScheduledEmail()` | Requesting user    |
| Trial expired (job)             | `sendTrialExpiredEmail()`          | Organization owner |
| Trial expiring (job)            | `sendTrialExpiringEmail()`         | Organization owner |
| Plan change executed (job)      | `sendPlanChangeExecutedEmail()`    | Organization owner |

Email failures are caught and logged but do not fail the webhook/job.

---

## Internal Events (PaymentHooks)

```typescript
// Implemented
PaymentHooks.emit("trial.started", { subscription });
PaymentHooks.emit("trial.expiring", { subscription, daysRemaining });
PaymentHooks.emit("trial.expired", { subscription });
PaymentHooks.emit("subscription.activated", { subscription });
PaymentHooks.emit("subscription.cancelScheduled", { subscription }); // Soft cancel requested
PaymentHooks.emit("subscription.restored", { subscription }); // Soft cancel restored
PaymentHooks.emit("subscription.canceled", { subscription }); // Final cancellation (job)
PaymentHooks.emit("subscription.updated", { subscription, changes });
PaymentHooks.emit("charge.paid", { subscriptionId, invoiceId });
PaymentHooks.emit("charge.failed", { subscriptionId, invoiceId, error });
PaymentHooks.emit("charge.refunded", { subscriptionId, chargeId, amount });
PaymentHooks.emit("planChange.scheduled", { subscription, pendingPlanId, scheduledAt }); // Downgrade scheduled
PaymentHooks.emit("planChange.executed", { subscription, previousPlanId, prorationAmount? }); // Plan change executed
PaymentHooks.emit("planChange.canceled", { subscription, canceledPlanId }); // Scheduled change canceled

// Defined but NOT implemented (placeholder)
// PaymentHooks.emit("subscription.renewed", { subscription });
```

---

## Database Schema

| Table                   | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `subscription_plans`    | Plan definitions + `pagarmeMonthlyPlanId`, `pagarmeYearlyPlanId` |
| `plan_pricing_tiers`    | Pricing tiers per plan based on employee count                   |
| `org_subscriptions`     | Subscription state per organization                              |
| `organization_profiles` | Billing info + `pagarmeCustomerId`                               |
| `pending_checkouts`     | Track checkout sessions before completion                        |
| `subscription_events`   | Webhook idempotency via `pagarmeEventId`                         |

**`plan_pricing_tiers` Fields:**

```typescript
id: text("id").primaryKey(),
planId: text("plan_id").references(() => subscriptionPlans.id),
minEmployees: integer("min_employees").notNull(),
maxEmployees: integer("max_employees").notNull(),
priceMonthly: integer("price_monthly").notNull(), // centavos
priceYearly: integer("price_yearly").notNull(),   // centavos
pagarmePlanIdMonthly: text("pagarme_plan_id_monthly"), // Created lazily
pagarmePlanIdYearly: text("pagarme_plan_id_yearly"),   // Created lazily
```

**`org_subscriptions` Pricing Tier Fields:**

```typescript
employeeCount: integer("employee_count"),     // From checkout
pricingTierId: text("pricing_tier_id"),       // Reference to tier
```

**`org_subscriptions` Grace Period Fields:**

```typescript
pastDueSince: timestamp("past_due_since"),      // When payment first failed
gracePeriodEnds: timestamp("grace_period_ends"), // When access will be revoked
```

**`org_subscriptions` Plan Change Fields:**

```typescript
pendingPlanId: text("pending_plan_id"),           // Plan to change to (downgrades)
pendingBillingCycle: text("pending_billing_cycle"), // Billing cycle to change to
planChangeAt: timestamp("plan_change_at"),        // When to execute the change
```

---

## Common Tasks

### Create a new plan

```typescript
await PlanService.create({
  name: "enterprise",
  displayName: "Enterprise",
  priceMonthly: 49900, // centavos
  priceYearly: 479900,
  trialDays: 14,
  limits: { maxMembers: 50 },
  isActive: true,
  isPublic: true,
});

// Sync to Pagar.me (auto on first checkout, or manual)
await PlanService.syncToPagarme(planId);
```

### Check subscription access

```typescript
const access = await SubscriptionService.checkAccess(organizationId);
// Returns: { hasAccess, status, daysRemaining, trialEnd, requiresPayment }
```

### Listen to payment events

```typescript
import { PaymentHooks } from "@/modules/payments/hooks";

PaymentHooks.on("subscription.activated", async ({ subscription }) => {
  // Handle activation
});
```

### Change subscription plan

```typescript
import { PlanChangeService } from "@/modules/payments/plan-change";

// Upgrade returns checkout URL for proration payment
// Downgrade schedules change for end of billing period
const result = await PlanChangeService.changePlan({
  userId: "user-123",
  organizationId: "org-456",
  newPlanId: "plan-enterprise",
  successUrl: "https://app.example.com/billing?upgraded=true",
});

// Returns:
// {
//   success: true,
//   data: {
//     changeType: "upgrade" | "downgrade",
//     immediate: boolean,
//     checkoutUrl?: string,     // For upgrades
//     prorationAmount?: number, // For upgrades
//     scheduledAt?: string,     // For downgrades
//     newPlan: { id, name, displayName }
//   }
// }
```

### Get/cancel scheduled plan change

```typescript
// Check if there's a pending plan change
const scheduled = await PlanChangeService.getScheduledChange(organizationId);
// Returns: { hasScheduledChange: boolean, change?: { pendingPlanId, scheduledAt, ... } }

// Cancel the scheduled change
await PlanChangeService.cancelScheduledChange({
  userId: "user-123",
  organizationId: "org-456",
});
```

---

## Testing

### Test Files

```
src/modules/payments/
├── __tests__/
│   ├── upgrade-use-case.test.ts
│   ├── upgrade-use-case.e2e.ts
│   └── cancel-subscription.e2e.ts
├── billing/__tests__/
│   ├── download-invoice.test.ts
│   ├── get-usage.test.ts
│   ├── list-invoices.test.ts
│   ├── update-billing-info.test.ts
│   └── update-card.test.ts
├── checkout/__tests__/
│   ├── checkout-flow.e2e.ts
│   ├── checkout-webhook-flow.e2e.ts
│   └── create-checkout.test.ts
├── customer/__tests__/
│   ├── customer.service.test.ts
│   └── list-customers.test.ts
├── jobs/__tests__/
│   ├── jobs-endpoints.test.ts
│   └── jobs.service.test.ts
├── limits/__tests__/
│   └── limits.service.test.ts          # Feature access control tests
├── plan-change/__tests__/
│   ├── change-billing-cycle.test.ts
│   ├── change-plan.test.ts
│   ├── plan-change.service.test.ts
│   └── scheduled-change.test.ts
├── plan/__tests__/
│   ├── create-plan.test.ts
│   ├── delete-plan.test.ts
│   ├── get-plan.test.ts
│   ├── list-plans.test.ts
│   ├── plan.service.test.ts
│   ├── sync-plan.test.ts
│   └── update-plan.test.ts
├── pricing/__tests__/
│   └── pricing.service.test.ts         # Pricing tier tests
├── subscription/__tests__/
│   ├── cancel-subscription.test.ts
│   ├── get-subscription.test.ts
│   ├── restore-subscription.test.ts
│   └── subscription.service.test.ts
└── webhook/__tests__/
    ├── process-webhook.test.ts
    └── webhook.service.test.ts
```

### Run Tests

```bash
# All payments tests
bun test src/modules/payments

# Specific module
bun test src/modules/payments/checkout

# E2E tests only
bun test src/modules/payments --test-name-pattern="e2e"
```

---

## Technical Constraints

| Constraint                         | Solution                                                      |
| ---------------------------------- | ------------------------------------------------------------- |
| Pagar.me has no direct plan change | Cancel current + create new subscription                      |
| Pagar.me cancel is irreversible    | Soft cancel locally, real cancel only at period end (backlog) |
| No native proration                | Manual calculation if needed                                  |
| No billing portal                  | Custom endpoints implemented                                  |

---

## Comparison: Better Auth + Stripe vs This Implementation

| Aspect                 | Better Auth + Stripe     | This Implementation               |
| ---------------------- | ------------------------ | --------------------------------- |
| Integration            | Plugin in auth config    | Separate Elysia module            |
| Client SDK             | `authClient.stripe.*`    | REST API calls                    |
| Customer creation      | `createCustomerOnSignUp` | On-demand at checkout             |
| Trial abuse prevention | 1 trial per user         | `trialUsed` flag per org          |
| Checkout               | Stripe Checkout          | Payment Links (type=subscription) |
| Portal                 | Stripe Billing Portal    | Custom `BillingService`           |
| Webhook auth           | HMAC signature           | Basic Auth                        |
| Webhook idempotency    | Via Stripe Event ID      | `subscription_events` table       |

**Paridade:** ~97% with Better Auth + Stripe adapted for Pagar.me.

---

## Key Files

```
src/modules/payments/
├── pagarme/
│   ├── client.ts           # PagarmeClient with all methods
│   └── pagarme.types.ts    # Pagar.me API types
├── plan/
│   ├── plan.service.ts     # syncToPagarme, ensureSynced, CRUD
│   └── index.ts            # Public/protected controllers
├── pricing/
│   ├── pricing.service.ts  # getTierForEmployeeCount, ensurePagarmePlan
│   ├── pricing.model.ts    # Zod schemas and types
│   └── index.ts            # Exports
├── limits/
│   ├── limits.service.ts   # checkFeature, requireFeature, getAvailableFeatures
│   ├── limits.model.ts     # Response types
│   └── index.ts            # Exports
├── checkout/
│   └── checkout.service.ts # create() with Payment Links + employee count
├── plan-change/
│   ├── plan-change.service.ts  # changePlan, changeBillingCycle, executeScheduledChange
│   ├── plan-change.model.ts    # Zod schemas and types
│   └── index.ts                # Plan change controller
├── webhook/
│   └── webhook.service.ts  # handleSubscriptionCreated + syncCustomerData
├── subscription/
│   └── subscription.service.ts # Trial, cancel, restore, checkAccess
├── billing/
│   └── billing.service.ts  # Portal, invoices, card update
├── hooks/
│   └── index.ts            # PaymentHooks event emitter
├── jobs/
│   └── jobs.service.ts     # expireTrials, notifyExpiringTrials, processScheduledPlanChanges
└── errors.ts               # Domain-specific errors
```

---

## See Also

- **Backlog:** `docs/payments-backlog.md` - Features pending implementation
