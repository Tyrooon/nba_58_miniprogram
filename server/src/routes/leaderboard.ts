import { Router } from 'express';
import { getDailyLeaderboard, getOverallLeaderboard } from '../services/leaderboardService';

const router = Router();

router.get('/', (req, res) => {
  const scope = (req.query.scope as string) ?? 'overall';
  const limit = Number(req.query.limit ?? 50);
  if (scope === 'daily') {
    const data = getDailyLeaderboard(req.query.date as string | undefined, limit);
    return res.json({ scope: 'daily', data });
  }
  const data = getOverallLeaderboard(limit);
  return res.json({ scope: 'overall', data });
});

export default router;









