# Phase 1 Deploy Gate — User Attribution on Domain Resources (PR 1)

Operational runbook for the Phase 1 merge/deploy of migration `0039_audit_fk_references.sql`.
Execution owner: the person merging PR 1. Evidence owner: the same person, captured in the PR
description or a pinned comment.

This gate is mandatory. Skipping any check aborts the deploy and fails Phase 1.

---

## Scope

- Migration: `src/db/migrations/0039_audit_fk_references.sql` — 72 FK constraints added via
  `NOT VALID + VALIDATE CONSTRAINT` across 26 tables.
- Data baseline on production (2026-04-21): 930 populated audit references, 0 orphans.
- Audit script: `.compozy/tasks/audit-user-references/scripts/orphan-audit.sql` — reusable,
  read-only (transaction rolls back).
- Related ADR: `adrs/adr-004.md` — documents the atomic abort behavior if `VALIDATE` fails.

---

## Timeline

| Step | When | Action | Artifact |
|------|------|--------|----------|
| G1 | ≤24h before merging PR 1 | Run orphan audit against production | Output pasted into PR |
| G2 | Immediately before merge | Snapshot 7-day baseline metrics (5xx, p95, DB CPU) | Link or screenshot in PR |
| G3 | Immediately after migration applies | Re-run orphan audit against production | Output pasted into PR |
| G4 | 24h post-deploy | Re-check 5xx, p95, DB CPU; note any deviation | Note in PR |
| G5 | 48h post-deploy | Re-check the same three metrics; close the gate | Final status in PR |

If any of G1, G3, G4, G5 fails, see **Failure Actions** below.

---

## G1 — Pre-deploy orphan audit

Run within 24 hours of merging PR 1. Earlier runs (e.g. the 2026-04-21 baseline) do not count
for G1 because new orphans could have appeared in the interval.

```bash
psql "$PROD_DATABASE_URL" -f .compozy/tasks/audit-user-references/scripts/orphan-audit.sql
```

Expected output:

- `Per-column summary`: each reported row has `orphan_count = 0`.
- `Orphan detail`: `(0 rows)`.
- `Totals`: `total_refs ≥ 930`, `total_orphans = 0`.

Pass: paste the three result sets into the PR description under the section **G1 Pre-deploy
orphan audit**. Include the UTC timestamp of the run.

Fail (`total_orphans > 0`): abort the merge. Do not override. `VALIDATE CONSTRAINT` would fail
during the migration transaction and the deploy would roll back atomically, but catching the
problem here avoids a noisy failed-deploy event. Route to **Failure Actions**.

---

## G2 — Pre-deploy metrics baseline

Capture a 7-day pre-deploy baseline for:

- **5xx error rate** across the API (or at minimum the 26 affected modules' endpoints).
- **p95 request latency** on the same scope.
- **Database CPU utilization** on the primary.

Source: the project's existing observability stack (whichever dashboard already renders these
three metrics — no new alerting is introduced by this PR).

Pass: link or screenshot pasted into PR description under **G2 Baseline metrics (7-day)**, with
the capture timestamp and the rolling-window end.

Fail: if the metrics cannot be captured (dashboard outage, vendor issue), postpone the merge
until they can. Phase 1 success criteria require before/after comparison; merging without a
baseline forfeits that.

---

## G3 — Post-deploy orphan audit

Run immediately after the migration finishes applying (watch the deploy pipeline for Drizzle's
per-statement logs; once the last `VALIDATE CONSTRAINT` logs complete, run this).

```bash
psql "$PROD_DATABASE_URL" -f .compozy/tasks/audit-user-references/scripts/orphan-audit.sql
```

Expected output: identical shape to G1. `total_orphans = 0`.

Pass: paste the three result sets into the PR description under **G3 Post-deploy orphan audit**
with the UTC timestamp.

Fail: anything other than `total_orphans = 0` is an incident. The migration should have aborted
atomically if `VALIDATE` failed, so a non-zero post-deploy count implies either a partial apply
(escalate to DB infra immediately) or a race during the deploy window (exceedingly unlikely).
Route to **Failure Actions**.

---

## G4 — 24-hour metrics check

At +24h from the deploy completing, compare the same three metrics against the G2 baseline.

- 5xx rate deviation from baseline: threshold **≤ +10%**.
- p95 latency deviation from baseline: threshold **≤ +10%**.
- DB CPU deviation from baseline: threshold **≤ +10%**.

Pass: note the observed values and deltas in the PR description under **G4 24h check**.

Fail (any metric exceeds +10% deviation): open an incident ticket, link it from the PR, and
proceed to **Failure Actions**. Phase 2 (cost-centers pilot) cannot start until this clears.

---

## G5 — 48-hour metrics check

At +48h from the deploy, repeat the same comparison. Same thresholds as G4.

Pass: record values + deltas under **G5 48h check — GATE CLEARED**. Phase 2 is unblocked.

Fail: same as G4.

---

## Failure Actions

The migration is designed to fail atomically (ADR-004): if `VALIDATE CONSTRAINT` encounters an
orphan, the entire transaction rolls back and the schema is untouched. So a G1 or G3 orphan
result never causes a partial state by itself — but it does gate the deploy.

On any failure:

1. Halt further Phase 1 merges. Record the failing output in the PR.
2. Decide between the three responses:
   - **Data-clean**: if the orphan(s) can be triaged to a known bug or a hard-deleted test user
     that should not exist in prod, write a targeted data-cleanup migration (separate PR) that
     sets the offending audit columns to NULL. Re-run G1 after the cleanup is deployed; merge
     PR 1 only after G1 is green.
   - **Schema-correct but data-legitimate**: extremely unlikely. If an orphan is a real user
     that was hard-deleted outside the Better Auth flow, open an incident and loop in security
     before any cleanup. Do not merge PR 1 until resolved.
   - **Metrics regression (G4/G5)**: open an incident, do not merge Phase 2, investigate
     root cause. Rollback via a revert migration (`0040_revert_audit_fk.sql` with
     `ALTER TABLE ... DROP CONSTRAINT ...` for each of the 72 constraints) only if the
     regression is traced to FK enforcement and no data-side fix is viable.
3. Document the failure and the chosen response as a new entry in the PR description under
   **Incidents during gate**.

---

## PR 1 description — evidence template

Copy this block into the PR description. Replace placeholders as each gate step clears.

```markdown
## Phase 1 Deploy Gate — evidence

### G1 Pre-deploy orphan audit

- Run at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- Operator: <handle>
- Result: total_refs = <N>, total_orphans = 0 ✅
- Summary (54+ rows, all orphan_count = 0):

  <paste per-column summary here or link to gist>

- Orphan detail: (0 rows) ✅

### G2 Baseline metrics (7-day pre-deploy)

- Captured at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- 7-day window: <start> → <end>
- 5xx rate baseline: <value>
- p95 latency baseline: <value>
- DB CPU baseline: <value>
- Dashboard: <link>

### G3 Post-deploy orphan audit

- Run at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- Result: total_refs = <N>, total_orphans = 0 ✅
- Orphan detail: (0 rows) ✅

### G4 24h check (T+24h from deploy)

- Checked at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- 5xx rate: <value> (Δ <±%> vs baseline) <✅/❌>
- p95 latency: <value> (Δ <±%> vs baseline) <✅/❌>
- DB CPU: <value> (Δ <±%> vs baseline) <✅/❌>
- Threshold: ±10%

### G5 48h check — GATE CLEARED

- Checked at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- 5xx rate: <value> (Δ <±%> vs baseline) <✅/❌>
- p95 latency: <value> (Δ <±%> vs baseline) <✅/❌>
- DB CPU: <value> (Δ <±%> vs baseline) <✅/❌>
- Phase 2 unblocked: <YES/NO>

### Incidents during gate

<List any failure, decision, and resolution, or "None.">
```

---

## References

- PRD: `_prd.md` → "Phased Rollout Plan" → "Phase 1 — Success criteria to proceed to Phase 2"
- TechSpec: `_techspec.md` → "Monitoring and Observability"
- ADR-004: `adrs/adr-004.md` — migration atomic-abort behavior
- Task file: `task_08.md`
