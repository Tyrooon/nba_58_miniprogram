import db from '../db';
import { SelectionPayload } from '../types';
import { nowInChina, toChinaDateTime, toDateKey } from '../utils/date';
import { addFrozenPlayer, getUserById, getUserFrozenPlayers, removeFrozenPlayer } from './userService';

// Async prepae
const getPlayerSnapshotStmt = db.prepare(
  `SELECT * FROM daily_players WHERE game_date = ? AND player_id = ?`
);

const getSelectionStmt = db.prepare(
  `SELECT * FROM selections WHERE user_id = ? AND game_date = ? AND play_mode = ?`
);

const getSelectionsByDateStmt = db.prepare(
  `SELECT * FROM selections WHERE user_id = ? AND game_date = ?`
);

const getFirstGameStmt = db.prepare(
  `SELECT tipoff FROM games WHERE game_date = ? AND tipoff IS NOT NULL ORDER BY datetime(tipoff) ASC LIMIT 1`
);

const getGameStatusesStmt = db.prepare(
  `SELECT status FROM games WHERE game_date = ?`
);

const getUpcomingGameStmt = db.prepare(
  `SELECT game_date, tipoff FROM games WHERE tipoff IS NOT NULL AND datetime(tipoff) >= datetime('now') ORDER BY datetime(tipoff) ASC LIMIT 1`
);

const computeModifyWindow = async (dateKey: string) => {
  const now = nowInChina();
  const firstGame = await getFirstGameStmt.get([dateKey]);
  if (!firstGame || !firstGame.tipoff) {
    return { lockDate: dateKey, deadline: null, canModify: false };
  }

  const firstTipoff = toChinaDateTime(firstGame.tipoff);
  const lockTime = firstTipoff.subtract(1, 'hour');
  if (now.isBefore(lockTime)) {
    return { lockDate: dateKey, deadline: lockTime, canModify: true };
  }

  const statuses = await getGameStatusesStmt.all([dateKey]);
  const hasGames = statuses.length > 0;
  const allFinished = hasGames && statuses.every((row: any) => row.status === 'Final');

  if (now.isBefore(firstTipoff)) {
    return { lockDate: dateKey, deadline: lockTime, canModify: false };
  }

  if (!allFinished) {
    return { lockDate: dateKey, deadline: firstTipoff, canModify: false };
  }

  return { lockDate: dateKey, deadline: firstTipoff, canModify: false };
};

const ensureCanModify = async (dateKey: string) => {
  const window = await computeModifyWindow(dateKey);
  if (!window.canModify) {
    throw new Error('今日比赛已锁定，无法再选择或修改');
  }
  return window;
};

export const createSelection = async (payload: SelectionPayload) => {
  const user = await getUserById(payload.userId);
  if (!user) {
    throw new Error('用户不存在');
  }

  const dateKey = toDateKey(payload.gameDate);
  const frozen = await getUserFrozenPlayers(payload.userId, payload.playMode);
  if (frozen.some((item) => item.player_id === payload.playerId)) {
    throw new Error('该球员仍处于冷冻期');
  }

  const snapshot = await getPlayerSnapshotStmt.get([dateKey, payload.playerId]);
  if (!snapshot) {
    throw new Error('未找到该日期的球员数据，请先同步赛程/球员');
  }

  // Throws if超过锁定时间
  await ensureCanModify(dateKey);

  const existing = await getSelectionStmt.get([payload.userId, dateKey, payload.playMode]);

  try {
    if (existing) {
      await removeFrozenPlayer({
        userId: payload.userId,
        playerId: existing.player_id,
        playMode: payload.playMode,
        selectedDate: dateKey,
      });

      await db
        .prepare(
          `UPDATE selections SET
            player_id = @playerId,
            player_name = @playerName,
            team_id = @teamId,
            team_name = @teamName,
            player_season_avg = @seasonAvg,
            player_actual_score = NULL,
            base_score = NULL,
            bonus_score = 0,
            total_score = NULL,
            created_at = datetime('now')
          WHERE id = @id`
        )
        .run({
          id: existing.id,
          playerId: snapshot.player_id,
          playerName: snapshot.player_name,
          teamId: snapshot.team_id,
          teamName: snapshot.team_name,
          seasonAvg: snapshot.season_avg,
        });

      await addFrozenPlayer({
        userId: payload.userId,
        playerId: snapshot.player_id,
        playerName: snapshot.player_name,
        playMode: payload.playMode,
        selectedDate: dateKey,
      });

      return await db.prepare(`SELECT * FROM selections WHERE id = ?`).get([existing.id]);
    }

    const insert = await db
      .prepare(
        `INSERT INTO selections
        (user_id, game_date, play_mode, player_id, player_name, team_id, team_name, player_season_avg)
        VALUES (@userId, @gameDate, @playMode, @playerId, @playerName, @teamId, @teamName, @seasonAvg)`
      )
      .run({
        userId: payload.userId,
        gameDate: dateKey,
        playMode: payload.playMode,
        playerId: snapshot.player_id,
        playerName: snapshot.player_name,
        teamId: snapshot.team_id,
        teamName: snapshot.team_name,
        seasonAvg: snapshot.season_avg,
      });

    await addFrozenPlayer({
      userId: payload.userId,
      playerId: snapshot.player_id,
      playerName: snapshot.player_name,
      playMode: payload.playMode,
      selectedDate: dateKey,
    });

    return await db.prepare(`SELECT * FROM selections WHERE id = ?`).get([insert.lastInsertRowid]);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      throw new Error('今日该玩法已选择过球员');
    }
    throw err;
  }
};

export const getSelectionHistory = async (userId: number, limit = 30) =>
  await db
    .prepare(
      `SELECT * FROM selections WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT ?`
    )
    .all([userId, limit]);

export const getSelectionsByDate = async (date: string) =>
  await db.prepare(`SELECT * FROM selections WHERE game_date = ?`).all([date]);

export const saveSelectionScores = async (rows: Array<{ id: number; actual: number; base: number; bonus: number; total: number }>) => {
  const updateStmt = db.prepare(
    `UPDATE selections SET player_actual_score = @actual, base_score = @base, bonus_score = @bonus, total_score = @total WHERE id = @id`
  );

  // Simple loop for async execution instead of transaction block for now, or await updates one by one
  for (const row of rows) {
      await updateStmt.run(row);
  }
};

const resolveSelectionDate = async (dateInput?: string) => {
  if (dateInput) return toDateKey(dateInput);
  const upcoming = await getUpcomingGameStmt.get();
  if (upcoming?.game_date) {
    return upcoming.game_date;
  }
  return toDateKey();
};

export const getCurrentSelectionSummary = async (userId: number, dateInput?: string) => {
  const dateKey = await resolveSelectionDate(dateInput);
  const selections = await getSelectionsByDateStmt.all([userId, dateKey]);
  const map: Record<string, any> = {};
  selections.forEach((row: any) => {
    map[String(row.play_mode)] = row;
  });

  const window = await computeModifyWindow(dateKey);
  return {
    date: dateKey,
    lockDate: window.lockDate,
    deadline: window.deadline ? window.deadline.toISOString() : null,
    canModify: window.canModify,
    modes: map,
  };
};
