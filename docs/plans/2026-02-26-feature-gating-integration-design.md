# Feature Gating Integration Design

**Date:** 2026-02-26
**Issue:** #17 — Integrar feature gating nos modulos de negocio

## Context

The feature gating infrastructure is fully implemented: `auth-plugin` supports `requireFeature` via `validateFeatureAccess()`, `LimitsService` checks plan features, and `FeatureNotAvailableError` returns HTTP 403. No business module currently uses these guards.

## Approach

Add `requireFeature: "<feature>"` to the `auth` macro on every route in affected controllers. No new code needed — only wiring existing infrastructure.

## Modules to Gate

| Feature | Module Path | Tier | Routes |
|---|---|---|---|
| `absences` | `occurrences/absences` | Gold | 5 (CRUD) |
| `accidents` | `occurrences/accidents` | Gold | 5 (CRUD) |
| `warnings` | `occurrences/warnings` | Gold | 5 (CRUD) |
| `medical_certificates` | `occurrences/medical-certificates` | Gold | 5 (CRUD) |
| `terminated_employees` | `occurrences/terminations` | Gold | 5 (CRUD) |
| `employee_status` | `employees` (PATCH /:id/status) | Gold | 1 |
| `ppe` | `occurrences/ppe-deliveries` | Diamond | 8 (5 CRUD + 3 items) |

**Total:** 39 routes across 7 modules.

## Out of Scope

- `birthdays`, `employee_record`, `payroll` — defined in `PLAN_FEATURES` but no endpoints exist yet
- Core employee CRUD — not a gated feature

## Change Pattern

```typescript
auth: {
  permissions: { resource: ["action"] },
  requireOrganization: true,
  requireFeature: "feature_name",  // only addition per route
}
```

## Error Response

Already implemented via `FeatureNotAvailableError`:

```json
{
  "success": false,
  "error": {
    "code": "FEATURE_NOT_AVAILABLE",
    "message": "Feature 'absences' requires plan Gold"
  }
}
```

## Testing

Existing test suite in `src/lib/__tests__/feature-guard.test.ts` covers the auth-plugin feature gating logic. Run full test suite to verify no regressions.
