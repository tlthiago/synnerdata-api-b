export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export type VacationPeriods = {
  acquisitionPeriodStart: string;
  acquisitionPeriodEnd: string;
  concessivePeriodStart: string;
  concessivePeriodEnd: string;
};

export function computePeriodsFromLastAcquisition(
  lastEnd: string
): VacationPeriods {
  const acquisitionPeriodStart = addDays(lastEnd, 1);
  const acquisitionPeriodEnd = addDays(
    addMonths(acquisitionPeriodStart, 12),
    -1
  );
  const concessivePeriodStart = addDays(acquisitionPeriodEnd, 1);
  const concessivePeriodEnd = addDays(addMonths(concessivePeriodStart, 12), -1);
  return {
    acquisitionPeriodStart,
    acquisitionPeriodEnd,
    concessivePeriodStart,
    concessivePeriodEnd,
  };
}

export function computePeriodsFromHireDate(
  hireDate: string,
  today: Date = new Date()
): VacationPeriods {
  let completed = 0;
  const test = new Date(`${hireDate}T00:00:00Z`);
  while (test <= today) {
    test.setUTCFullYear(test.getUTCFullYear() + 1);
    if (test <= today) {
      completed += 1;
    }
  }
  const acquisitionPeriodStart = addMonths(hireDate, completed * 12);
  const acquisitionPeriodEnd = addDays(
    addMonths(hireDate, (completed + 1) * 12),
    -1
  );
  const concessivePeriodStart = addDays(acquisitionPeriodEnd, 1);
  const concessivePeriodEnd = addDays(addMonths(concessivePeriodStart, 12), -1);
  return {
    acquisitionPeriodStart,
    acquisitionPeriodEnd,
    concessivePeriodStart,
    concessivePeriodEnd,
  };
}
