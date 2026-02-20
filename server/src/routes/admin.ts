import { Router } from 'express';
import { syncDailyData, syncSeasonSchedule } from '../services/gameService';
import { computeDayScores } from '../services/scoringService';
import db from '../db';
import { toDateKey } from '../utils/date';

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
    `).all([dateKey]) as any[];

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

router.post('/sync', async (req, res, next) => {
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

router.post('/sync-schedule', async (req, res, next) => {
  try {
    const summary = await syncSeasonSchedule();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.post('/compute', async (req, res, next) => {
  try {
    const result = await computeDayScores(req.body?.date);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
