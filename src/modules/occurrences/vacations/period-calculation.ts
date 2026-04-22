import { VacationNoRightsError } from "./errors";

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

export type ActiveCycleInput = {
  hireDate: string;
  referenceDate?: Date;
  vacationsInCycles: Array<{
    acquisitionPeriodStart: string;
    daysEntitled: number;
  }>;
};

export type ActiveCycle = VacationPeriods & {
  daysUsed: number;
  daysRemaining: number;
};

const MAX_DAYS_PER_CYCLE = 30;
const SAFETY_BOUND_MONTHS = 24;

export function computeActiveCycle(input: ActiveCycleInput): ActiveCycle {
  const referenceDate = input.referenceDate ?? new Date();
  const referenceIso = referenceDate.toISOString().slice(0, 10);
  const safetyBoundIso = addMonths(referenceIso, SAFETY_BOUND_MONTHS);

  const usageByCycleStart = new Map<string, number>();
  for (const vacation of input.vacationsInCycles) {
    const current = usageByCycleStart.get(vacation.acquisitionPeriodStart) ?? 0;
    usageByCycleStart.set(
      vacation.acquisitionPeriodStart,
      current + vacation.daysEntitled
    );
  }

  let cycleNumber = 1;
  while (cycleNumber < Number.MAX_SAFE_INTEGER) {
    const acquisitionPeriodStart = addMonths(
      input.hireDate,
      (cycleNumber - 1) * 12
    );

    if (acquisitionPeriodStart > safetyBoundIso) {
      break;
    }

    const acquisitionPeriodEnd = addDays(
      addMonths(input.hireDate, cycleNumber * 12),
      -1
    );
    const concessivePeriodStart = addDays(acquisitionPeriodEnd, 1);
    const concessivePeriodEnd = addDays(
      addMonths(concessivePeriodStart, 12),
      -1
    );

    const daysUsed = usageByCycleStart.get(acquisitionPeriodStart) ?? 0;
    const hasDaysAvailable = daysUsed < MAX_DAYS_PER_CYCLE;
    const concessivoStillValid = concessivePeriodEnd >= referenceIso;

    if (hasDaysAvailable && concessivoStillValid) {
      return {
        acquisitionPeriodStart,
        acquisitionPeriodEnd,
        concessivePeriodStart,
        concessivePeriodEnd,
        daysUsed,
        daysRemaining: MAX_DAYS_PER_CYCLE - daysUsed,
      };
    }

    cycleNumber += 1;
  }

  throw new VacationNoRightsError(input.hireDate, referenceIso);
}
