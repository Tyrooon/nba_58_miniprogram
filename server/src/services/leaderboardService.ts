import db from '../db';
import { toDateKey } from '../utils/date';

export const getOverallLeaderboard = (limit = 50) =>
  db
    .prepare(
      `SELECT id as userId, nickname, avatar_url as avatarUrl, total_score as score
       FROM users ORDER BY total_score DESC LIMIT ?`
    )
    .all(limit);

export const getDailyLeaderboard = (targetDate?: string, limit = 50) => {
  const dateKey = toDateKey(targetDate);
  return db
    .prepare(
      `SELECT user_id as userId, users.nickname, users.avatar_url as avatarUrl, SUM(total_score) as score
       FROM selections
       JOIN users ON selections.user_id = users.id
       WHERE selections.game_date = ?
       GROUP BY user_id
       ORDER BY score DESC
       LIMIT ?`
    )
    .all(dateKey, limit);
};









