import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  computePeriodsFromHireDate,
  computePeriodsFromLastAcquisition,
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
  test("today is the hire date exactly → 1st period is [hireDate, hireDate+1y-1d]", () => {
    const today = new Date("2026-06-10T00:00:00Z");
    expect(computePeriodsFromHireDate("2026-06-10", today)).toEqual({
      acquisitionPeriodStart: "2026-06-10",
      acquisitionPeriodEnd: "2027-06-09",
      concessivePeriodStart: "2027-06-10",
      concessivePeriodEnd: "2028-06-09",
    });
  });

  test("employee on anniversary day exactly → 1 year counts as 1 completed period, so 2nd period", () => {
    const today = new Date("2027-06-10T00:00:00Z");
    expect(computePeriodsFromHireDate("2026-06-10", today)).toEqual({
      acquisitionPeriodStart: "2027-06-10",
      acquisitionPeriodEnd: "2028-06-09",
      concessivePeriodStart: "2028-06-10",
      concessivePeriodEnd: "2029-06-09",
    });
  });

  test("employee with 1 completed year and 1 day extra → still 2nd period", () => {
    const today = new Date("2027-06-11T00:00:00Z");
    expect(computePeriodsFromHireDate("2026-06-10", today)).toEqual({
      acquisitionPeriodStart: "2027-06-10",
      acquisitionPeriodEnd: "2028-06-09",
      concessivePeriodStart: "2028-06-10",
      concessivePeriodEnd: "2029-06-09",
    });
  });

  test("employee with 2 completed years", () => {
    const today = new Date("2028-06-11T00:00:00Z");
    expect(computePeriodsFromHireDate("2026-06-10", today)).toEqual({
      acquisitionPeriodStart: "2028-06-10",
      acquisitionPeriodEnd: "2029-06-09",
      concessivePeriodStart: "2029-06-10",
      concessivePeriodEnd: "2030-06-09",
    });
  });
});
