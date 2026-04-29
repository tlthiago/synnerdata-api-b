/**
 * Pure validation logic for `src/db/migrations/meta/_journal.json`.
 * No IO. Used by `scripts/validate-migration-journal.ts` (CLI shim) and tests.
 *
 * Checks:
 * 1. Each entry's `when` is strictly greater than the previous entry's `when`.
 * 2. Each entry's `idx` matches its position in the array.
 * 3. No duplicate `idx` values.
 */

export type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints?: boolean;
};

export type Journal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

export function validateJournal(input: Journal): string[] {
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
