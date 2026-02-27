import db from '../db';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { addDays } from '../utils/date';

interface UpsertUserInput {
  openid?: string;
  code?: string;  // 兼容原有登录方式
  nickname?: string;
  avatarUrl?: string;
}

// 为支持微信小程序自动登录，新增 OPENID 用户表相关函数

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

const generateRandomNickname = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `球迷${randomNum}`;
};

export const registerUser = async (username: string, password: string, nickname?: string) => {
  if (!USERNAME_RE.test(username)) {
    throw new Error('用户ID仅支持3-20位英文字母、数字、下划线');
  }
  if (!password || password.length < 6) {
    throw new Error('密码至少6位');
  }

  const existing = await db.prepare(`SELECT id FROM users WHERE username = ?`).get([username]);
  if (existing) {
    throw new Error('该用户ID已被注册');
  }

  const displayName = nickname?.trim() || username;
  const passwordHash = await bcrypt.hash(password, 10);
  const openid = `web_${username}`;

  const result = await db.prepare(
    `INSERT INTO users (openid, username, password_hash, nickname) VALUES (?, ?, ?, ?)`
  ).run([openid, username, passwordHash, displayName]) as any;

  const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get([result.lastID]) as any;
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    totalScore: user.total_score,
  };
};

export const authLogin = async (username: string, password: string) => {
  if (!username || !password) {
    throw new Error('请输入用户ID和密码');
  }

  const user = await db.prepare(`SELECT * FROM users WHERE username = ?`).get([username]) as any;
  if (!user) {
    throw new Error('用户ID不存在');
  }
  if (!user.password_hash) {
    throw new Error('该用户尚未设置密码，请联系管理员');
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw new Error('密码错误');
  }

  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    totalScore: user.total_score,
  };
};

export const upsertUser = async (payload: UpsertUserInput) => {
  const existing = await db.prepare(`SELECT * FROM users WHERE openid = ?`).get([payload.openid]) as any;
  if (existing) {
    // 如果用户已存在，更新信息（如果提供了新值）
    const newNickname = payload.nickname ?? existing.nickname;
    const newAvatarUrl = payload.avatarUrl ?? existing.avatar_url;
    await db.prepare(`UPDATE users SET nickname = ?, avatar_url = ? WHERE id = ?`).run([
      newNickname,
      newAvatarUrl,
      existing.id,
    ]);
    return { ...existing, nickname: newNickname, avatar_url: newAvatarUrl };
  }

  // 新用户：如果没有提供昵称，生成随机昵称
  const nickname = payload.nickname || generateRandomNickname();

  const result = await db
    .prepare(
      `INSERT INTO users (openid, nickname, avatar_url) VALUES (?, ?, ?)`
    )
    .run([payload.openid, nickname, payload.avatarUrl]) as any;
  return await db.prepare(`SELECT * FROM users WHERE id = ?`).get([result.lastID]);
};

/**
 * 更新用户资料（昵称和头像）
 */
export const updateUserProfile = async (userId: number, nickname?: string, avatarUrl?: string) => {
  const existing = await db.prepare(`SELECT * FROM users WHERE id = ?`).get([userId]) as any;
  if (!existing) {
    throw new Error('用户不存在');
  }

  const newNickname = nickname ?? existing.nickname;
  const newAvatarUrl = avatarUrl ?? existing.avatar_url;

  await db.prepare(`UPDATE users SET nickname = ?, avatar_url = ? WHERE id = ?`).run([
    newNickname,
    newAvatarUrl,
    userId,
  ]);

  return {
    id: existing.id,
    nickname: newNickname,
    avatar_url: newAvatarUrl,
    total_score: existing.total_score,
  };
};

export const getUserById = async (userId: number) => await db.prepare(`SELECT * FROM users WHERE id = ?`).get([userId]);

export const getUserFrozenPlayers = async (userId: number, playMode?: number) => {
  if (playMode) {
    return await db
      .prepare(
        `SELECT * FROM frozen_players WHERE user_id = ? AND play_mode = ? AND expires_at >= date('now') ORDER BY expires_at ASC`
      )
      .all([userId, playMode]);
  }
  return await db
    .prepare(
      `SELECT * FROM frozen_players WHERE user_id = ? AND expires_at >= date('now') ORDER BY expires_at ASC`
    )
    .all([userId]);
};

export const addFrozenPlayer = async (params: { userId: number; playerId: number; playerName: string; playMode: number; selectedDate: string }) => {
  const expires = addDays(params.selectedDate, config.freezeDays);
  await db.prepare(
    `INSERT INTO frozen_players (user_id, player_id, player_name, play_mode, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, play_mode, player_id, expires_at) DO NOTHING`
  ).run([
    params.userId,
    params.playerId,
    params.playerName,
    params.playMode,
    expires,
  ]);
};

export const removeFrozenPlayer = async (params: { userId: number; playerId: number; playMode: number; selectedDate: string }) => {
  const expires = addDays(params.selectedDate, config.freezeDays);
  await db
    .prepare(`DELETE FROM frozen_players WHERE user_id = ? AND player_id = ? AND play_mode = ? AND expires_at = ?`)
    .run([params.userId, params.playerId, params.playMode, expires]);
};

export const purgeExpiredFrozen = async () => {
  try {
    await db.prepare(`DELETE FROM frozen_players WHERE expires_at < date('now')`).run();
    console.log('[purgeExpiredFrozen] Completed successfully');
  } catch (error) {
    console.error('[purgeExpiredFrozen] Error:', error);
    // Don't throw, just log
  }
};

/**
 * 获取排行榜数据
 */
export const getLeaderboard = async (limit: number = 100) => {
  const users = await db.prepare(`
    SELECT id, nickname, avatar_url, total_score
    FROM users
    WHERE total_score > 0
    ORDER BY total_score DESC
    LIMIT ?
  `).all([limit]) as unknown as any[];

  return users.map((user: any, index: number) => ({
    rank: index + 1,
    id: user.id,
    nickname: user.nickname || `球迷${user.id}`,
    avatarUrl: user.avatar_url,
    totalScore: user.total_score || 0,
  }));
};

/**
 * 获取所有用户（包括得分为0的）
 */
export const getAllUsers = async (limit: number = 100) => {
  const users = await db.prepare(`
    SELECT id, nickname, avatar_url, total_score
    FROM users
    ORDER BY total_score DESC, created_at ASC
    LIMIT ?
  `).all([limit]) as unknown as any[];

  return users.map((user: any, index: number) => ({
    rank: index + 1,
    id: user.id,
    nickname: user.nickname || `球迷${user.id}`,
    avatarUrl: user.avatar_url,
    totalScore: user.total_score || 0,
  }));
};
