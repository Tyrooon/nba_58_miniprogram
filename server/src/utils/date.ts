import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const CHINA_TZ = 'Asia/Shanghai';
// NBA "Game Date" is usually US Eastern Time.
// If today is Nov 29 in China (afternoon), it is Nov 29 in US (early morning).
// However, NBA games listed as "Nov 28" (US Time) might be playing on Nov 29 (CN Time).
// The user says "2025-11-29 has no games".
// NBA schedule for Nov 29 might not have started or populated yet if it's early morning US time.
// But typically we want to see "Today's Games" in China context.
// If it's 10 AM in China on Nov 29, it is 9 PM on Nov 28 in NY.
// So "Today" in China usually corresponds to "Yesterday" or "Today" in US depending on cutoff.
// For NBA, games starting at 8 PM ET (Nov 28) are 9 AM (Nov 29) in China.
// So if user wants to see games playing "Now" (CN Nov 29), we actually want games with gameDate = "2025-11-28" (US).
// But wait, the User complained "2025-11-29 no games".
// If we fetch "todaysScoreboard", NBA returns based on server time (US).
// If we want specific date, we must be careful.
// Let's allow explicit override or smart default.

export const nowInChina = () => dayjs().tz(CHINA_TZ);

// Modified to align with NBA Day:
// If it's Nov 29 in China, the games playing are technically NBA's Nov 28 games (mostly).
// OR NBA's Nov 29 games starting late.
// Usually, China "Today" = NBA "Game Date" (where Game Date is the US local date of tipoff).
// Example: Game on Nov 28 8PM ET -> Nov 29 9AM CN.
// So to show "Nov 29 CN" games, we actually want games with gameDate = "2025-11-28" (US).
// But wait, the User complained "2025-11-29 no games".
// If we fetch "todaysScoreboard", NBA returns based on server time (US).
// If we want specific date, we must be careful.
// Let's allow explicit override or smart default.

export const toDateKey = (input?: string | Date) => {
  // If input is provided, respect it.
  if (input) return dayjs(input).tz(CHINA_TZ).format('YYYY-MM-DD');
  
  // Default: If it's morning in China (e.g. 00:00 - 16:00), we usually want the games happening "now",
  // which are legally "yesterday's" games in US date.
  // But let's stick to standard logic first: Return CN date string.
  // The mismatch is likely because getDailyGames(date) uses the date to find data, 
  // but NBA CDN endpoint is strictly "todaysScoreboard_00.json" (current US day) 
  // or "scoreboard_YYYY-MM-DD.json".
  
  return dayjs().tz(CHINA_TZ).format('YYYY-MM-DD');
};

// NEW: Convert CN Date to NBA Game Date (usually -1 day)
export const toNBAGameDate = (cnDateStr: string) => {
   // Simple heuristic: NBA Game Date is usually same as CN date? No.
   // 11-29 CN morning = 11-28 US night.
   // So we should look for 11-28.
   return dayjs(cnDateStr).subtract(1, 'day').format('YYYY-MM-DD');
};

// For querying NBA Stats API, it uses normal date
export const toStatsDate = (cnDateStr: string) => {
    // Stats API often accepts MM/DD/YYYY
    return dayjs(cnDateStr).subtract(1, 'day').format('MM/DD/YYYY');
};

export const toChinaDateTime = (input?: string | Date) => dayjs.tz(input, CHINA_TZ);

export const startOfDayUtc = (input?: string | Date) =>
  (input ? dayjs(input) : dayjs()).tz(CHINA_TZ).startOf('day').toDate();

export const addDays = (date: string, days: number) =>
  dayjs(date).add(days, 'day').format('YYYY-MM-DD');

export const diffDays = (from: string, to: string) => dayjs(to).diff(dayjs(from), 'day');
