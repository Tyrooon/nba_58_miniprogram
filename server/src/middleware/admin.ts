import { Request, Response, NextFunction } from 'express';
import db from '../db';

/**
 * 管理员权限检查中间件
 * 需要从请求中获取 userId（可以来自 query、body 或 session）
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  // 尝试从多个来源获取 userId
  const userId = req.body?.userId || req.query?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized: userId required' });
  }

  try {
    const user = await db.prepare(`SELECT id, is_admin FROM users WHERE id = ?`).get([userId]) as any;

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
