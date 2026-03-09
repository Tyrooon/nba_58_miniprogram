import { Router } from 'express';
import { syncDailyData, syncSeasonSchedule } from '../services/gameService';
import { computeDayScores } from '../services/scoringService';
import db from '../db';
import { toDateKey } from '../utils/date';
import { requireAdmin } from '../middleware/admin';
import { config } from '../config';
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

export default router;
