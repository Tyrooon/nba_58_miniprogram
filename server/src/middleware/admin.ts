import { Request, Response, NextFunction } from 'express';
import db from '../db';

/**
 * 管理员权限检查中间件
 * 支持从以下来源获取管理员 ID（优先级从高到低）：
 * 1. query.adminUserId
 * 2. header x-admin-user-id
 * 3. header x-user-id
 * 4. query.userId
 * 注意：不使用 body 中的 userId，因为那通常是目标用户
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const adminUserId =
    req.query?.adminUserId ||
    req.headers['x-admin-user-id'] ||
    req.headers['x-user-id'] ||
    req.query?.userId;

  if (!adminUserId) {
    return res.status(401).json({ success: false, error: 'Unauthorized: adminUserId required' });
  }

  try {
    const user = await db.prepare(`SELECT id, is_admin FROM users WHERE id = ?`).get([adminUserId]) as any;

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.is_admin) {
      return res.status(403).json({ success: false, error: 'Forbidden: Admin access required' });
    }

    // 将用户信息附加到请求对象
    (req as any).user = user;
    next();
  } catch (error) {
    console.error('[requireAdmin] Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
