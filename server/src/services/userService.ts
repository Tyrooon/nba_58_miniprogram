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
    is_admin: user.is_admin || 0,
  };
};

export const getUserByOpenid = async (openid: string) =>
  await db.prepare(`SELECT * FROM users WHERE openid = ?`).get([openid]);

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

/**
 * 更新用户手机号
 */
export const updateUserPhone = async (userId: number, phone: string) => {
  const existing = await db.prepare(`SELECT * FROM users WHERE id = ?`).get([userId]) as any;
  if (!existing) {
    throw new Error('用户不存在');
  }

  // 检查手机号是否已被其他用户使用
  const phoneUser = await db.prepare(`SELECT id FROM users WHERE phone = ? AND id != ?`).get([phone, userId]) as any;
  if (phoneUser) {
    throw new Error('该手机号已被其他用户绑定');
  }

  await db.prepare(`UPDATE users SET phone = ? WHERE id = ?`).run([phone, userId]);

  return {
    id: existing.id,
    nickname: existing.nickname,
    avatar_url: existing.avatar_url,
    phone,
    total_score: existing.total_score,
  };
};

/**
 * 关联账号：将小程序账号与网页端账号关联
 * 验证用户名密码后，将网页端账号的 openid 更新为小程序的 openid
 */
export const linkAccount = async (wxUserId: number, username: string, password: string) => {
  const bcrypt = await import('bcryptjs');

  // 1. 获取当前小程序用户
  const wxUser = await db.prepare(`SELECT * FROM users WHERE id = ?`).get([wxUserId]) as any;
  if (!wxUser) {
    throw new Error('当前用户不存在');
  }

  // 2. 查找网页端账号
  const webUser = await db.prepare(`SELECT * FROM users WHERE username = ?`).get([username]) as any;
  if (!webUser) {
    throw new Error('用户名不存在');
  }

  // 3. 验证密码
  if (!webUser.password_hash) {
    throw new Error('该账号未设置密码，无法关联');
  }

  const isValidPassword = await bcrypt.default.compare(password, webUser.password_hash);
  if (!isValidPassword) {
    throw new Error('密码错误');
  }

  // 4. 检查是否已经是同一个账号
  if (wxUser.id === webUser.id) {
    throw new Error('该账号已与当前微信账号关联');
  }

  // 5. 检查网页端账号是否已被其他微信账号关联
  if (webUser.openid && webUser.openid !== wxUser.openid) {
    // 网页端账号已有 openid，需要确认不是其他微信用户
    const otherWxUser = await db.prepare(`SELECT id FROM users WHERE openid = ? AND id != ?`).get([webUser.openid, webUser.id]) as any;
    if (otherWxUser) {
      throw new Error('该账号已被其他微信用户关联');
    }
  }

  // 6. 迁移数据：将小程序用户的数据迁移到网页端账号
  // 迁移选择记录
  await db.prepare(`UPDATE selections SET user_id = ? WHERE user_id = ?`).run([webUser.id, wxUser.id]);

  // 迁移冷冻球员记录
  await db.prepare(`UPDATE frozen_players SET user_id = ? WHERE user_id = ?`).run([webUser.id, wxUser.id]);

  // 7. 更新网页端账号的 openid 为小程序的 openid
  await db.prepare(`UPDATE users SET openid = ? WHERE id = ?`).run([wxUser.openid, webUser.id]);

  // 8. 删除原来的小程序用户记录（数据已迁移）
  await db.prepare(`DELETE FROM users WHERE id = ?`).run([wxUser.id]);

  // 9. 返回关联后的用户信息
  const linkedUser = await db.prepare(`SELECT * FROM users WHERE id = ?`).get([webUser.id]) as any;

  return {
    id: linkedUser.id,
    nickname: linkedUser.nickname,
    avatar_url: linkedUser.avatar_url,
    username: linkedUser.username,
    total_score: linkedUser.total_score,
  };
};

/**
 * 关联账号（新流程）：不创建默认微信用户。
 * - 用 openid 标识当前微信用户
 * - 校验网页端 username/password
 * - 将网页端账号绑定到 openid
 * - 如数据库里已存在同 openid 的“旧微信用户”（历史遗留），会迁移其数据到网页端账号并删除旧记录
 */
export const linkWebAccountToOpenid = async (openid: string, username: string, password: string) => {
  if (!openid) throw new Error('缺少 openid');
  if (!username || !password) throw new Error('请输入用户名和密码');

  // 1) 查找网页端账号
  const webUser = await db.prepare(`SELECT * FROM users WHERE username = ?`).get([username]) as any;
  if (!webUser) throw new Error('用户名不存在');
  if (!webUser.password_hash) throw new Error('该账号未设置密码，无法关联');

  const isValidPassword = await bcrypt.compare(password, webUser.password_hash);
  if (!isValidPassword) throw new Error('密码错误');

  // 2) openid 是否已绑定其他账号？
  const existingWxUser = await db.prepare(`SELECT * FROM users WHERE openid = ?`).get([openid]) as any;
  if (existingWxUser && existingWxUser.id !== webUser.id) {
    // 历史遗留：之前自动创建过微信用户，迁移数据并删除旧微信用户
    await db.prepare(`UPDATE selections SET user_id = ? WHERE user_id = ?`).run([webUser.id, existingWxUser.id]);
    await db.prepare(`UPDATE frozen_players SET user_id = ? WHERE user_id = ?`).run([webUser.id, existingWxUser.id]);
    await db.prepare(`DELETE FROM users WHERE id = ?`).run([existingWxUser.id]);
  }

  // 3) 网页端账号是否已被其他微信 openid 绑定？
  if (webUser.openid && webUser.openid !== openid) {
    const other = await db.prepare(`SELECT id FROM users WHERE openid = ? AND id != ?`).get([webUser.openid, webUser.id]) as any;
    if (other) {
      throw new Error('该账号已被其他微信用户关联');
    }
  }

  // 4) 绑定 openid 到网页端账号
  await db.prepare(`UPDATE users SET openid = ? WHERE id = ?`).run([openid, webUser.id]);
  const linkedUser = await db.prepare(`SELECT * FROM users WHERE id = ?`).get([webUser.id]) as any;

  return {
    id: linkedUser.id,
    nickname: linkedUser.nickname,
    avatar_url: linkedUser.avatar_url,
    username: linkedUser.username,
    total_score: linkedUser.total_score,
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

/**
 * 从微信小程序云函数同步用户信息到本地数据库
 */
export const syncUserFromCloudFunction = async (openid: string, nickname?: string, avatarUrl?: string) => {
  const existing = await db.prepare(`SELECT * FROM users WHERE openid = ?`).get([openid]) as any;

  if (existing) {
    // 用户已存在，更新昵称和头像（如果提供了新值）
    const newNickname = nickname ?? existing.nickname;
    const newAvatarUrl = avatarUrl ?? existing.avatar_url;

    await db.prepare(`UPDATE users SET nickname = ?, avatar_url = ? WHERE id = ?`).run([
      newNickname,
      newAvatarUrl,
      existing.id,
    ]);

    return {
      id: existing.id,
      openid: existing.openid,
      username: existing.username,
      nickname: newNickname,
      avatarUrl: newAvatarUrl,
      totalScore: existing.total_score,
      createdAt: existing.created_at,
    };
  }

  // 新用户：如果没有提供昵称，生成随机昵称
  const finalNickname = nickname || generateRandomNickname();

  const result = await db
    .prepare(
      `INSERT INTO users (openid, nickname, avatar_url) VALUES (?, ?, ?)`
    )
    .run([openid, finalNickname, avatarUrl]) as any;

  const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get([result.lastID]) as any;

  return {
    id: user.id,
    openid: user.openid,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    totalScore: user.total_score,
    createdAt: user.created_at,
  };
};
