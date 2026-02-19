import { Router } from 'express';
import { syncDailyData, refreshTodayScores, getGamesWithPlayers, getGamesByDateRange, getNextGameDayPlayers, getUpcomingGameDates, shouldSync } from '../services/gameService';
import { toDateKey } from '../utils/date';

const router = Router();

router.get('/sync-check', async (_req, res, next) => {
  try {
    const result = await shouldSync();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/today', async (req, res, next) => {
  try {
    const dateKey = toDateKey(req.query.date as string | undefined);
    const games = await getGamesWithPlayers(dateKey);
    res.json({ date: dateKey, games });
  } catch (error) {
    next(error);
  }
});

router.get('/range', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
        return res.status(400).json({ message: 'start and end dates are required' });
    }
    const list = await getGamesByDateRange(String(start), String(end));
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.get('/next-players', async (req, res, next) => {
    try {
        const targetDate = req.query.date as string | undefined;
        const result = await getNextGameDayPlayers(targetDate);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

router.get('/upcoming-dates', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 5;
    const dates = await getUpcomingGameDates(limit);
    res.json(dates);
  } catch (error) {
    next(error);
  }
});

router.post('/sync', async (req, res, next) => {
  try {
    const force = req.query.force === '1' || req.body?.force;
    if (!force && !req.body?.date) {
      const check = await shouldSync();
      if (!check.shouldSync) {
        return res.json({ skipped: true, reason: check.reason });
      }
    }
    const summary = await syncDailyData(req.body?.date);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// 快速刷新当天比赛比分（不更新球员数据）
router.post('/refresh-scores', async (req, res, next) => {
  try {
    const summary = await refreshTodayScores(req.body?.date);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
