import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  computePeriodsFromHireDate,
  computePeriodsFromLastAcquisition,
  resolveNextCycle,
} from "@/modules/occurrences/vacations/period-calculation";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

describe("addDays", () => {
  test("adds days across month boundary", () => {
    expect(addDays("2026-04-18", 1)).toBe("2026-04-19");
  });

  test("adds negative days (subtract)", () => {
    expect(addDays("2027-04-19", -1)).toBe("2027-04-18");
  });

  test("crosses month (Apr 30 + 1 = May 01)", () => {
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
  });

  test("returns YYYY-MM-DD format", () => {
    expect(addDays("2026-04-06", 0)).toMatch(ISO_DATE_PATTERN);
  });
});

describe("addMonths", () => {
  test("adds 12 months (same day next year)", () => {
    expect(addMonths("2026-04-19", 12)).toBe("2027-04-19");
  });

  test("handles year wrap (Dec + 1 month = Jan next year)", () => {
    expect(addMonths("2025-12-15", 1)).toBe("2026-01-15");
  });

  test("adds 24 months (same day 2 years forward)", () => {
    expect(addMonths("2025-04-19", 24)).toBe("2027-04-19");
  });
});

describe("computePeriodsFromLastAcquisition", () => {
  test("Vinicius case: lastEnd 2026-04-18 → next acquisition 2026-04-19 a 2027-04-18, concessive 2027-04-19 a 2028-04-18", () => {
    expect(computePeriodsFromLastAcquisition("2026-04-18")).toEqual({
      acquisitionPeriodStart: "2026-04-19",
      acquisitionPeriodEnd: "2027-04-18",
      concessivePeriodStart: "2027-04-19",
      concessivePeriodEnd: "2028-04-18",
    });
  });

  test("lastEnd 2025-05-31 → acquisition 2025-06-01 a 2026-05-31, concessive 2026-06-01 a 2027-05-31", () => {
    expect(computePeriodsFromLastAcquisition("2025-05-31")).toEqual({
      acquisitionPeriodStart: "2025-06-01",
      acquisitionPeriodEnd: "2026-05-31",
      concessivePeriodStart: "2026-06-01",
      concessivePeriodEnd: "2027-05-31",
    });
  });
});

describe("computePeriodsFromHireDate", () => {
  test("returns cycle 1 (future) when referenceDate is before first anniversary", () => {
    expect(
      computePeriodsFromHireDate("2025-01-01", new Date("2025-06-01T00:00:00Z"))
    ).toEqual({
      acquisitionPeriodStart: "2025-01-01",
      acquisitionPeriodEnd: "2025-12-31",
      concessivePeriodStart: "2026-01-01",
      concessivePeriodEnd: "2026-12-31",
    });
  });

  test("returns cycle 1 when referenceDate equals hireDate", () => {
    expect(
      computePeriodsFromHireDate("2026-06-10", new Date("2026-06-10T00:00:00Z"))
    ).toEqual({
      acquisitionPeriodStart: "2026-06-10",
      acquisitionPeriodEnd: "2027-06-09",
      concessivePeriodStart: "2027-06-10",
      concessivePeriodEnd: "2028-06-09",
    });
  });

  test("returns cycle 1 when exactly 1 day before first anniversary", () => {
    expect(
      computePeriodsFromHireDate("2026-06-10", new Date("2027-06-09T00:00:00Z"))
    ).toEqual({
      acquisitionPeriodStart: "2026-06-10",
      acquisitionPeriodEnd: "2027-06-09",
      concessivePeriodStart: "2027-06-10",
      concessivePeriodEnd: "2028-06-09",
    });
  });

  test("Google AI example: hire 2024-01-01 + referenceDate 2025-07-01 → 1st cycle", () => {
    expect(
      computePeriodsFromHireDate("2024-01-01", new Date("2025-07-01T00:00:00Z"))
    ).toEqual({
      acquisitionPeriodStart: "2024-01-01",
      acquisitionPeriodEnd: "2024-12-31",
      concessivePeriodStart: "2025-01-01",
      concessivePeriodEnd: "2025-12-31",
    });
  });

  test("employee on exact anniversary → 1st completed cycle is the pending one", () => {
    expect(
      computePeriodsFromHireDate("2026-06-10", new Date("2027-06-10T00:00:00Z"))
    ).toEqual({
      acquisitionPeriodStart: "2026-06-10",
      acquisitionPeriodEnd: "2027-06-09",
      concessivePeriodStart: "2027-06-10",
      concessivePeriodEnd: "2028-06-09",
    });
  });

  test("employee with 2 completed anniversaries → 2nd cycle (aquisitivo year 2, concessivo year 3)", () => {
    expect(
      computePeriodsFromHireDate("2026-06-10", new Date("2028-07-01T00:00:00Z"))
    ).toEqual({
      acquisitionPeriodStart: "2027-06-10",
      acquisitionPeriodEnd: "2028-06-09",
      concessivePeriodStart: "2028-06-10",
      concessivePeriodEnd: "2029-06-09",
    });
  });

  test("Raquel homologação case: hire 2020-12-08 + referenceDate 2026-04-01 → 5th cycle", () => {
    expect(
      computePeriodsFromHireDate("2020-12-08", new Date("2026-04-01T00:00:00Z"))
    ).toEqual({
      acquisitionPeriodStart: "2024-12-08",
      acquisitionPeriodEnd: "2025-12-07",
      concessivePeriodStart: "2025-12-08",
      concessivePeriodEnd: "2026-12-07",
    });
  });

  test("defaults referenceDate to today when omitted", () => {
    const result = computePeriodsFromHireDate("2020-01-01");
    expect(result.acquisitionPeriodStart).toMatch(ISO_DATE_PATTERN);
    expect(result.acquisitionPeriodEnd).toMatch(ISO_DATE_PATTERN);
  });
});

describe("resolveNextCycle", () => {
  test("no history → returns cycle 1 from hireDate", () => {
    expect(
      resolveNextCycle({
        hireDate: "2026-01-01",
        vacationsInCycles: [],
      })
    ).toEqual({
      acquisitionPeriodStart: "2026-01-01",
      acquisitionPeriodEnd: "2026-12-31",
      concessivePeriodStart: "2027-01-01",
      concessivePeriodEnd: "2027-12-31",
    });
  });

  test("partial usage in last cycle → same cycle (still has balance)", () => {
    expect(
      resolveNextCycle({
        hireDate: "2023-01-01",
        vacationsInCycles: [
          { acquisitionPeriodStart: "2024-01-01", daysEntitled: 15 },
        ],
      })
    ).toEqual({
      acquisitionPeriodStart: "2024-01-01",
      acquisitionPeriodEnd: "2024-12-31",
      concessivePeriodStart: "2025-01-01",
      concessivePeriodEnd: "2025-12-31",
    });
  });

  test("exactly 30 in last cycle → next cycle (aquisitivo +12m)", () => {
    expect(
      resolveNextCycle({
        hireDate: "2023-01-01",
        vacationsInCycles: [
          { acquisitionPeriodStart: "2024-01-01", daysEntitled: 30 },
        ],
      })
    ).toEqual({
      acquisitionPeriodStart: "2025-01-01",
      acquisitionPeriodEnd: "2025-12-31",
      concessivePeriodStart: "2026-01-01",
      concessivePeriodEnd: "2026-12-31",
    });
  });

  test("multiple registrations summing 30 → next cycle", () => {
    expect(
      resolveNextCycle({
        hireDate: "2023-01-01",
        vacationsInCycles: [
          { acquisitionPeriodStart: "2024-01-01", daysEntitled: 15 },
          { acquisitionPeriodStart: "2024-01-01", daysEntitled: 15 },
        ],
      })
    ).toEqual({
      acquisitionPeriodStart: "2025-01-01",
      acquisitionPeriodEnd: "2025-12-31",
      concessivePeriodStart: "2026-01-01",
      concessivePeriodEnd: "2026-12-31",
    });
  });

  test("Geralda case: 13 contiguous cycles all 30 days → cycle 14", () => {
    const vacationsInCycles = Array.from({ length: 13 }, (_, i) => ({
      acquisitionPeriodStart: addMonths("2011-02-01", i * 12),
      daysEntitled: 30,
    }));
    expect(
      resolveNextCycle({
        hireDate: "2011-02-01",
        vacationsInCycles,
      })
    ).toEqual({
      acquisitionPeriodStart: "2024-02-01",
      acquisitionPeriodEnd: "2025-01-31",
      concessivePeriodStart: "2025-02-01",
      concessivePeriodEnd: "2026-01-31",
    });
  });

  test("gap in history → derives next cycle from LAST registered, not first", () => {
    expect(
      resolveNextCycle({
        hireDate: "2020-01-01",
        vacationsInCycles: [
          { acquisitionPeriodStart: "2020-01-01", daysEntitled: 30 },
          { acquisitionPeriodStart: "2024-01-01", daysEntitled: 30 },
        ],
      })
    ).toEqual({
      acquisitionPeriodStart: "2025-01-01",
      acquisitionPeriodEnd: "2025-12-31",
      concessivePeriodStart: "2026-01-01",
      concessivePeriodEnd: "2026-12-31",
    });
  });
});
