import { Router } from 'express';
import { createSelection, deleteSelection, getCurrentSelectionSummary, getSelectionHistory, getUserSelectionsForView } from '../services/selectionService';

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
      playMode: Number(playMode) as 1 | 2 | 3,
      gameDate,
    });
    res.json(selection);
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId || req.query.userId);
    const playMode = Number(req.body?.playMode || req.query.playMode);
    const gameDate = (req.body?.gameDate || req.query.gameDate) as string | undefined;
    if (!userId || !playMode) {
      return res.status(400).json({ message: 'userId/playMode必填' });
    }
    const result = await deleteSelection(userId, playMode, gameDate);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const userId = Number(req.query.userId);
    const limit = Number(req.query.limit ?? 30);
    if (!userId) {
      return res.status(400).json({ message: 'userId必填' });
    }
    const data = await getSelectionHistory(userId, limit);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/view', async (req, res, next) => {
  try {
    const userId = Number(req.query.userId);
    const limit = Number(req.query.limit ?? 50);
    if (!userId) {
      return res.status(400).json({ message: 'userId必填' });
    }
    const data = await getUserSelectionsForView(userId, limit);
    res.json(data);
  } catch (error) {
    next(error);
  }
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
