/**
 * Flag to gate tests that perform real HTTP calls to external third-party APIs
 * (currently only Pagar.me). DB-level integration tests (`app.handle(Request)` +
 * real Postgres container) are NOT gated by this flag — they run on every CI job.
 *
 * Semantics
 * - `SKIP_INTEGRATION_TESTS=true` → the gated cases are skipped.
 * - `SKIP_INTEGRATION_TESTS` unset or any other value → the gated cases run.
 *
 * Usage in tests
 * ```ts
 * test.skipIf(skipIntegration)("creates a Pagar.me customer", async () => { ... });
 * describe.skipIf(skipIntegration)("Pagar.me integration", () => { ... });
 * ```
 *
 * Why skipped in the default CI flow
 * - Pagar.me API availability is outside this repo's control — flaky runs.
 * - Running against Pagar.me sandbox on every PR pollutes sandbox data.
 * - Running against prod credentials in CI is a no-go.
 *
 * How to run the external-API tests locally
 * - Unset the var (default state on a dev machine) and run the specific test files.
 * - Real Pagar.me credentials must be loaded via `.env` / `.env.test`.
 *
 * Known gap (tracked in docs/improvements checklist as CP-41)
 * - Today these cases ONLY run on developer machines, not in any CI workflow
 *   (including the scheduled full suite — the env var is set at the job level).
 *   A dedicated `workflow_dispatch`/schedule-based workflow with sandbox secrets
 *   is pending.
 */
export const skipIntegration = process.env.SKIP_INTEGRATION_TESTS === "true";
