#!/usr/bin/env bun

/**
 * CLI shim that loads `src/db/migrations/meta/_journal.json` and runs the pure
 * `validateJournal` function. Pure validation logic + types live in
 * `scripts/lib/migration-journal-validator.ts` (testable without IO).
 *
 * Why this exists: drizzle-orm's migrator captures `lastDbMigration` ONCE before
 * the apply loop. A migration only applies if `entry.when > lastDbMigration.created_at`.
 * If a journal entry has a `when` value smaller than the previously-applied
 * migration's `when`, it is silently skipped on deploy — the log claims success
 * but no DDL ran. This caused production breakage in 0042 (reported 2026-04-29).
 *
 * Exit codes:
 *   0 — all invariants hold
 *   1 — at least one invariant violated
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Journal,
  validateJournal,
} from "./lib/migration-journal-validator";

const JOURNAL_PATH = join(
  import.meta.dir,
  "..",
  "src",
  "db",
  "migrations",
  "meta",
  "_journal.json"
);

const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8")) as Journal;
const errors = validateJournal(journal);

if (errors.length > 0) {
  console.error("✗ Migration journal validation FAILED:\n");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.error(
    `\n${errors.length} issue(s) found. Fix the journal before merging.\n` +
      "See docs/improvements/2026-04-29-termination-scheduled-plan.md for context."
  );
  process.exit(1);
}

console.log(
  `✓ Migration journal valid: ${journal.entries.length} entries, monotonically increasing, no duplicates.`
);
