import { Router } from 'express';
import { getDailyLeaderboard, getOverallLeaderboard } from '../services/leaderboardService';
import { MemCache } from '../utils/cache';

const router = Router();
const cache = new MemCache<any>(30_000); // 30s TTL

router.get('/', async (req, res, next) => {
  try {
    const scope = (req.query.scope as string) ?? 'overall';
    const limit = Number(req.query.limit ?? 50);
    const cacheKey = `lb:${scope}:${req.query.date ?? 'all'}:${limit}`;

    const result = await cache.getOrSet(cacheKey, async () => {
      if (scope === 'daily') {
        const data = await getDailyLeaderboard(req.query.date as string | undefined, limit);
        return { scope: 'daily', data };
      }
      const data = await getOverallLeaderboard(limit);
      return { scope: 'overall', data };
    });

    res.set('X-Cache', 'HIT');
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;









