#!/usr/bin/env bun

/**
 * Validates `src/db/migrations/meta/_journal.json` invariants.
 *
 * Why this exists: drizzle-orm's migrator captures `lastDbMigration` ONCE before
 * the apply loop. A migration only applies if `entry.when > lastDbMigration.created_at`.
 * If a journal entry has a `when` value smaller than the previously-applied
 * migration's `when`, it is silently skipped on deploy — the log claims success
 * but no DDL ran. This caused production breakage in 0042 (reported 2026-04-29).
 *
 * Checks:
 * 1. Each entry's `when` is strictly greater than the previous entry's `when`.
 * 2. Each entry's `idx` matches its position in the array.
 * 3. No duplicate `idx` values.
 *
 * Exit codes:
 *   0 — all invariants hold
 *   1 — at least one invariant violated
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const JOURNAL_PATH = join(
  import.meta.dir,
  "..",
  "src",
  "db",
  "migrations",
  "meta",
  "_journal.json"
);

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints?: boolean;
};

type Journal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

function readJournal(): Journal {
  const raw = readFileSync(JOURNAL_PATH, "utf-8");
  return JSON.parse(raw) as Journal;
}

function validate(input: Journal): string[] {
  const errors: string[] = [];
  const seenIdx = new Set<number>();
  let prevWhen = -1;
  let prevTag = "(none)";

  input.entries.forEach((entry, position) => {
    if (entry.idx !== position) {
      errors.push(
        `entries[${position}]: idx=${entry.idx} does not match array position ${position} (tag=${entry.tag})`
      );
    }

    if (seenIdx.has(entry.idx)) {
      errors.push(
        `entries[${position}]: duplicate idx=${entry.idx} (tag=${entry.tag})`
      );
    }
    seenIdx.add(entry.idx);

    if (entry.when <= prevWhen) {
      errors.push(
        `entries[${position}]: 'when' (${entry.when}) is not strictly greater than previous entry's 'when' (${prevWhen}). ` +
          `tag=${entry.tag} previous_tag=${prevTag}. ` +
          "This causes drizzle-orm to silently skip the migration on deploy. " +
          "Use Date.now() when authoring manual migrations."
      );
    }

    prevWhen = entry.when;
    prevTag = entry.tag;
  });

  return errors;
}

const journal = readJournal();
const errors = validate(journal);

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
