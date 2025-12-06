import { Router } from 'express';
import { createSelection, getCurrentSelectionSummary, getSelectionHistory } from '../services/selectionService';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { userId, playerId, playMode, gameDate } = req.body ?? {};
    if (!userId || !playerId || !playMode) {
      return res.status(400).json({ message: 'userId/playerId/playMode必填' });
    }
    const selection = await createSelection({
      userId: Number(userId),
      playerId: Number(playerId),
      playMode: Number(playMode),
      gameDate,
    });
    res.json(selection);
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (req, res) => {
  const userId = Number(req.query.userId);
  const limit = Number(req.query.limit ?? 30);
  if (!userId) {
    return res.status(400).json({ message: 'userId必填' });
  }
  const data = await getSelectionHistory(userId, limit);
  res.json(data);
});

router.get('/current', async (req, res, next) => {
  try {
    const userId = Number(req.query.userId);
    if (!userId) {
      return res.status(400).json({ message: 'userId必填' });
    }
    const summary = await getCurrentSelectionSummary(userId, req.query.date as string | undefined);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
