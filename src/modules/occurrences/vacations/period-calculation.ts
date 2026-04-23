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
  referenceDate: Date = new Date()
): VacationPeriods {
  let completed = 0;
  const anniversary = new Date(`${hireDate}T00:00:00Z`);
  while (anniversary <= referenceDate) {
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    if (anniversary <= referenceDate) {
      completed += 1;
    }
  }

  const index = Math.max(completed - 1, 0);
  const acquisitionPeriodStart = addMonths(hireDate, index * 12);
  const acquisitionPeriodEnd = addDays(
    addMonths(hireDate, (index + 1) * 12),
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

export type NextCycleInput = {
  hireDate: string;
  vacationsInCycles: Array<{
    acquisitionPeriodStart: string;
    daysEntitled: number;
  }>;
};

function buildCycleFromStart(start: string): VacationPeriods {
  const acquisitionPeriodEnd = addDays(addMonths(start, 12), -1);
  const concessivePeriodStart = addDays(acquisitionPeriodEnd, 1);
  const concessivePeriodEnd = addDays(addMonths(concessivePeriodStart, 12), -1);
  return {
    acquisitionPeriodStart: start,
    acquisitionPeriodEnd,
    concessivePeriodStart,
    concessivePeriodEnd,
  };
}

export function resolveNextCycle(input: NextCycleInput): VacationPeriods {
  const sumDaysByAquisitivo = new Map<string, number>();
  for (const vacation of input.vacationsInCycles) {
    const current =
      sumDaysByAquisitivo.get(vacation.acquisitionPeriodStart) ?? 0;
    sumDaysByAquisitivo.set(
      vacation.acquisitionPeriodStart,
      current + vacation.daysEntitled
    );
  }

  if (sumDaysByAquisitivo.size === 0) {
    return buildCycleFromStart(input.hireDate);
  }

  let lastStart = "";
  for (const key of sumDaysByAquisitivo.keys()) {
    if (key > lastStart) {
      lastStart = key;
    }
  }

  const total = sumDaysByAquisitivo.get(lastStart) ?? 0;
  if (total < 30) {
    return buildCycleFromStart(lastStart);
  }

  return buildCycleFromStart(addMonths(lastStart, 12));
}
