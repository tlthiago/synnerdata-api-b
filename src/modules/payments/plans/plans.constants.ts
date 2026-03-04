export const EMPLOYEE_TIERS = [
  { min: 0, max: 10 },
  { min: 11, max: 20 },
  { min: 21, max: 30 },
  { min: 31, max: 40 },
  { min: 41, max: 50 },
  { min: 51, max: 60 },
  { min: 61, max: 70 },
  { min: 71, max: 80 },
  { min: 81, max: 90 },
  { min: 91, max: 180 },
] as const;

export const TRIAL_TIER = EMPLOYEE_TIERS[0];
export const TRIAL_TIERS_COUNT = 1;
export const DEFAULT_TRIAL_DAYS = 14;

export function calculateYearlyPrice(
  monthlyPrice: number,
  discountPercent: number
): number {
  const yearlyFullPrice = monthlyPrice * 12;
  const discount = Math.round(yearlyFullPrice * (discountPercent / 100));
  return yearlyFullPrice - discount;
}

export function compareFeatures(
  currentFeatures: string[],
  newFeatures: string[],
  displayNames: Record<string, string>
): { gained: string[]; lost: string[] } {
  const currentSet = new Set(currentFeatures);
  const newSet = new Set(newFeatures);

  const gained: string[] = [];
  const lost: string[] = [];

  for (const feature of newSet) {
    if (!currentSet.has(feature)) {
      gained.push(displayNames[feature] ?? feature);
    }
  }

  for (const feature of currentSet) {
    if (!newSet.has(feature)) {
      lost.push(displayNames[feature] ?? feature);
    }
  }

  return { gained, lost };
}
