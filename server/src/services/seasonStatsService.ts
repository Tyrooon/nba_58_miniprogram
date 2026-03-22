import dayjs from 'dayjs';
import db from '../db';
import { config } from '../config';
import { nowInChina } from '../utils/date';

const AGGREGATE_DELAY_HOURS = 4;

const getEligibleDates = async () => {
  const rows = await db
    .prepare(
      `SELECT g.game_date, MAX(g.tipoff) as last_tipoff
       FROM games g
       LEFT JOIN season_aggregate_log l ON g.game_date = l.game_date
       WHERE g.season = ? AND l.game_date IS NULL
       GROUP BY g.game_date
       ORDER BY g.game_date ASC`
    )
    .all([config.currentSeason]);

  const now = nowInChina();
  return (rows as unknown as any[])
    .filter((row) => row?.last_tipoff)
    .filter((row) => now.isAfter(dayjs(row.last_tipoff).add(AGGREGATE_DELAY_HOURS, 'hour')));
};

const ensureGamesCompleted = async (dateKey: string) => {
  const row: any = await db
    .prepare(`SELECT COUNT(*) as c FROM games WHERE game_date = ? AND status != 'Final'`)
    .get([dateKey]);
  return row?.c === 0;
};

const insertTotals = db.prepare(`
  INSERT INTO player_season_totals (
    season, player_id, player_name, team_id, team_name,
    games_played, total_points, avg_points, last_game_date, updated_at
  )
  VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, datetime('now'))
  ON CONFLICT(season, player_id) DO UPDATE SET
    games_played = player_season_totals.games_played + 1,
    total_points = player_season_totals.total_points + excluded.total_points,
    avg_points = (player_season_totals.total_points + excluded.total_points) * 1.0 /
                 (player_season_totals.games_played + 1),
    team_id = excluded.team_id,
    team_name = excluded.team_name,
    last_game_date = excluded.last_game_date,
    updated_at = datetime('now')
`);

const insertLog = db.prepare(`
  INSERT INTO season_aggregate_log (game_date, processed_at)
  VALUES (?, datetime('now'))
`);

export const aggregateSeasonStatsForDate = async (dateKey: string) => {
  const gamesCompleted = await ensureGamesCompleted(dateKey);
  if (!gamesCompleted) {
    return { date: dateKey, skipped: 'games_not_final' };
  }

  const players = await db
    .prepare(
      `SELECT player_id, player_name, team_id, team_name, stats_points
       FROM daily_players
       WHERE game_date = ?`
    )
    .all([dateKey]) as unknown as any[];

  if (!players.length) {
    return { date: dateKey, skipped: 'no_players' };
  }

  await db.exec('BEGIN TRANSACTION');
  try {
    for (const player of players) {
      await insertTotals.run([
        config.currentSeason,
        player.player_id,
        player.player_name,
        player.team_id,
        player.team_name,
        Number(player.stats_points ?? 0),
        Number(player.stats_points ?? 0),
        dateKey
      ]);
    }
    await insertLog.run([dateKey]);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }

  return { date: dateKey, processed: players.length };
};

export const processSeasonStats = async () => {
  const eligibleDates = await getEligibleDates();
  for (const row of eligibleDates) {
    try {
      const result = await aggregateSeasonStatsForDate(row.game_date);
      console.info('[season-stats] updated', result);
    } catch (error) {
      console.error('[season-stats] failed', row.game_date, error);
    }
  }
};

export const getSeasonAveragesFromDb = async (season: number) => {
  const rows = await db
    .prepare(
      `SELECT player_id, player_name, team_id, team_name, avg_points
       FROM player_season_totals
       WHERE season = ?`
    )
    .all([season]);

  const map: Record<
    number,
    { avg: number; teamId?: number; teamName?: string; playerName?: string }
  > = {};

  (rows as unknown as any[]).forEach((row) => {
    map[row.player_id] = {
      avg: Number(row.avg_points ?? 0),
      teamId: row.team_id,
      teamName: row.team_name,
      playerName: row.player_name
    };
  });

  return map;
};

