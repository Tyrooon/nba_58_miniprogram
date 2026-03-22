/**
 * Admin Service
 * Handles all admin operations
 */

import db from '../db';
import { config } from '../config';

// ==================== User Management ====================

/**
 * Delete a user and all related data
 */
export const deleteUser = async (userId: number): Promise<void> => {
  // Check if user exists and is not admin
  const user = await db.prepare(`SELECT id, is_admin FROM users WHERE id = ?`).get([userId]) as any;
  if (!user) {
    throw new Error('用户不存在');
  }
  if (user.is_admin) {
    throw new Error('不能删除管理员账号');
  }

  // Delete related data first
  await db.prepare(`DELETE FROM selections WHERE user_id = ?`).run([userId]);
  await db.prepare(`DELETE FROM frozen_players WHERE user_id = ?`).run([userId]);
  await db.prepare(`DELETE FROM manager_rosters WHERE user_id = ?`).run([userId]);
  await db.prepare(`DELETE FROM manager_weekly_scores WHERE user_id = ?`).run([userId]);
  await db.prepare(`DELETE FROM manager_drafts WHERE user_id = ?`).run([userId]);
  await db.prepare(`DELETE FROM manager_trade_votes WHERE user_id = ?`).run([userId]);
  await db.prepare(`DELETE FROM manager_reshuffles WHERE user_id = ?`).run([userId]);
  await db.prepare(`DELETE FROM draft_order WHERE user_id = ?`).run([userId]);

  // Delete user
  await db.prepare(`DELETE FROM users WHERE id = ?`).run([userId]);
};

/**
 * Get all users with group info
 */
export const getAllUsersWithGroup = async (): Promise<any[]> => {
  const query = `
    SELECT u.id, u.nickname, u.username, u.total_score, u.total_bonus, u.is_admin, u.group_id, u.created_at,
           g.name as group_name
    FROM users u
    LEFT JOIN groups g ON u.group_id = g.id
    ORDER BY u.id ASC
  `;
  return await db.prepare(query).all([]) as unknown as any[];
};

// ==================== Group Management ====================

/**
 * Get all groups
 */
export const getAllGroups = async (): Promise<any[]> => {
  const query = `
    SELECT g.*, COUNT(u.id) as member_count
    FROM groups g
    LEFT JOIN users u ON g.id = u.group_id
    GROUP BY g.id
    ORDER BY g.id ASC
  `;
  return await db.prepare(query).all([]) as unknown as any[];
};

/**
 * Create a new group
 */
export const createGroup = async (name: string, description?: string): Promise<any> => {
  const existing = await db.prepare(`SELECT id FROM groups WHERE name = ?`).get([name]) as any;
  if (existing) {
    throw new Error('小组名称已存在');
  }

  const result = await db.prepare(
    `INSERT INTO groups (name, description) VALUES (?, ?)`
  ).run([name, description || null]) as any;

  return await db.prepare(`SELECT * FROM groups WHERE id = ?`).get([result.lastID]) as any;
};

/**
 * Update a group
 */
export const updateGroup = async (groupId: number, name?: string, description?: string): Promise<any> => {
  const group = await db.prepare(`SELECT * FROM groups WHERE id = ?`).get([groupId]) as any;
  if (!group) {
    throw new Error('小组不存在');
  }

  const newName = name ?? group.name;
  const newDesc = description ?? group.description;

  // Check if name is taken by another group
  if (name && name !== group.name) {
    const existing = await db.prepare(`SELECT id FROM groups WHERE name = ? AND id != ?`).get([name, groupId]) as any;
    if (existing) {
      throw new Error('小组名称已存在');
    }
  }

  await db.prepare(`UPDATE groups SET name = ?, description = ? WHERE id = ?`).run([newName, newDesc, groupId]);
  return await db.prepare(`SELECT * FROM groups WHERE id = ?`).get([groupId]) as any;
};

/**
 * Delete a group (users will be moved to default group)
 */
export const deleteGroup = async (groupId: number): Promise<void> => {
  if (groupId === 1) {
    throw new Error('不能删除默认小组');
  }

  // Move users to default group
  await db.prepare(`UPDATE users SET group_id = 1 WHERE group_id = ?`).run([groupId]);

  // Delete draft orders for this group
  await db.prepare(`DELETE FROM draft_order WHERE group_id = ?`).run([groupId]);

  // Delete group
  await db.prepare(`DELETE FROM groups WHERE id = ?`).run([groupId]);
};

/**
 * Set user's group
 */
export const setUserGroup = async (userId: number, groupId: number): Promise<any> => {
  const user = await db.prepare(`SELECT id FROM users WHERE id = ?`).get([userId]) as any;
  if (!user) {
    throw new Error('用户不存在');
  }

  const group = await db.prepare(`SELECT id FROM groups WHERE id = ?`).get([groupId]) as any;
  if (!group) {
    throw new Error('小组不存在');
  }

  await db.prepare(`UPDATE users SET group_id = ? WHERE id = ?`).run([groupId, userId]);

  return await db.prepare(`
    SELECT u.id, u.nickname, u.username, u.group_id, g.name as group_name
    FROM users u
    LEFT JOIN groups g ON u.group_id = g.id
    WHERE u.id = ?
  `).get([userId]) as any;
};

// ==================== Draft Order Management ====================

/**
 * Get draft order for a group and season
 */
export const getDraftOrder = async (groupId: number, season: number = config.currentSeason): Promise<any[]> => {
  const query = `
    SELECT do.*, u.nickname, u.username
    FROM draft_order do
    LEFT JOIN users u ON do.user_id = u.id
    WHERE do.group_id = ? AND do.season = ?
    ORDER BY do.order_index ASC
  `;
  return await db.prepare(query).all([groupId, season]) as unknown as any[];
};

/**
 * Set draft order for a group
 */
export const setDraftOrder = async (
  groupId: number,
  season: number,
  orderList: { userId: number; orderIndex: number; round?: number }[]
): Promise<void> => {
  // Delete existing order for this group and season
  await db.prepare(`DELETE FROM draft_order WHERE group_id = ? AND season = ?`).run([groupId, season]);

  // Insert new order
  for (const item of orderList) {
    await db.prepare(
      `INSERT INTO draft_order (group_id, user_id, order_index, round, season) VALUES (?, ?, ?, ?, ?)`
    ).run([groupId, item.userId, item.orderIndex, item.round || 1, season]);
  }
};

/**
 * Update single user's draft position
 */
export const updateUserDraftPosition = async (
  groupId: number,
  userId: number,
  season: number,
  newOrderIndex: number,
  round: number = 1
): Promise<void> => {
  const existing = await db.prepare(
    `SELECT * FROM draft_order WHERE group_id = ? AND user_id = ? AND season = ? AND round = ?`
  ).get([groupId, userId, season, round]) as any;

  if (existing) {
    await db.prepare(
      `UPDATE draft_order SET order_index = ? WHERE id = ?`
    ).run([newOrderIndex, existing.id]);
  } else {
    await db.prepare(
      `INSERT INTO draft_order (group_id, user_id, order_index, round, season) VALUES (?, ?, ?, ?, ?)`
    ).run([groupId, userId, newOrderIndex, round, season]);
  }
};

// ==================== Manager Mode Admin ====================

/**
 * Search players by name
 */
export const searchPlayers = async (keyword: string, limit: number = 20): Promise<any[]> => {
  if (!keyword || keyword.trim().length < 1) {
    return [];
  }

  const searchTerm = `%${keyword.trim()}%`;

  // Get unique players with their latest season_avg
  // Group by player_id and team_id to handle players who changed teams
  const query = `
    SELECT
      dp.player_id,
      dp.player_name,
      dp.team_id,
      MAX(dp.season_avg) as season_avg,
      p.position,
      p.is_rookie,
      COALESCE(
        (SELECT home_team_name FROM games WHERE home_team_id = dp.team_id LIMIT 1),
        (SELECT visitor_team_name FROM games WHERE visitor_team_id = dp.team_id LIMIT 1),
        CAST(dp.team_id AS TEXT)
      ) as team_name
    FROM daily_players dp
    LEFT JOIN players p ON dp.player_id = p.id
    WHERE dp.player_name LIKE ?
    GROUP BY dp.player_id, dp.team_id
    ORDER BY season_avg DESC
    LIMIT ?
  `;

  const results = await db.prepare(query).all([searchTerm, limit]) as unknown as any[];

  return results.map(r => ({
    playerId: r.player_id,
    playerName: r.player_name,
    teamId: r.team_id,
    teamName: r.team_name || String(r.team_id),
    position: r.position,
    seasonAvg: r.season_avg || 0,
    isRookie: r.is_rookie || 0
  }));
};

/**
 * Check if player is already taken in the same group
 */
export const checkPlayerInGroup = async (playerId: string, userId: string): Promise<{ available: boolean; owner?: string }> => {
  // Get user's group
  const user = await db.prepare(`SELECT group_id FROM users WHERE id = ?`).get([userId]) as any;
  if (!user) {
    throw new Error('用户不存在');
  }

  // Find all users in the same group who have this player
  const query = `
    SELECT mr.user_id, u.nickname, u.username
    FROM manager_rosters mr
    JOIN users u ON mr.user_id = u.id
    WHERE mr.player_id = ? AND u.group_id = ? AND mr.user_id != ?
  `;

  const owner = await db.prepare(query).get([playerId, user.group_id, userId]) as any;

  if (owner) {
    return {
      available: false,
      owner: owner.nickname || owner.username || `用户${owner.user_id}`
    };
  }

  return { available: true };
};

/**
 * Admin: Add player to user's roster
 */
export const adminAddPlayerToRoster = async (
  userId: string,
  playerId: string,
  playerType: 'regular' | 'rookie',
  isStarter: boolean = false
): Promise<void> => {
  // Check if player is already in this user's roster
  const existing = await db.prepare(
    `SELECT id FROM manager_rosters WHERE user_id = ? AND player_id = ?`
  ).get([userId, playerId]) as any;

  if (existing) {
    throw new Error('该球员已在用户阵容中');
  }

  // Check if player is already taken by another user in the same group
  const checkResult = await checkPlayerInGroup(playerId, userId);
  if (!checkResult.available) {
    throw new Error(`该球员已被同组的 ${checkResult.owner} 选择`);
  }

  const acquiredAt = new Date().toISOString();

  const query = `
    INSERT INTO manager_rosters (user_id, player_id, player_type, is_starter, acquired_at)
    VALUES (?, ?, ?, ?, ?)
  `;

  await db.prepare(query).run([userId, playerId, playerType, isStarter ? 1 : 0, acquiredAt]);
};

/**
 * Admin: Remove player from user's roster
 */
export const adminRemovePlayerFromRoster = async (userId: string, playerId: string): Promise<void> => {
  const query = `DELETE FROM manager_rosters WHERE user_id = ? AND player_id = ?`;
  await db.prepare(query).run([userId, playerId]);
};

/**
 * Admin: Set starters for a user
 */
export const adminSetStarters = async (userId: string, starterIds: string[]): Promise<void> => {
  // Reset all starters
  await db.prepare(`UPDATE manager_rosters SET is_starter = 0 WHERE user_id = ?`).run([userId]);

  // Set selected players as starters
  if (starterIds.length > 0) {
    const placeholders = starterIds.map(() => '?').join(',');
    const query = `
      UPDATE manager_rosters SET is_starter = 1
      WHERE user_id = ? AND player_id IN (${placeholders})
    `;
    await db.prepare(query).run([userId, ...starterIds]);
  }
};

/**
 * Admin: Get all users' rosters
 */
export const adminGetAllRosters = async (): Promise<any[]> => {
  const query = `
    SELECT mr.*,
      u.nickname as user_nickname,
      u.username,
      dp.player_name,
      dp.team_id,
      COALESCE(
        (SELECT home_team_name FROM games WHERE home_team_id = dp.team_id LIMIT 1),
        (SELECT visitor_team_name FROM games WHERE visitor_team_id = dp.team_id LIMIT 1),
        CAST(dp.team_id AS TEXT)
      ) as team_name,
      dp.season_avg
    FROM manager_rosters mr
    LEFT JOIN users u ON mr.user_id = u.id
    LEFT JOIN daily_players dp ON mr.player_id = dp.player_id
    GROUP BY mr.id
    ORDER BY u.id, mr.is_starter DESC, mr.player_type DESC
  `;
  return await db.prepare(query).all([]) as unknown as any[];
};

/**
 * Admin: Get roster for specific user
 */
export const adminGetUserRoster = async (userId: string): Promise<any[]> => {
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
    GROUP BY mr.id
    ORDER BY mr.is_starter DESC, mr.player_type DESC
  `;
  return await db.prepare(query).all([userId]) as unknown as any[];
};

// ==================== User Score Management ====================

/**
 * Admin: Update user's total score (常规积分)
 */
export const adminUpdateUserScore = async (userId: number, totalScore: number): Promise<void> => {
  const user = await db.prepare(`SELECT id FROM users WHERE id = ?`).get([userId]) as any;
  if (!user) {
    throw new Error('用户不存在');
  }
  await db.prepare(`UPDATE users SET total_score = ? WHERE id = ?`).run([totalScore, userId]);
};

/**
 * Admin: Update user's total bonus (经理模式bonus)
 */
export const adminUpdateUserBonus = async (userId: number, totalBonus: number): Promise<void> => {
  const user = await db.prepare(`SELECT id FROM users WHERE id = ?`).get([userId]) as any;
  if (!user) {
    throw new Error('用户不存在');
  }
  await db.prepare(`UPDATE users SET total_bonus = ? WHERE id = ?`).run([totalBonus, userId]);
};

/**
 * Admin: Get user stats for editing
 */
export const adminGetUserStats = async (userId: number): Promise<any> => {
  const user = await db.prepare(`
    SELECT id, nickname, username, total_score, total_bonus, group_id
    FROM users WHERE id = ?
  `).get([userId]) as any;

  return user;
};

export default {
  deleteUser,
  getAllUsersWithGroup,
  getAllGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  setUserGroup,
  getDraftOrder,
  setDraftOrder,
  updateUserDraftPosition,
  searchPlayers,
  checkPlayerInGroup,
  adminAddPlayerToRoster,
  adminRemovePlayerFromRoster,
  adminSetStarters,
  adminGetAllRosters,
  adminGetUserRoster,
  adminUpdateUserScore,
  adminUpdateUserBonus,
  adminGetUserStats,
};
