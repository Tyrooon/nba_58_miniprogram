import db from '../db';
import { toDateKey } from '../utils/date';
import { getSelectionsByDate, saveSelectionScores } from './selectionService';

const bonusRules = [
  { from: 1, to: 1, bonus: 15 },
  { from: 2, to: 2, bonus: 13 },
  { from: 3, to: 3, bonus: 12 },
  { from: 4, to: 4, bonus: 11 },
  { from: 5, to: 5, bonus: 10 },
  { from: 6, to: 6, bonus: 9 },
  { from: 7, to: 7, bonus: 8 },
  { from: 8, to: 8, bonus: 7 },
  { from: 9, to: 9, bonus: 6 },
  { from: 10, to: 10, bonus: 5 },
  { from: 11, to: 11, bonus: 4 },
  { from: 12, to: 12, bonus: 3 },
  { from: 13, to: 13, bonus: 2 },
  { from: 14, to: 14, bonus: 1 },
  { from: 15, to: 50, bonus: 0 },
];

const calcBase = (mode: number, actual: number, seasonAvg = 0) => {
  switch (mode) {
    case 1:
      return actual;
    case 2:
      return 5.8 * (actual - seasonAvg) + 10;
    case 3:
      return -5.8 * (actual - seasonAvg) + 10;
    default:
      return actual;
  }
};

const assignBonus = (list: Array<{ selectionId: number; base: number }>) => {
  const sorted = [...list].sort((a, b) => b.base - a.base);
  const map = new Map<number, number>();

  sorted.forEach((item, index) => {
    const rank = index + 1;
    const rule = bonusRules.find((r) => rank >= r.from && rank <= r.to);
    map.set(item.selectionId, rule ? rule.bonus : 0);
  });

  return map;
};

const getStatsForDate = async (dateKey: string): Promise<Record<number, number>> => {
  const rows = await db.prepare(
    `SELECT player_id, stats_points FROM daily_players
       WHERE game_date = ? AND stats_status = 'played' AND stats_points IS NOT NULL`
  ).all([dateKey]) as any[];

  const statsMap: Record<number, number> = {};
  for (const row of rows) {
    statsMap[row.player_id] = Number(row.stats_points ?? 0);
  }
  return statsMap;
};

export const computeDayScores = async (targetDate?: string) => {
  const dateKey = toDateKey(targetDate);
  // Await async DB call
  const selections = await getSelectionsByDate(dateKey);
  const pendingSelections = selections.filter((row: any) => row.player_actual_score === null);

  if (!pendingSelections.length) {
    return { date: dateKey, updated: 0 };
  }

  const stats = await getStatsForDate(dateKey);

  const updates: Array<{ id: number; actual: number; base: number; bonus: number; total: number; userId: number }> = [];
  const modeOneList: Array<{ selectionId: number; base: number }> = [];

  pendingSelections.forEach((selection: any) => {
    const actual = stats[selection.player_id];

    if (actual === undefined) return;

    const base = Number(calcBase(selection.play_mode, actual, selection.player_season_avg).toFixed(2));
    if (selection.play_mode === 1) {
      modeOneList.push({ selectionId: selection.id, base });
    }
    updates.push({
      id: selection.id,
      actual,
      base,
      bonus: 0,
      total: base,
      userId: selection.user_id,
    });
  });

  const bonusMap = assignBonus(modeOneList);
  updates.forEach((item) => {
    if (bonusMap.has(item.id)) {
      item.bonus = bonusMap.get(item.id) ?? 0;
      item.total = Number((item.base + item.bonus).toFixed(2));
    }
  });

  await saveSelectionScores(
    updates.map((u) => ({
      id: u.id,
      actual: u.actual,
      base: u.base,
      bonus: u.bonus,
      total: u.total,
    }))
  );

  const updateUserStmt = db.prepare(
    `UPDATE users SET total_score = COALESCE(total_score, 0) + @score WHERE id = @userId`
  );

  // Run updates sequentially
  for (const u of updates) {
    await updateUserStmt.run({ score: u.total, userId: u.userId });
  }

  return { date: dateKey, updated: updates.length };
};
