import { describe, expect, test } from "bun:test";
import {
  type Journal,
  validateJournal,
} from "../lib/migration-journal-validator";

function makeJournal(entries: Journal["entries"]): Journal {
  return {
    version: "7",
    dialect: "postgresql",
    entries,
  };
}

describe("validateJournal", () => {
  test("returns no errors for valid monotonic journal", () => {
    const journal = makeJournal([
      { idx: 0, version: "7", when: 1000, tag: "0000_init" },
      { idx: 1, version: "7", when: 2000, tag: "0001_add_users" },
      { idx: 2, version: "7", when: 3000, tag: "0002_add_orgs" },
    ]);

    expect(validateJournal(journal)).toEqual([]);
  });

  test("returns no errors for empty journal", () => {
    const journal = makeJournal([]);
    expect(validateJournal(journal)).toEqual([]);
  });

  test("flags entry with `when` equal to previous (not strictly greater)", () => {
    const journal = makeJournal([
      { idx: 0, version: "7", when: 1000, tag: "0000_first" },
      { idx: 1, version: "7", when: 1000, tag: "0001_same_when" },
    ]);

    const errors = validateJournal(journal);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("entries[1]");
    expect(errors[0]).toContain("0001_same_when");
    expect(errors[0]).toContain(
      "is not strictly greater than previous entry's 'when'"
    );
  });

  test("flags entry with `when` less than previous (the 0042 bug)", () => {
    const journal = makeJournal([
      { idx: 0, version: "7", when: 5000, tag: "0000_first" },
      { idx: 1, version: "7", when: 3000, tag: "0001_out_of_order" },
    ]);

    const errors = validateJournal(journal);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("0001_out_of_order");
    expect(errors[0]).toContain("3000");
    expect(errors[0]).toContain("5000");
  });

  test("flags duplicate idx values", () => {
    const journal = makeJournal([
      { idx: 0, version: "7", when: 1000, tag: "0000_first" },
      { idx: 1, version: "7", when: 2000, tag: "0001_second" },
      // Set as idx=1 (duplicate). Position is 2 — both checks fire.
      { idx: 1, version: "7", when: 3000, tag: "0002_duplicate_idx" },
    ]);

    const errors = validateJournal(journal);
    const duplicateError = errors.find((e) => e.includes("duplicate idx=1"));
    expect(duplicateError).toBeDefined();
    expect(duplicateError).toContain("0002_duplicate_idx");
  });

  test("flags entry whose idx does not match array position", () => {
    const journal = makeJournal([
      { idx: 0, version: "7", when: 1000, tag: "0000_first" },
      // Array position is 1 but idx is 5 — gap.
      { idx: 5, version: "7", when: 2000, tag: "0001_skipped_idx" },
    ]);

    const errors = validateJournal(journal);
    const positionError = errors.find((e) =>
      e.includes("does not match array position")
    );
    expect(positionError).toBeDefined();
    expect(positionError).toContain("idx=5");
    expect(positionError).toContain("position 1");
  });

  test("collects multiple errors in a single run", () => {
    const journal = makeJournal([
      { idx: 0, version: "7", when: 5000, tag: "0000_first" },
      // Two issues: idx mismatch AND when out of order.
      { idx: 99, version: "7", when: 1000, tag: "0001_broken" },
    ]);

    const errors = validateJournal(journal);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(
      errors.some((e) => e.includes("does not match array position"))
    ).toBe(true);
    expect(errors.some((e) => e.includes("is not strictly greater"))).toBe(
      true
    );
  });

  test("accepts large monotonic gaps in `when` (real-world Date.now() values)", () => {
    const journal = makeJournal([
      { idx: 0, version: "7", when: 1_772_193_358_868, tag: "0000_init" },
      { idx: 1, version: "7", when: 1_777_939_200_000, tag: "0001_later" },
      { idx: 2, version: "7", when: 1_778_025_600_000, tag: "0002_now" },
    ]);

    expect(validateJournal(journal)).toEqual([]);
  });
});
