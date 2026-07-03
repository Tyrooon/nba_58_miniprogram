import { addDays, toDateKey } from './utils/date';

export const getStartupSyncDates = (now: Date = new Date()) => {
  const today = toDateKey(now);
  return [addDays(today, -1), today, addDays(today, 1)];
};
