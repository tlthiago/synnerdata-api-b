export const isFutureDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

export const isFutureDatetime = (datetimeStr: string): boolean =>
  new Date(datetimeStr) > new Date();
