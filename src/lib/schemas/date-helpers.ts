export const isFutureDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

export const isFutureDatetime = (datetimeStr: string): boolean =>
  new Date(datetimeStr) > new Date();

export const calculateDaysBetween = (
  startDate: string,
  endDate: string
): number => {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
};
