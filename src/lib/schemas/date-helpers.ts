/**
 * Returns true when `dateStr` resolves to a date strictly after today.
 * `today` uses server-local timezone midnight (Brazil-centric assumption —
 * all domain dates are stored as YYYY-MM-DD without TZ).
 * Invalid inputs (parse fails) return false.
 */
export const isFutureDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

/**
 * Returns true when `datetimeStr` resolves to a datetime strictly after now.
 * Invalid inputs (parse fails) return false.
 */
export const isFutureDatetime = (datetimeStr: string): boolean => {
  const parsed = new Date(datetimeStr);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed > new Date();
};

/**
 * Inclusive day count between `startDate` and `endDate` (YYYY-MM-DD).
 * Both ends counted — e.g. same day = 1, next day = 2.
 * Uses UTC midnight on both bounds to avoid DST/TZ skew.
 * Throws `RangeError` on invalid input.
 */
export const calculateDaysBetween = (
  startDate: string,
  endDate: string
): number => {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new RangeError(
      `calculateDaysBetween: invalid date input (start="${startDate}", end="${endDate}")`
    );
  }
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
};
