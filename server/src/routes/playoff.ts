import express from 'express';
import * as playoffService from '../services/playoffService';

const router = express.Router();

// Get playoff overall status
router.get('/status', async (req: any, res, next) => {
  try {
    const userId = req.query.userId as string | undefined;
    const status = await playoffService.getPlayoffStatus(userId);
    res.json({ success: true, data: status });
  } catch (error: any) {
    next(error);
  }
});

// Get matchup detail
router.get('/matchup/:id', async (req: any, res, next) => {
  try {
    const matchupId = parseInt(req.params.id, 10);
    if (isNaN(matchupId)) {
      return res.status(400).json({ success: false, error: 'Invalid matchup ID' });
    }
    const userId = req.query.userId as string | undefined;
    const detail = await playoffService.getMatchupDetail(matchupId, userId);
    res.json({ success: true, data: detail });
  } catch (error: any) {
    next(error);
  }
});

// Make a playoff selection
router.post('/select', async (req: any, res, next) => {
  try {
    const { matchupId, userId, playerId, gameDate } = req.body;

    if (!matchupId || !userId || !playerId || !gameDate) {
      return res.status(400).json({ success: false, error: 'matchupId, userId, playerId and gameDate are required' });
    }

    const selection = await playoffService.makeSelection(matchupId, userId, playerId, gameDate);
    res.json({ success: true, data: selection });
  } catch (error: any) {
    next(error);
  }
});

// Delete a playoff selection
router.delete('/select', async (req: any, res, next) => {
  try {
    const { matchupId, userId, gameDate } = req.body;

    if (!matchupId || !userId || !gameDate) {
      return res.status(400).json({ success: false, error: 'matchupId, userId and gameDate are required' });
    }

    await playoffService.deleteSelection(matchupId, userId, gameDate);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Get frozen players for current round
router.get('/frozen', async (req: any, res, next) => {
  try {
    const userId = req.query.userId as string;
    const roundIdStr = req.query.roundId as string | undefined;
    const roundId = roundIdStr ? parseInt(roundIdStr, 10) : undefined;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const frozen = await playoffService.getFrozenPlayers(userId, roundId);
    res.json({ success: true, data: frozen });
  } catch (error: any) {
    next(error);
  }
});

// Get available players for a matchup on a specific date
router.get('/available-players', async (req: any, res, next) => {
  try {
    const matchupId = parseInt(req.query.matchupId as string, 10);
    const userId = req.query.userId as string;
    const gameDate = req.query.gameDate as string;

    if (!matchupId || !userId || !gameDate) {
      return res.status(400).json({ success: false, error: 'matchupId, userId and gameDate are required' });
    }

    const players = await playoffService.getAvailablePlayers(matchupId, userId, gameDate);
    res.json({ success: true, data: players });
  } catch (error: any) {
    next(error);
  }
});

// Admin: Initialize playoff bracket
router.post('/init', async (req: any, res, next) => {
  try {
    const result = await playoffService.initPlayoff();
    res.json({ success: true, data: result });
  } catch (error: any) {
    next(error);
  }
});

// Admin: Sync playoff game dates from NBA schedule
router.post('/sync-dates', async (req: any, res, next) => {
  try {
    const { roundType } = req.body;
    if (!roundType) {
      return res.status(400).json({ success: false, error: 'roundType is required' });
    }
    const dates = await playoffService.syncPlayoffDates(roundType);
    res.json({ success: true, data: { dates } });
  } catch (error: any) {
    next(error);
  }
});

// Admin: Calculate scores for a matchup day
router.post('/calculate', async (req: any, res, next) => {
  try {
    const { matchupId, gameDate } = req.body;
    if (!matchupId || !gameDate) {
      return res.status(400).json({ success: false, error: 'matchupId and gameDate are required' });
    }
    const scores = await playoffService.calculateMatchupDayScores(matchupId, gameDate);
    res.json({ success: true, data: scores });
  } catch (error: any) {
    next(error);
  }
});

// Admin: Advance to next round
router.post('/advance', async (req: any, res, next) => {
  try {
    const { roundType } = req.body;
    if (!roundType) {
      return res.status(400).json({ success: false, error: 'roundType is required' });
    }
    const result = await playoffService.advanceRound(roundType);
    res.json({ success: true, data: result });
  } catch (error: any) {
    next(error);
  }
});

export default router;
