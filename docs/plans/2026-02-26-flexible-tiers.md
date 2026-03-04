# Flexible Employee Tiers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded `EMPLOYEE_TIERS` validation in paid plans with integrity-based validation that accepts any valid contiguous tier ranges.

**Architecture:** Replace `validatePaidPlanTiers()` (which enforces exact match against 10 hardcoded tiers) with `validatePaidPlanTiers()` that validates structural integrity: at least 1 tier, `min >= 0`, `min <= max`, contiguous, no overlaps, no gaps. Keep `EMPLOYEE_TIERS` as a default template for seeds. Trial validation unchanged.

**Tech Stack:** TypeScript, Bun test runner, Zod v4, Drizzle ORM

---

## Task 1: Add New Error Classes

**Files:**
- Modify: `src/modules/payments/errors.ts:408-434` (replace `InvalidTierCountError` and `InvalidTierRangeError`)

**Step 1: Replace error classes**

Replace `InvalidTierCountError` (lines 408-418) with a version that supports "at least N" messaging. Replace `InvalidTierRangeError` (lines 420-434) with four specific error classes.

```typescript
// Replace InvalidTierCountError — now says "at least" for paid, "exactly" for trial
export class InvalidTierCountError extends PaymentError {
  status = 422;

  constructor(provided: number, minimum: number) {
    super(
      `At least ${minimum} pricing tier(s) required, but received ${provided}.`,
      "INVALID_TIER_COUNT",
      { provided, minimum }
    );
  }
}

// Replace InvalidTierRangeError with specific errors:

export class TierNegativeMinError extends PaymentError {
  status = 422;

  constructor(index: number, minEmployees: number) {
    super(
      `Tier at index ${index} has negative minEmployees (${minEmployees}). Must be >= 0.`,
      "TIER_NEGATIVE_MIN",
      { index, minEmployees }
    );
  }
}

export class TierMinExceedsMaxError extends PaymentError {
  status = 422;

  constructor(index: number, min: number, max: number) {
    super(
      `Tier at index ${index} has minEmployees (${min}) > maxEmployees (${max}).`,
      "TIER_MIN_EXCEEDS_MAX",
      { index, min, max }
    );
  }
}

export class TierOverlapError extends PaymentError {
  status = 422;

  constructor(index: number, previousMax: number, currentMin: number) {
    super(
      `Tier at index ${index} overlaps with previous tier: previous max is ${previousMax}, current min is ${currentMin}.`,
      "TIER_OVERLAP",
      { index, previousMax, currentMin }
    );
  }
}

export class TierGapError extends PaymentError {
  status = 422;

  constructor(index: number, expectedMin: number, actualMin: number) {
    super(
      `Gap between tiers at index ${index - 1} and ${index}: expected min ${expectedMin}, got ${actualMin}.`,
      "TIER_GAP",
      { index, expectedMin, actualMin }
    );
  }
}
```

Keep `InvalidTierRangeError` for trial validation (it's still used there).

**Step 2: Verify no compile errors**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors

---

## Task 2: Update `validatePaidPlanTiers()` in Service

**Files:**
- Modify: `src/modules/payments/plans/plans.service.ts:1-19` (imports)
- Modify: `src/modules/payments/plans/plans.service.ts:297-317` (replace `validatePaidPlanTiers`)

**Step 1: Update imports**

Remove `EMPLOYEE_TIERS_COUNT` from imports (line 17). Add new error imports.

Old imports from errors (lines 4-13):
```typescript
import {
  InvalidTierCountError,
  InvalidTierRangeError,
  PlanHasActiveSubscriptionsError,
  PlanNameAlreadyExistsError,
  PlanNotAvailableError,
  PlanNotFoundError,
  PricingTierNotFoundError,
  TrialPlanNotFoundError,
} from "@/modules/payments/errors";
```

New imports from errors:
```typescript
import {
  InvalidTierCountError,
  InvalidTierRangeError,
  PlanHasActiveSubscriptionsError,
  PlanNameAlreadyExistsError,
  PlanNotAvailableError,
  PlanNotFoundError,
  PricingTierNotFoundError,
  TierGapError,
  TierMinExceedsMaxError,
  TierNegativeMinError,
  TierOverlapError,
  TrialPlanNotFoundError,
} from "@/modules/payments/errors";
```

Old constants import (lines 14-19):
```typescript
import {
  calculateYearlyPrice,
  EMPLOYEE_TIERS,
  EMPLOYEE_TIERS_COUNT,
  TRIAL_TIER,
} from "./plans.constants";
```

New constants import (remove `EMPLOYEE_TIERS` and `EMPLOYEE_TIERS_COUNT` — no longer used here):
```typescript
import { calculateYearlyPrice, TRIAL_TIER } from "./plans.constants";
```

**Step 2: Replace `validatePaidPlanTiers()`**

Replace lines 297-317 with:

```typescript
private static validatePaidPlanTiers(tiers: TierPriceInput[]): void {
  if (tiers.length < 1) {
    throw new InvalidTierCountError(tiers.length, 1);
  }

  const sorted = [...tiers].sort((a, b) => a.minEmployees - b.minEmployees);

  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];

    if (tier.minEmployees < 0) {
      throw new TierNegativeMinError(i, tier.minEmployees);
    }

    if (tier.minEmployees > tier.maxEmployees) {
      throw new TierMinExceedsMaxError(i, tier.minEmployees, tier.maxEmployees);
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      const expectedMin = prev.maxEmployees + 1;

      if (tier.minEmployees < expectedMin) {
        throw new TierOverlapError(i, prev.maxEmployees, tier.minEmployees);
      }

      if (tier.minEmployees > expectedMin) {
        throw new TierGapError(i, expectedMin, tier.minEmployees);
      }
    }
  }

  // First tier must start at 0
  if (sorted[0].minEmployees !== 0) {
    throw new TierGapError(0, 0, sorted[0].minEmployees);
  }
}
```

**Step 3: Verify compilation**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

---

## Task 3: Update Constants and Model

**Files:**
- Modify: `src/modules/payments/plans/plans.constants.ts:14-17`
- Modify: `src/modules/payments/plans/plans.model.ts:55-57`

**Step 1: Clean up constants**

Remove `EMPLOYEE_TIERS_COUNT` and `MAX_EMPLOYEES` (they are no longer used outside the seed, which uses `EMPLOYEE_TIERS.length` directly).

Delete lines 14 and 17:
```typescript
export const EMPLOYEE_TIERS_COUNT = EMPLOYEE_TIERS.length;
// ...
export const MAX_EMPLOYEES = 180;
```

Keep `TRIAL_TIER`, `TRIAL_TIERS_COUNT`, `YEARLY_DISCOUNT`, `DEFAULT_TRIAL_DAYS`, `DEFAULT_TRIAL_EMPLOYEE_LIMIT`.

**Step 2: Update model description**

In `plans.model.ts`, update `pricingTiers` description in `createPlanSchema` (line 55-57):

Old:
```typescript
    .describe(
      "Pricing tiers: 1 tier (0-10) for trial, 10 tiers for paid plans"
    ),
```

New:
```typescript
    .describe(
      "Pricing tiers: 1 tier (0-10) for trial, at least 1 contiguous tier for paid plans"
    ),
```

**Step 3: Verify compilation**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

---

## Task 4: Update Existing Tests

**Files:**
- Modify: `src/modules/payments/plans/__tests__/create-plan.test.ts`

**Step 1: Update test for "should reject invalid tier count for non-trial plan"**

This test (line 172-192) currently expects `INVALID_TIER_COUNT` when sending 1 tier to a non-trial plan. With the new validation, 1 tier is now valid for paid plans. Change this test to verify that 0 tiers (empty array) rejects:

```typescript
test("should reject paid plan with zero tiers", async () => {
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/plans`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: generateUniqueName("zero-tiers"),
        displayName: "Zero Tiers Plan",
        limits: { features: GOLD_FEATURES },
        isTrial: false,
        pricingTiers: [],
      }),
    })
  );
  // Zod min(1) on the schema rejects empty arrays with 422
  expect(response.status).toBe(422);
});
```

**Step 2: Run existing tests to see baseline**

Run: `bun test src/modules/payments/plans/__tests__/create-plan.test.ts`
Expected: All pass (the one we changed now tests a different scenario)

---

## Task 5: Write New Tests for Flexible Tiers

**Files:**
- Modify: `src/modules/payments/plans/__tests__/create-plan.test.ts` (add new test cases)

**Step 1: Add test — plan with 3 custom tiers succeeds**

```typescript
test("should create paid plan with 3 custom tiers", async () => {
  const tierPrices = [
    { minEmployees: 0, maxEmployees: 50, priceMonthly: 9900 },
    { minEmployees: 51, maxEmployees: 100, priceMonthly: 14900 },
    { minEmployees: 101, maxEmployees: 500, priceMonthly: 24900 },
  ];

  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/plans`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: generateUniqueName("custom-3-tiers"),
        displayName: "Custom 3 Tiers Plan",
        limits: { features: GOLD_FEATURES },
        pricingTiers: tierPrices,
      }),
    })
  );
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data.pricingTiers.length).toBe(3);
  expect(body.data.pricingTiers[0].minEmployees).toBe(0);
  expect(body.data.pricingTiers[2].maxEmployees).toBe(500);
});
```

**Step 2: Add test — single tier plan succeeds**

```typescript
test("should create paid plan with a single tier (0-1000)", async () => {
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/plans`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: generateUniqueName("single-tier"),
        displayName: "Single Tier Plan",
        limits: { features: GOLD_FEATURES },
        pricingTiers: [
          { minEmployees: 0, maxEmployees: 1000, priceMonthly: 49900 },
        ],
      }),
    })
  );
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data.pricingTiers.length).toBe(1);
  expect(body.data.pricingTiers[0].maxEmployees).toBe(1000);
});
```

**Step 3: Add test — overlapping tiers rejected**

```typescript
test("should reject tiers with overlapping ranges", async () => {
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/plans`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: generateUniqueName("overlap-tiers"),
        displayName: "Overlap Tiers Plan",
        limits: { features: GOLD_FEATURES },
        pricingTiers: [
          { minEmployees: 0, maxEmployees: 50, priceMonthly: 9900 },
          { minEmployees: 40, maxEmployees: 100, priceMonthly: 14900 },
        ],
      }),
    })
  );
  expect(response.status).toBe(422);

  const errorBody = await response.json();
  expect(errorBody.error.code).toBe("TIER_OVERLAP");
});
```

**Step 4: Add test — gap between tiers rejected**

```typescript
test("should reject tiers with gaps", async () => {
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/plans`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: generateUniqueName("gap-tiers"),
        displayName: "Gap Tiers Plan",
        limits: { features: GOLD_FEATURES },
        pricingTiers: [
          { minEmployees: 0, maxEmployees: 50, priceMonthly: 9900 },
          { minEmployees: 61, maxEmployees: 100, priceMonthly: 14900 },
        ],
      }),
    })
  );
  expect(response.status).toBe(422);

  const errorBody = await response.json();
  expect(errorBody.error.code).toBe("TIER_GAP");
});
```

**Step 5: Add test — min > max rejected**

```typescript
test("should reject tier with minEmployees > maxEmployees", async () => {
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/plans`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: generateUniqueName("min-gt-max"),
        displayName: "Min GT Max Plan",
        limits: { features: GOLD_FEATURES },
        pricingTiers: [
          { minEmployees: 50, maxEmployees: 10, priceMonthly: 9900 },
        ],
      }),
    })
  );
  expect(response.status).toBe(422);

  const errorBody = await response.json();
  expect(errorBody.error.code).toBe("TIER_MIN_EXCEEDS_MAX");
});
```

**Step 6: Add test — negative minEmployees rejected (by Zod schema)**

```typescript
test("should reject tier with negative minEmployees", async () => {
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/plans`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: generateUniqueName("negative-min"),
        displayName: "Negative Min Plan",
        limits: { features: GOLD_FEATURES },
        pricingTiers: [
          { minEmployees: -5, maxEmployees: 10, priceMonthly: 9900 },
        ],
      }),
    })
  );
  expect(response.status).toBe(422);
});
```

**Step 7: Add test — standard 10 tiers still work (backward compatibility)**

```typescript
test("should still accept standard 10 EMPLOYEE_TIERS", async () => {
  const tierPrices = generateTierPrices(4900);

  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/plans`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: generateUniqueName("standard-10"),
        displayName: "Standard 10 Tiers Plan",
        limits: { features: GOLD_FEATURES },
        pricingTiers: tierPrices,
      }),
    })
  );
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data.pricingTiers.length).toBe(10);
});
```

**Step 8: Run all create-plan tests**

Run: `bun test src/modules/payments/plans/__tests__/create-plan.test.ts`
Expected: All pass

---

## Task 6: Update CLAUDE.md Files

**Files:**
- Modify: `src/modules/payments/CLAUDE.md` (line with "Paid: exatamente 10 tiers")
- Modify: `src/modules/payments/plans/CLAUDE.md` (Business Rules section)

**Step 1: Update payments CLAUDE.md**

Change invariant from:
```
- Trial: exatamente 1 tier (0-10). Paid: exatamente 10 tiers
```
to:
```
- Trial: exatamente 1 tier (0-10). Paid: >= 1 tier, contíguos, sem gaps/overlaps, min >= 0, min <= max
```

**Step 2: Update plans CLAUDE.md**

Change Business Rules from:
```
- Paid plans: `isTrial=false`, exatamente 10 tiers matching `EMPLOYEE_TIERS`
```
to:
```
- Paid plans: `isTrial=false`, >= 1 tier contíguo (sem gaps/overlaps, first tier starts at 0)
```

Change Employee Tiers section from:
```
## Employee Tiers (EMPLOYEE_TIERS constant)

- Trial: 0-10 (tier único)
- Paid: 0-10, 11-20, 21-30, 31-40, 41-50, 51-60, 61-70, 71-80, 81-90, 91-180
- Max: 180 employees
- Desconto anual: 20% (`monthlyPrice * 12 * 0.8`)
```
to:
```
## Employee Tiers

- Trial: 0-10 (tier único, regra fixa)
- Paid: qualquer conjunto de tiers contíguos (min >= 0, sem gaps, sem overlaps)
- `EMPLOYEE_TIERS` mantido como template/default para seeds
- Desconto anual: 20% (`monthlyPrice * 12 * 0.8`)
```

---

## Task 7: Run Full Test Suite and Lint

**Step 1: Run all plan tests**

Run: `bun test src/modules/payments/plans/__tests__/`
Expected: All pass

**Step 2: Run limits tests (verify checkEmployeeLimit still works)**

Run: `bun test src/modules/payments/limits/__tests__/`
Expected: All pass (no changes needed)

**Step 3: Run lint**

Run: `npx ultracite check`
Expected: No issues

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: flexibilize employee tiers — replace hardcoded EMPLOYEE_TIERS validation with integrity checks

Closes #25"
```

---

## Task 8: Create PR

```bash
gh pr create --base preview --title "feat: flexibilize employee tiers (remove hardcoded EMPLOYEE_TIERS validation)" --body "$(cat <<'EOF'
## Summary
- Replaced `validatePaidPlanTiers()` rigid validation (exact match against 10 hardcoded tiers) with integrity-based validation
- Paid plans now accept any number of contiguous tiers (>= 1) with: min >= 0, min <= max, no overlaps, no gaps
- Trial validation unchanged (1 tier, 0-10)
- `EMPLOYEE_TIERS` kept as default template for seeds
- `LimitsService.checkEmployeeLimit()` already works with dynamic ranges (no changes needed)

## Validation Rules (paid plans)
1. At least 1 tier
2. `minEmployees >= 0`
3. `minEmployees <= maxEmployees` per tier
4. Tiers contiguous (next min = prev max + 1)
5. No overlaps, no gaps
6. First tier starts at 0

## Test plan
- [x] Plan with 3 custom tiers (0-50, 51-100, 101-500) creates successfully
- [x] Plan with single tier (0-1000) creates successfully
- [x] Overlapping tiers → 422 TIER_OVERLAP
- [x] Gaps between tiers → 422 TIER_GAP
- [x] min > max → 422 TIER_MIN_EXCEEDS_MAX
- [x] Negative min → 422 validation error
- [x] Standard 10 EMPLOYEE_TIERS still accepted (backward compatibility)
- [x] Trial validation unchanged
- [x] Existing seed still works
- [x] Lint passes

Closes #25

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
