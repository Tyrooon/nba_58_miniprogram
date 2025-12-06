import { Router } from 'express';
import { syncDailyData, syncSeasonSchedule } from '../services/gameService';
import { computeDayScores } from '../services/scoringService';

const router = Router();

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
