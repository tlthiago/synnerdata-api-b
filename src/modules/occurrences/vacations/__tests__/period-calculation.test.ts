import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  computePeriodsFromHireDate,
  computePeriodsFromLastAcquisition,
} from "@/modules/occurrences/vacations/period-calculation";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VACATION_NO_RIGHTS_PATTERN = /direito a férias/;

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
  test("throws VacationNoRightsError when referenceDate is before first anniversary", () => {
    expect(() =>
      computePeriodsFromHireDate("2025-01-01", new Date("2025-06-01T00:00:00Z"))
    ).toThrow(VACATION_NO_RIGHTS_PATTERN);
  });

  test("throws when referenceDate equals hireDate exactly (employee just hired)", () => {
    expect(() =>
      computePeriodsFromHireDate("2026-06-10", new Date("2026-06-10T00:00:00Z"))
    ).toThrow(VACATION_NO_RIGHTS_PATTERN);
  });

  test("throws exactly 1 day before first anniversary (boundary)", () => {
    // hire 2026-06-10, referenceDate 2027-06-09 (1 day before anniversary)
    // completed = 0 → throws. Guards against off-by-one regressions
    // where inclusive/exclusive anniversary comparison could shift.
    expect(() =>
      computePeriodsFromHireDate("2026-06-10", new Date("2027-06-09T00:00:00Z"))
    ).toThrow(VACATION_NO_RIGHTS_PATTERN);
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
    // hire 2026-06-10, referenceDate 2027-06-10 (exactly 1 year later)
    // completed = 1 (anniversary was reached), pending cycle index = 0 → 1st cycle
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
    // hire 2026-06-10, referenceDate 2028-07-01
    // completed = 2, pending cycle index = 1 → 2nd aquisitivo, 2nd concessivo
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
    // completed = 5 (anniversaries 2021, 2022, 2023, 2024, 2025 all <= 2026-04-01)
    // pending cycle index = 4 → 5th aquisitivo
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
    // Smoke test that the default param still works; exact values depend on today's date.
    const result = computePeriodsFromHireDate("2020-01-01");
    expect(result.acquisitionPeriodStart).toMatch(ISO_DATE_PATTERN);
    expect(result.acquisitionPeriodEnd).toMatch(ISO_DATE_PATTERN);
  });
});
