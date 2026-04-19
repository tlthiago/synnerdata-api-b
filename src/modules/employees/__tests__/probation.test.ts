import { describe, expect, test } from "bun:test";
import { addDays, computeProbationDates } from "@/modules/employees/probation";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

describe("addDays", () => {
  test("adds 44 days across months (Apr → May)", () => {
    expect(addDays("2026-04-06", 44)).toBe("2026-05-20");
  });

  test("adds 44 days across months (Mar → Apr) — matches client-reported case", () => {
    expect(addDays("2026-03-03", 44)).toBe("2026-04-16");
  });

  test("adds 89 days across three months (Mar → May)", () => {
    expect(addDays("2026-03-03", 89)).toBe("2026-05-31");
  });

  test("handles 30-day month boundary (Apr 01 + 44 = May 15)", () => {
    expect(addDays("2026-04-01", 44)).toBe("2026-05-15");
  });

  test("handles leap year (Jan 15 2024 + 44 = Feb 28 2024)", () => {
    expect(addDays("2024-01-15", 44)).toBe("2024-02-28");
  });

  test("handles year boundary (Dec 10 + 44 = Jan 23 next year)", () => {
    expect(addDays("2025-12-10", 44)).toBe("2026-01-23");
  });

  test("returns YYYY-MM-DD format", () => {
    const result = addDays("2026-04-06", 44);
    expect(result).toMatch(ISO_DATE_PATTERN);
  });
});

describe("computeProbationDates", () => {
  test("returns both probation dates using +44/+89 rule", () => {
    expect(computeProbationDates("2026-04-06")).toEqual({
      probation1ExpiryDate: "2026-05-20",
      probation2ExpiryDate: "2026-07-04",
    });
  });

  test("matches client-reported Rosangela case (hire 2026-03-03)", () => {
    expect(computeProbationDates("2026-03-03")).toEqual({
      probation1ExpiryDate: "2026-04-16",
      probation2ExpiryDate: "2026-05-31",
    });
  });
});
