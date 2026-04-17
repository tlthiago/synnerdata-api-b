export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeProbationDates(hireDate: string): {
  probation1ExpiryDate: string;
  probation2ExpiryDate: string;
} {
  return {
    probation1ExpiryDate: addDays(hireDate, 44),
    probation2ExpiryDate: addDays(hireDate, 89),
  };
}
