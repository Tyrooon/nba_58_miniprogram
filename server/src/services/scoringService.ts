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

const getStatsForDate = async (dateKey: string): Promise<{
  stats: Record<number, number>;
  didNotPlay: Set<number>;
}> => {
  const rows = await db.prepare(
    `SELECT player_id, stats_points, stats_status FROM daily_players WHERE game_date = ?`
  ).all([dateKey]) as unknown as any[];

  const stats: Record<number, number> = {};
  const didNotPlay = new Set<number>();

  for (const row of rows) {
    if (row.stats_status === 'played' && row.stats_points !== null) {
      stats[row.player_id] = Number(row.stats_points);
    } else if (row.stats_status !== 'played') {
      // Player did not play (scheduled, injured, etc.)
      didNotPlay.add(row.player_id);
    }
  }
  return { stats, didNotPlay };
};

export const computeDayScores = async (targetDate?: string) => {
  const dateKey = toDateKey(targetDate);
  // Await async DB call
  const selections = await getSelectionsByDate(dateKey) as any[];
  const pendingSelections = selections.filter((row: any) => row.player_actual_score === null);

  if (!pendingSelections.length) {
    return { date: dateKey, updated: 0 };
  }

  const { stats, didNotPlay } = await getStatsForDate(dateKey);

  const updates: Array<{ id: number; actual: number; base: number; bonus: number; total: number; userId: number }> = [];
  const modeOneList: Array<{ selectionId: number; base: number }> = [];

  pendingSelections.forEach((selection: any) => {
    let actual: number;
    let isDidNotPlay = false;

    if (stats[selection.player_id] !== undefined) {
      // Player played - use actual stats
      actual = stats[selection.player_id];
    } else if (didNotPlay.has(Number(selection.player_id))) {
      // Player did not play - use default 10 for 58 modes (mode 2 and 3)
      // For regular mode (mode 1), use 0
      if (selection.play_mode === 2 || selection.play_mode === 3) {
        actual = 0; // Will result in base score of 10 after formula
        isDidNotPlay = true;
      } else {
        actual = 0;
        isDidNotPlay = true;
      }
    } else {
      // No data yet, skip
      return;
    }

    // For 58 modes with did not play players, base score is always 10
    let base: number;
    if (isDidNotPlay && (selection.play_mode === 2 || selection.play_mode === 3)) {
      base = 10; // Default 10 points for players who didn't play in 58 modes
    } else {
      base = Number(calcBase(selection.play_mode, actual, selection.player_season_avg).toFixed(2));
    }

    if (selection.play_mode === 1) {
      modeOneList.push({ selectionId: selection.id, base });
    }
    updates.push({
      id: selection.id,
      actual: isDidNotPlay ? -1 : actual, // Use -1 to indicate did not play
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
    `UPDATE users SET total_score = COALESCE(total_score, 0) + ? WHERE id = ?`
  );

  // Run updates sequentially
  for (const u of updates) {
    await updateUserStmt.run([u.total, u.userId]);
  }

  return { date: dateKey, updated: updates.length };
};
