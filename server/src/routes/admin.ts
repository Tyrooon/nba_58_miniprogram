import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { syncDailyData, syncSeasonSchedule } from '../services/gameService';
import { computeDayScores } from '../services/scoringService';
import db from '../db';
import { toDateKey } from '../utils/date';
import { requireAdmin } from '../middleware/admin';
import { config, paths } from '../config';
import adminService from '../services/adminService';

const router = Router();

router.get('/daily-scoreboard', async (req, res, next) => {
  try {
    const dateKey = toDateKey(req.query.date as string | undefined);
    const rows = await db.prepare(`
      SELECT
        s.play_mode,
        u.nickname as user_name,
        s.player_name,
        s.player_season_avg as season_avg,
        s.player_actual_score as actual_score,
        s.base_score,
        s.bonus_score,
        s.total_score
      FROM selections s
      JOIN users u ON s.user_id = u.id
      WHERE s.game_date = ?
      ORDER BY s.play_mode ASC, s.total_score DESC
    `).all([dateKey]) as unknown as any[];

    const modes = {
      1: rows.filter(r => r.play_mode === 1),
      2: rows.filter(r => r.play_mode === 2),
      3: rows.filter(r => r.play_mode === 3)
    };

    res.json({ date: dateKey, modes });
  } catch (error) {
    next(error);
  }
});

router.post('/sync', requireAdmin, async (req, res, next) => {
  try {
    // If no date is provided, maybe we should sync the WHOLE schedule?
    // Or user explicitly asks for schedule sync.
    // Let's keep this for daily data sync (players/games for today/specific date).
    const summary = await syncDailyData(req.body?.date);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.post('/sync-schedule', requireAdmin, async (req, res, next) => {
  try {
    const summary = await syncSeasonSchedule();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.post('/compute', requireAdmin, async (req, res, next) => {
  try {
    const result = await computeDayScores(req.body?.date);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ==================== User Management ====================

// Get all users with group info
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const users = await adminService.getAllUsersWithGroup();
    res.json({ success: true, data: users });
  } catch (error: any) {
    next(error);
  }
});

// Delete a user
router.delete('/users/:userId', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    await adminService.deleteUser(userId);
    res.json({ success: true, message: '用户已删除' });
  } catch (error: any) {
    next(error);
  }
});

// ==================== Group Management ====================

// Get all groups
router.get('/groups', requireAdmin, async (req, res, next) => {
  try {
    const groups = await adminService.getAllGroups();
    res.json({ success: true, data: groups });
  } catch (error: any) {
    next(error);
  }
});

// Create a new group
router.post('/groups', requireAdmin, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: '小组名称不能为空' });
    }
    const group = await adminService.createGroup(name.trim(), description);
    res.json({ success: true, data: group });
  } catch (error: any) {
    next(error);
  }
});

// Update a group
router.put('/groups/:groupId', requireAdmin, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const { name, description } = req.body;
    const group = await adminService.updateGroup(groupId, name, description);
    res.json({ success: true, data: group });
  } catch (error: any) {
    next(error);
  }
});

// Delete a group
router.delete('/groups/:groupId', requireAdmin, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    await adminService.deleteGroup(groupId);
    res.json({ success: true, message: '小组已删除，成员已移至默认小组' });
  } catch (error: any) {
    next(error);
  }
});

// Set user's group
router.put('/users/:userId/group', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { groupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId is required' });
    }
    const user = await adminService.setUserGroup(userId, groupId);
    res.json({ success: true, data: user });
  } catch (error: any) {
    next(error);
  }
});

// ==================== Draft Order Management ====================

// Get draft order for a group
router.get('/draft-order', requireAdmin, async (req, res, next) => {
  try {
    const groupId = req.query.groupId ? Number(req.query.groupId) : 1;
    const season = req.query.season ? Number(req.query.season) : config.currentSeason;
    const order = await adminService.getDraftOrder(groupId, season);
    res.json({ success: true, data: order });
  } catch (error: any) {
    next(error);
  }
});

// Set draft order for a group
router.put('/draft-order', requireAdmin, async (req, res, next) => {
  try {
    const { groupId, season, orderList } = req.body;
    if (!groupId || !orderList || !Array.isArray(orderList)) {
      return res.status(400).json({ success: false, error: 'groupId and orderList are required' });
    }
    const finalSeason = season || config.currentSeason;
    await adminService.setDraftOrder(groupId, finalSeason, orderList);
    res.json({ success: true, message: '选秀顺序已更新' });
  } catch (error: any) {
    next(error);
  }
});

// Update single user's draft position
router.put('/draft-order/user', requireAdmin, async (req, res, next) => {
  try {
    const { groupId, userId, season, orderIndex, round } = req.body;
    if (!groupId || !userId || orderIndex === undefined) {
      return res.status(400).json({ success: false, error: 'groupId, userId and orderIndex are required' });
    }
    const finalSeason = season || config.currentSeason;
    const finalRound = round || 1;
    await adminService.updateUserDraftPosition(groupId, userId, finalSeason, orderIndex, finalRound);
    res.json({ success: true, message: '用户选秀位置已更新' });
  } catch (error: any) {
    next(error);
  }
});

// ==================== Manager Mode Admin ====================

// Search players by name
router.get('/players/search', requireAdmin, async (req, res, next) => {
  try {
    const { keyword, limit } = req.query;
    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ success: false, error: 'keyword is required' });
    }
    const players = await adminService.searchPlayers(keyword, limit ? Number(limit) : 20);
    res.json({ success: true, data: players });
  } catch (error: any) {
    next(error);
  }
});

// Check if player is available in group
router.get('/players/check-group', requireAdmin, async (req, res, next) => {
  try {
    const { playerId, userId } = req.query;
    if (!playerId || !userId) {
      return res.status(400).json({ success: false, error: 'playerId and userId are required' });
    }
    const result = await adminService.checkPlayerInGroup(playerId as string, userId as string);
    res.json({ success: true, data: result });
  } catch (error: any) {
    next(error);
  }
});

// Get all users' rosters
router.get('/manager/rosters', requireAdmin, async (req, res, next) => {
  try {
    const rosters = await adminService.adminGetAllRosters();
    res.json({ success: true, data: rosters });
  } catch (error: any) {
    next(error);
  }
});

// Get specific user's roster
router.get('/manager/rosters/:userId', requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const roster = await adminService.adminGetUserRoster(userId);
    res.json({ success: true, data: roster });
  } catch (error: any) {
    next(error);
  }
});

// Add player to user's roster
router.post('/manager/rosters/add', requireAdmin, async (req, res, next) => {
  try {
    const { userId, playerId, playerType, isStarter } = req.body;
    if (!userId || !playerId || !playerType) {
      return res.status(400).json({ success: false, error: 'userId, playerId and playerType are required' });
    }
    if (!['regular', 'rookie'].includes(playerType)) {
      return res.status(400).json({ success: false, error: 'playerType must be regular or rookie' });
    }
    await adminService.adminAddPlayerToRoster(userId, playerId, playerType, isStarter || false);
    res.json({ success: true, message: '球员已添加到阵容' });
  } catch (error: any) {
    next(error);
  }
});

// Remove player from user's roster
router.post('/manager/rosters/remove', requireAdmin, async (req, res, next) => {
  try {
    const { userId, playerId } = req.body;
    if (!userId || !playerId) {
      return res.status(400).json({ success: false, error: 'userId and playerId are required' });
    }
    await adminService.adminRemovePlayerFromRoster(userId, playerId);
    res.json({ success: true, message: '球员已从阵容中移除' });
  } catch (error: any) {
    next(error);
  }
});

// Move player to injury slot
router.post('/manager/rosters/injury-slot/add', requireAdmin, async (req, res, next) => {
  try {
    const { userId, playerId } = req.body;
    if (!userId || !playerId) {
      return res.status(400).json({ success: false, error: 'userId and playerId are required' });
    }
    const managerService = await import('../services/managerService');
    await managerService.moveToInjurySlot(userId, playerId);
    res.json({ success: true, message: '球员已移至伤病席位' });
  } catch (error: any) {
    next(error);
  }
});

// Remove player from injury slot
router.post('/manager/rosters/injury-slot/remove', requireAdmin, async (req, res, next) => {
  try {
    const { userId, playerId } = req.body;
    if (!userId || !playerId) {
      return res.status(400).json({ success: false, error: 'userId and playerId are required' });
    }
    const managerService = await import('../services/managerService');
    await managerService.removeFromInjurySlot(userId, playerId);
    res.json({ success: true, message: '球员已从伤病席位移除' });
  } catch (error: any) {
    next(error);
  }
});

// Set starters for a user
router.post('/manager/starters/set', requireAdmin, async (req, res, next) => {
  try {
    const { userId, starterIds } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    if (!Array.isArray(starterIds)) {
      return res.status(400).json({ success: false, error: 'starterIds must be an array' });
    }
    await adminService.adminSetStarters(userId, starterIds);
    res.json({ success: true, message: '首发阵容已更新' });
  } catch (error: any) {
    next(error);
  }
});

// ==================== User Score Management ====================

// Get user stats (score and bonus)
router.get('/users/:userId/stats', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const stats = await adminService.adminGetUserStats(userId);
    if (!stats) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: stats });
  } catch (error: any) {
    next(error);
  }
});

// Update user's total score
router.put('/users/:userId/score', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { totalScore } = req.body;
    if (typeof totalScore !== 'number') {
      return res.status(400).json({ success: false, error: 'totalScore must be a number' });
    }
    await adminService.adminUpdateUserScore(userId, totalScore);
    res.json({ success: true, message: '用户积分已更新' });
  } catch (error: any) {
    next(error);
  }
});

// Update user's total bonus
router.put('/users/:userId/bonus', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { totalBonus } = req.body;
    if (typeof totalBonus !== 'number') {
      return res.status(400).json({ success: false, error: 'totalBonus must be a number' });
    }
    await adminService.adminUpdateUserBonus(userId, totalBonus);
    res.json({ success: true, message: '用户Bonus已更新' });
  } catch (error: any) {
    next(error);
  }
});

// ==================== Weekly Calculation ====================

// Run weekly score calculation
router.post('/manager/weekly-calculate', requireAdmin, async (req, res, next) => {
  try {
    const managerService = await import('../services/managerService');
    await managerService.runWeeklyCalculation();
    res.json({ success: true, message: '周积分计算完成' });
  } catch (error: any) {
    next(error);
  }
});

// Get weekly scores for a specific week
router.get('/manager/weekly-scores', requireAdmin, async (req, res, next) => {
  try {
    const { weekStart } = req.query;
    const managerService = await import('../services/managerService');
    const scores = await managerService.getWeeklyScores(weekStart as string || managerService.getWeekStart());
    res.json({ success: true, data: scores });
  } catch (error: any) {
    next(error);
  }
});

// ==================== Data Status Check ====================

// Check data status for recent days
router.get('/data-status', requireAdmin, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const results = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];

      // Check games count
      const gamesCount = await db.prepare(`
        SELECT COUNT(*) as count FROM games WHERE game_date = ?
      `).get([dateKey]) as any;

      // Check daily players count
      const playersCount = await db.prepare(`
        SELECT COUNT(*) as count FROM daily_players WHERE game_date = ?
      `).get([dateKey]) as any;

      // Check players with actual scores (played)
      const playedCount = await db.prepare(`
        SELECT COUNT(*) as count FROM daily_players
        WHERE game_date = ? AND stats_status = 'played'
      `).get([dateKey]) as any;

      // Check selections count
      const selectionsCount = await db.prepare(`
        SELECT COUNT(*) as count FROM selections WHERE game_date = ?
      `).get([dateKey]) as any;

      // Check game statuses
      const gameStatuses = await db.prepare(`
        SELECT status, COUNT(*) as count FROM games WHERE game_date = ? GROUP BY status
      `).all([dateKey]) as any[];

      // Check last sync time from sb_fetch_log
      const syncLog = await db.prepare(`
        SELECT fetched_at FROM sb_fetch_log WHERE date_key = ?
      `).get([dateKey]) as any;

      results.push({
        date: dateKey,
        games: gamesCount?.count || 0,
        players: playersCount?.count || 0,
        playersPlayed: playedCount?.count || 0,
        selections: selectionsCount?.count || 0,
        gameStatuses: gameStatuses || [],
        lastSync: syncLog?.fetched_at || null
      });
    }

    res.json({ success: true, data: results });
  } catch (error: any) {
    next(error);
  }
});

// ==================== Settings ====================

// Get all settings
router.get('/settings', requireAdmin, async (req, res, next) => {
  try {
    const settings = await db.prepare(`SELECT key, value FROM settings`).all([]) as unknown as any[];
    const result: Record<string, string> = {};
    (settings || []).forEach(s => {
      result[s.key] = s.value;
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    next(error);
  }
});

// Update a setting
router.put('/settings/:key', requireAdmin, async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    await db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).run([key, value, value]);

    res.json({ success: true, message: '设置已更新' });
  } catch (error: any) {
    next(error);
  }
});

// ==================== Database Export / Import ====================

const dbUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmpDir = path.resolve(paths.data, 'tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      cb(null, tmpDir);
    },
    filename: (_req, file, cb) => {
      cb(null, `import_${Date.now()}.db`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.db') || file.mimetype === 'application/x-sqlite3' || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .db 文件'));
    }
  },
});

// Export database file
router.get('/db/export', requireAdmin, (req, res, next) => {
  try {
    if (!fs.existsSync(paths.dbFile)) {
      return res.status(404).json({ success: false, error: '数据库文件不存在' });
    }
    res.download(paths.dbFile, `nba58_backup_${new Date().toISOString().split('T')[0]}.db`);
  } catch (error: any) {
    next(error);
  }
});

// Import database file
router.post('/db/import', requireAdmin, (req, res, next) => {
  dbUpload.single('dbfile')(req, res, async (err: any) => {
    try {
      if (err && err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, error: '文件大小不能超过 100MB' });
        }
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: '请上传数据库文件' });
      }

      const uploadedFile = req.file.path;
      try {
        // Verify the uploaded file is a valid SQLite database by checking the header
        const headerBuf = Buffer.alloc(16);
        const fd = fs.openSync(uploadedFile, 'r');
        fs.readSync(fd, headerBuf, 0, 16, 0);
        fs.closeSync(fd);
        const sqliteHeader = 'SQLite format 3\u0000';
        if (headerBuf.toString('utf8', 0, 16) !== sqliteHeader) {
          fs.unlinkSync(uploadedFile);
          return res.status(400).json({ success: false, error: '上传的文件不是有效的SQLite数据库' });
        }

        // Copy the uploaded file over the current database
        fs.copyFileSync(uploadedFile, paths.dbFile);

        // Clean up temp file
        fs.unlinkSync(uploadedFile);

        res.json({ success: true, message: '数据库已导入，建议重启服务以确保生效' });
      } catch (dbError: any) {
        // Clean up temp file on error
        if (fs.existsSync(uploadedFile)) {
          fs.unlinkSync(uploadedFile);
        }
        return res.status(400).json({ success: false, error: `导入失败: ${dbError.message}` });
      }
    } catch (outerError: any) {
      next(outerError);
    }
  });
});

export default router;
