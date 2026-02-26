/**
 * Manager Mode Service
 * Handles all business logic for Manager Mode feature
 */

import db from '../db';

// Types
export interface ManagerRoster {
  id: number;
  user_id: string;
  player_id: string;
  player_type: 'regular' | 'rookie';
  is_starter: number;
  is_injured: number;
  injured_since: string | null;
  acquired_at: string;
}

export interface ManagerWeeklyScore {
  id: number;
  user_id: string;
  week_start: string;
  total_points: number;
  rank: number | null;
  score: number;
}

export interface ManagerDraft {
  id: number;
  user_id: string;
  player_id: string;
  draft_order: number | null;
  round: number | null;
  draft_type: 'initial' | 'weekly' | 'reshuffle';
}

export interface ManagerTrade {
  id: number;
  from_user_id: string;
  to_user_id: string;
  trade_details: string;
  status: 'pending' | 'approved' | 'rejected';
  votes_for: number;
  votes_against: number;
}

/**
 * Snake draft algorithm
 */
export const snakeDraftOrder = (userIds: string[]): string[] => {
  const order: string[] = [];
  const totalPlayers = userIds.length;

  for (let round = 0; round < 8; round++) {
    // Even rounds: 0, 2, 4, 6 (left to right)
    if (round % 2 === 0) {
      for (let i = 0; i < totalPlayers; i++) {
        order.push(userIds[i]);
      }
    }
    // Odd rounds: 1, 3, 5, 7 (right to left)
    else {
      for (let i = totalPlayers - 1; i >= 0; i--) {
        order.push(userIds[i]);
      }
    }
  }

  return order;
};

/**
 * Get user's manager roster
 */
export const getUserRoster = async (userId: string): Promise<ManagerRoster[]> => {
  const query = `
    SELECT mr.*, p.name as player_name, p.team_id, p.position
    FROM manager_rosters mr
    LEFT JOIN players p ON mr.player_id = p.id
    WHERE mr.user_id = ?
    ORDER BY mr.is_injured, mr.player_type DESC, p.name
  `;

  return (await db.prepare(query).all([userId])) as unknown as ManagerRoster[];
};

/**
 * Get weekly scores for all users
 */
export const getWeeklyScores = async (weekStart: string): Promise<any[]> => {
  const query = `
    SELECT mws.*, u.nickname
    FROM manager_weekly_scores mws
    LEFT JOIN users u ON mws.user_id = u.id
    WHERE mws.week_start = ?
    ORDER BY mws.rank DESC
  `;

  return (await db.prepare(query).all([weekStart])) as unknown as any[];
};

/**
 * Calculate weekly points for a user's starters
 */
export const calculateWeeklyPoints = async (userId: string, weekStart: string): Promise<number> => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const query = `
    SELECT SUM(pgl.points) as total_points
    FROM manager_rosters mr
    LEFT JOIN players p ON mr.player_id = p.id
    LEFT JOIN player_game_log pgl ON p.id = pgl.player_id
    WHERE mr.user_id = ?
      AND mr.is_starter = 1
      AND mr.is_injured = 0
      AND pgl.game_date >= ? AND pgl.game_date <= ?
  `;

  const result = await db.prepare(query).get([userId, weekStart, weekEndStr]) as any;
  return result?.total_points || 0;
};

/**
 * Check if player can be moved to injured list
 * Player must not have played in last 7 days
 */
export const canMoveToInjured = async (playerId: string): Promise<boolean> => {
  const query = `
    SELECT COUNT(*) as games_played
    FROM player_game_log
    WHERE player_id = ?
      AND game_date >= date('now', '-7 days')
      AND game_date <= date('now')
  `;

  const result = await db.prepare(query).get([playerId]) as any;
  return result.games_played === 0;
};

/**
 * Move player to injured list
 */
export const moveToInjured = async (userId: string, playerId: string): Promise<void> => {
  const injuredSince = new Date().toISOString().split('T')[0];

  const query = `
    UPDATE manager_rosters
    SET is_injured = 1, injured_since = ?
    WHERE user_id = ? AND player_id = ?
  `;

  await db.prepare(query).run([injuredSince, userId, playerId]);
};

/**
 * Release player from injured list
 */
export const releaseFromInjured = async (userId: string, playerId: string): Promise<void> => {
  const query = `
    UPDATE manager_rosters
    SET is_injured = 0, injured_since = NULL
    WHERE user_id = ? AND player_id = ?
  `;

  await db.prepare(query).run([userId, playerId]);
};

/**
 * Add player to roster
 */
export const addPlayerToRoster = async (
  userId: string,
  playerId: string,
  playerType: 'regular' | 'rookie'
): Promise<void> => {
  const acquiredAt = new Date().toISOString();

  const query = `
    INSERT INTO manager_rosters (user_id, player_id, player_type, acquired_at)
    VALUES (?, ?, ?, ?)
  `;

  await db.prepare(query).run([userId, playerId, playerType, acquiredAt]);
};

/**
 * Remove player from roster
 */
export const removePlayerFromRoster = async (
  userId: string,
  playerId: string
): Promise<void> => {
  const query = `
    DELETE FROM manager_rosters
    WHERE user_id = ? AND player_id = ?
  `;

  await db.prepare(query).run([userId, playerId]);
};

/**
 * Check roster constraints
 * - Max 8 active players (not in injured list)
 * - At least 2 rookies in active roster
 */
export const checkRosterConstraints = async (userId: string): Promise<{
  valid: boolean;
  errors: string[];
}> => {
  const query = `
    SELECT 
      COUNT(CASE WHEN is_injured = 0 THEN 1 END) as active_count,
      COUNT(CASE WHEN is_injured = 0 AND player_type = 'rookie' THEN 1 END) as active_rookie_count
    FROM manager_rosters
    WHERE user_id = ?
  `;

  const result = await db.prepare(query).get([userId]) as any;
  const errors: string[] = [];

  if (result.active_count > 8) {
    errors.push('Active roster cannot exceed 8 players');
  }

  if (result.active_rookie_count < 2) {
    errors.push('Active roster must have at least 2 rookies');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Set starter status for players
 */
export const setStarters = async (userId: string, starterIds: string[]): Promise<void> => {
  // First, reset all starters
  const resetQuery = 'UPDATE manager_rosters SET is_starter = 0 WHERE user_id = ?';
  await db.prepare(resetQuery).run([userId]);

  // Then set selected players as starters
  if (starterIds.length > 0) {
    const placeholders = starterIds.map(() => '?').join(',');
    const setQuery = `
      UPDATE manager_rosters SET is_starter = 1
      WHERE user_id = ? AND player_id IN (${placeholders})
    `;

    await db.prepare(setQuery).run([userId, ...starterIds]);
  }
};

/**
 * Create trade proposal
 */
export const createTrade = async (
  fromUserId: string,
  toUserId: string,
  tradeDetails: any
): Promise<number> => {
  const query = `
    INSERT INTO manager_trades (from_user_id, to_user_id, trade_details, status)
    VALUES (?, ?, ?, 'pending')
  `;

  const result = await db.prepare(query).run([fromUserId, toUserId, JSON.stringify(tradeDetails)]) as any;
  return result.lastID;
};

/**
 * Vote on trade
 */
export const voteOnTrade = async (tradeId: number, userId: string, vote: boolean): Promise<void> => {
  const query = `
    INSERT INTO manager_trade_votes (trade_id, user_id, vote)
    VALUES (?, ?, ?)
  `;

  try {
    await db.prepare(query).run([tradeId, userId, vote ? 1 : 0]);
  } catch (err: any) {
    // User might have already voted, update instead
    if (err.message.includes('UNIQUE')) {
      const updateQuery = `
        UPDATE manager_trade_votes
        SET vote = ?
        WHERE trade_id = ? AND user_id = ?
      `;
      await db.prepare(updateQuery).run([vote ? 1 : 0, tradeId, userId]);
    } else {
      throw err;
    }
  }
};

/**
 * Get pending trades
 */
export const getPendingTrades = async (): Promise<any[]> => {
  const query = `
    SELECT 
      mt.*,
      u1.nickname as from_user_nickname,
      u2.nickname as to_user_nickname,
      COUNT(mtv.vote) as total_votes,
      SUM(CASE WHEN mtv.vote = 1 THEN 1 ELSE 0 END) as votes_for,
      SUM(CASE WHEN mtv.vote = 0 THEN 1 ELSE 0 END) as votes_against
    FROM manager_trades mt
    LEFT JOIN users u1 ON mt.from_user_id = u1.id
    LEFT JOIN users u2 ON mt.to_user_id = u2.id
    LEFT JOIN manager_trade_votes mtv ON mt.id = mtv.trade_id
    WHERE mt.status = 'pending'
    GROUP BY mt.id
    ORDER BY mt.created_at DESC
  `;

  return (await db.prepare(query).all([])) as unknown as any[];
};

/**
 * Update trade status
 */
export const updateTradeStatus = async (tradeId: number, status: 'approved' | 'rejected'): Promise<void> => {
  const query = 'UPDATE manager_trades SET status = ?, resolved_at = datetime("now") WHERE id = ?';
  await db.prepare(query).run([status, tradeId]);
};

/**
 * Execute reshuffle (keep 2 players, return rest to draft pool)
 */
export const executeReshuffle = async (userId: string, retainedPlayerIds: string[]): Promise<void> => {
  // First, remove all players from roster except retained ones
  const deleteQuery = `
    DELETE FROM manager_rosters
    WHERE user_id = ? AND player_id NOT IN (${retainedPlayerIds.map(() => '?').join(',')})
  `;
  await db.prepare(deleteQuery).run([userId, ...retainedPlayerIds]);

  // Then, record reshuffle
  const insertQuery = `
    INSERT INTO manager_reshuffles (user_id, retained_players)
    VALUES (?, ?)
  `;
  await db.prepare(insertQuery).run([userId, JSON.stringify(retainedPlayerIds)]);
};

export default {
  snakeDraftOrder,
  getUserRoster,
  getWeeklyScores,
  calculateWeeklyPoints,
  canMoveToInjured,
  moveToInjured,
  releaseFromInjured,
  addPlayerToRoster,
  removePlayerFromRoster,
  checkRosterConstraints,
  setStarters,
  createTrade,
  voteOnTrade,
  getPendingTrades,
  updateTradeStatus,
  executeReshuffle,
};
