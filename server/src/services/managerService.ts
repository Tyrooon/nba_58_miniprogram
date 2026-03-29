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
  is_injury_slot: number;
  acquired_at: string;
}

export interface ManagerWeeklyScore {
  id: number;
  user_id: string;
  week_start: string;
  total_points: number;
  rank: number | null;
  score: number;
  bonus: number;
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
export const getUserRoster = async (userId: string): Promise<any[]> => {
  const query = `
    SELECT mr.*,
      dp.player_name,
      dp.team_id,
      COALESCE(
        (SELECT home_team_name FROM games WHERE home_team_id = dp.team_id LIMIT 1),
        (SELECT visitor_team_name FROM games WHERE visitor_team_id = dp.team_id LIMIT 1),
        CAST(dp.team_id AS TEXT)
      ) as team_name,
      dp.season_avg
    FROM manager_rosters mr
    LEFT JOIN daily_players dp ON mr.player_id = dp.player_id
    WHERE mr.user_id = ?
    GROUP BY mr.player_id
    ORDER BY mr.is_injured, mr.player_type DESC, dp.player_name
  `;

  return (await db.prepare(query).all([userId])) as unknown as any[];
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
 * Player must not have played in last 3 games (is_played = 0)
 */
export const canMoveToInjured = async (playerId: string): Promise<{ eligible: boolean; missedGames: number }> => {
  // Get the player's most recent team
  const playerTeam = await db.prepare(`
    SELECT team_id FROM daily_players
    WHERE player_id = ?
    ORDER BY game_date DESC
    LIMIT 1
  `).get([playerId]) as any;

  if (!playerTeam) {
    return { eligible: false, missedGames: 0 };
  }

  // Get the last 3 game dates for this team (completed games only)
  const recentGames = await db.prepare(`
    SELECT DISTINCT dp.game_date
    FROM daily_players dp
    JOIN games g ON dp.game_date = g.game_date AND (dp.team_id = g.home_team_id OR dp.team_id = g.visitor_team_id)
    WHERE dp.team_id = ? AND dp.game_date <= date('now') AND g.status = 'Final'
    ORDER BY dp.game_date DESC
    LIMIT 3
  `).all([playerTeam.team_id]) as unknown as any[];

  if (recentGames.length < 3) {
    return { eligible: false, missedGames: 0 };
  }

  // Check if player actually played (is_played = 1) in these games
  const gameDates = recentGames.map(g => g.game_date);
  const placeholders = gameDates.map(() => '?').join(',');

  const playerGames = await db.prepare(`
    SELECT game_date
    FROM daily_players
    WHERE player_id = ? AND game_date IN (${placeholders})
    AND is_played = 1
  `).all([playerId, ...gameDates]) as unknown as any[];

  const playedDates = playerGames.map(g => g.game_date);
  const missedCount = gameDates.filter(d => !playedDates.includes(d)).length;

  return {
    eligible: missedCount >= 3,
    missedGames: missedCount
  };
};

/**
 * Move player to injury slot (requires 3 consecutive missed games)
 */
export const moveToInjurySlot = async (userId: string, playerId: string): Promise<void> => {
  // Check if player is eligible for injury slot
  const eligibility = await canMoveToInjured(playerId);
  if (!eligibility.eligible) {
    throw new Error(`该球员不符合伤病席位条件（需要连续3场未出场，当前缺席${eligibility.missedGames}场）`);
  }

  // Check if player is in user's roster
  const rosterEntry = await db.prepare(`
    SELECT * FROM manager_rosters WHERE user_id = ? AND player_id = ?
  `).get([userId, playerId]) as any;

  if (!rosterEntry) {
    throw new Error('该球员不在用户阵容中');
  }

  // Check if user already has a player in injury slot
  const existingInjured = await db.prepare(`
    SELECT * FROM manager_rosters WHERE user_id = ? AND is_injury_slot = 1
  `).get([userId]) as any;

  if (existingInjured) {
    throw new Error('伤病席位已被占用，请先移除当前伤病球员');
  }

  // Move player to injury slot
  const injuredSince = new Date().toISOString().split('T')[0];
  await db.prepare(`
    UPDATE manager_rosters
    SET is_injury_slot = 1, is_injured = 1, injured_since = ?, is_starter = 0
    WHERE user_id = ? AND player_id = ?
  `).run([injuredSince, userId, playerId]);
};

/**
 * Remove player from injury slot
 */
export const removeFromInjurySlot = async (userId: string, playerId: string): Promise<void> => {
  const rosterEntry = await db.prepare(`
    SELECT * FROM manager_rosters WHERE user_id = ? AND player_id = ? AND is_injury_slot = 1
  `).get([userId, playerId]) as any;

  if (!rosterEntry) {
    throw new Error('该球员不在伤病席位中');
  }

  await db.prepare(`
    UPDATE manager_rosters SET is_injury_slot = 0, is_injured = 0, injured_since = NULL
    WHERE user_id = ? AND player_id = ?
  `).run([userId, playerId]);
};

/**
 * Get injury slot info for a user
 */
export const getInjurySlotInfo = async (userId: string): Promise<{ hasInjurySlot: boolean; injuredPlayer?: any }> => {
  const injuredPlayer = await db.prepare(`
    SELECT mr.*,
      dp.player_name,
      dp.team_id,
      COALESCE(
        (SELECT home_team_name FROM games WHERE home_team_id = dp.team_id LIMIT 1),
        (SELECT visitor_team_name FROM games WHERE visitor_team_id = dp.team_id LIMIT 1),
        CAST(dp.team_id AS TEXT)
      ) as team_name
    FROM manager_rosters mr
    LEFT JOIN daily_players dp ON mr.player_id = dp.player_id
    WHERE mr.user_id = ? AND mr.is_injury_slot = 1
    LIMIT 1
  `).get([userId]) as any;

  return {
    hasInjurySlot: !!injuredPlayer,
    injuredPlayer: injuredPlayer || undefined
  };
};

/**
 * Move player to injured list (legacy function, kept for compatibility)
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

// ==================== Weekly Scores & Bonuses ====================

/**
 * Get the start of current week (Sunday)
 */
export const getWeekStart = (date?: Date): string => {
  const d = date || new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
};

/**
 * Calculate weekly scores for all users
 * Week is from Sunday to Saturday
 */
export const calculateWeeklyScores = async (weekStart?: string): Promise<void> => {
  const weekStartStr = weekStart || getWeekStart();

  // Calculate week end (Saturday)
  const weekEnd = new Date(weekStartStr);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  console.log(`[ManagerService] Calculating weekly scores for ${weekStartStr} to ${weekEndStr}`);

  // Get all users with their groups
  const users = await db.prepare(`
    SELECT id, group_id FROM users WHERE group_id IS NOT NULL
  `).all([]) as unknown as any[];

  // Group users by group_id
  const usersByGroup = new Map<number, any[]>();
  for (const user of users) {
    if (!usersByGroup.has(user.group_id)) {
      usersByGroup.set(user.group_id, []);
    }
    usersByGroup.get(user.group_id)!.push(user);
  }

  // Calculate scores for each group
  for (const [groupId, groupUsers] of usersByGroup) {
    const userScores: { userId: string; totalPoints: number }[] = [];

    for (const user of groupUsers) {
      // Get all starter players' actual scores for this week from player_game_log
      const scores = await db.prepare(`
        SELECT SUM(pgl.points) as total_points
        FROM player_game_log pgl
        JOIN manager_rosters mr ON pgl.player_sb_id = mr.player_id
        WHERE mr.user_id = ?
          AND mr.is_starter = 1
          AND mr.is_injury_slot = 0
          AND pgl.game_date >= ?
          AND pgl.game_date <= ?
      `).get([user.id, weekStartStr, weekEndStr]) as any;

      const totalPoints = scores?.total_points || 0;
      userScores.push({ userId: String(user.id), totalPoints });
    }

    // Sort by total points descending
    userScores.sort((a, b) => b.totalPoints - a.totalPoints);

    // Assign ranks and save to database
    for (let i = 0; i < userScores.length; i++) {
      const rank = i + 1;
      const { userId, totalPoints } = userScores[i];

      // Insert or update weekly score
      await db.prepare(`
        INSERT INTO manager_weekly_scores (user_id, week_start, total_points, rank)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, week_start) DO UPDATE SET
          total_points = excluded.total_points,
          rank = excluded.rank
      `).run([userId, weekStartStr, totalPoints, rank]);
    }
  }

  console.log(`[ManagerService] Weekly scores calculated for ${users.length} users`);
};

/**
 * Distribute weekly bonuses based on rankings
 * N users in group: 1st gets N+1, 2nd gets N-1, 3rd gets N-2, etc.
 */
export const distributeWeeklyBonuses = async (weekStart?: string): Promise<void> => {
  const weekStartStr = weekStart || getWeekStart();

  console.log(`[ManagerService] Distributing weekly bonuses for week ${weekStartStr}`);

  // Get all groups
  const groups = await db.prepare(`SELECT id FROM groups`).all([]) as unknown as any[];

  for (const group of groups) {
    // Get weekly scores for this group, sorted by rank
    const scores = await db.prepare(`
      SELECT mws.user_id, mws.rank, mws.total_points, u.group_id
      FROM manager_weekly_scores mws
      JOIN users u ON mws.user_id = u.id
      WHERE mws.week_start = ? AND u.group_id = ?
      ORDER BY mws.rank ASC
    `).all([weekStartStr, group.id]) as unknown as any[];

    const N = scores.length;

    for (const score of scores) {
      let bonus: number;

      if (score.rank === 1) {
        bonus = N + 1;
      } else {
        bonus = N - score.rank + 1;
      }

      // Update user's total_bonus
      await db.prepare(`
        UPDATE users SET total_bonus = COALESCE(total_bonus, 0) + ? WHERE id = ?
      `).run([bonus, score.user_id]);

      // Update weekly score with bonus
      await db.prepare(`
        UPDATE manager_weekly_scores SET bonus = ? WHERE user_id = ? AND week_start = ?
      `).run([bonus, score.user_id, weekStartStr]);
    }

    console.log(`[ManagerService] Group ${group.id}: distributed bonuses to ${N} users`);
  }
};

/**
 * Run weekly calculation (scores + bonuses)
 */
export const runWeeklyCalculation = async (): Promise<void> => {
  const weekStart = getWeekStart();
  await calculateWeeklyScores(weekStart);
  await distributeWeeklyBonuses(weekStart);
};

// ==================== Admin Functions ====================

/**
 * Admin: Update user's total score
 */
export const adminUpdateUserScore = async (userId: string, totalScore: number): Promise<void> => {
  await db.prepare(`UPDATE users SET total_score = ? WHERE id = ?`).run([totalScore, userId]);
};

/**
 * Admin: Update user's total bonus
 */
export const adminUpdateUserBonus = async (userId: string, totalBonus: number): Promise<void> => {
  await db.prepare(`UPDATE users SET total_bonus = ? WHERE id = ?`).run([totalBonus, userId]);
};

/**
 * Admin: Get user stats for admin panel
 */
export const adminGetUserStats = async (userId: string): Promise<any> => {
  const user = await db.prepare(`
    SELECT id, nickname, username, total_score, total_bonus, group_id
    FROM users WHERE id = ?
  `).get([userId]) as any;

  return user;
};

export default {
  snakeDraftOrder,
  getUserRoster,
  getWeeklyScores,
  calculateWeeklyPoints,
  canMoveToInjured,
  moveToInjured,
  releaseFromInjured,
  moveToInjurySlot,
  removeFromInjurySlot,
  getInjurySlotInfo,
  addPlayerToRoster,
  removePlayerFromRoster,
  checkRosterConstraints,
  setStarters,
  createTrade,
  voteOnTrade,
  getPendingTrades,
  updateTradeStatus,
  executeReshuffle,
  getWeekStart,
  calculateWeeklyScores,
  distributeWeeklyBonuses,
  runWeeklyCalculation,
  adminUpdateUserScore,
  adminUpdateUserBonus,
  adminGetUserStats,
};
