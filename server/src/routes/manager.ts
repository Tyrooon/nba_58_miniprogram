import db from '../db';
import express from 'express';
import managerService from '../services/managerService';

const router = express.Router();

// Get user's manager roster
router.get('/roster', async (req: any, res, next) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    const roster = await managerService.getUserRoster(userId);
    res.json({ success: true, data: roster });
  } catch (error: any) {
    next(error);
  }
});

// Set starters
router.post('/starters/set', async (req: any, res, next) => {
  try {
    const { userId, starterIds } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    
    if (!Array.isArray(starterIds) || starterIds.length !== 5) {
      return res.status(400).json({ success: false, error: 'Must select exactly 5 starters' });
    }
    
    // Check if at least 1 rookie is in starters
    const roster = await managerService.getUserRoster(userId);
    const rookieCount = starterIds.filter((playerId) => 
      roster.some((p: any) => p.player_id === playerId && p.player_type === 'rookie')
    ).length;
    
    if (rookieCount < 1) {
      return res.status(400).json({ success: false, error: 'At least 1 rookie must be in starters' });
    }
    
    await managerService.setStarters(userId, starterIds);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Get weekly scores
router.get('/weekly/scores', async (req: any, res, next) => {
  try {
    const week_start = req.query.week_start as string;
    
    if (!week_start) {
      // Default to current week
      const today = new Date();
      const dayOfWeek = today.getDay();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - dayOfWeek);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      
      const scores = await managerService.getWeeklyScores(weekStartStr);
      res.json({ success: true, data: scores });
    } else {
      const scores = await managerService.getWeeklyScores(week_start);
      res.json({ success: true, data: scores });
    }
  } catch (error: any) {
    next(error);
  }
});

// Calculate weekly points for user
router.post('/weekly/calculate', async (req: any, res, next) => {
  try {
    const { userId, week_start } = req.body;
    
    if (!userId || !week_start) {
      return res.status(400).json({ success: false, error: 'userId and week_start are required' });
    }
    
    const points = await managerService.calculateWeeklyPoints(userId, week_start);
    res.json({ success: true, data: { points } });
  } catch (error: any) {
    next(error);
  }
});

// Check if player can be moved to injured list
router.get('/injured/check/:playerId', async (req: any, res, next) => {
  try {
    const { playerId } = req.params;
    const canMove = await managerService.canMoveToInjured(playerId);
    res.json({ success: true, data: { canMove } });
  } catch (error: any) {
    next(error);
  }
});

// Move player to injured list
router.post('/injured/move', async (req: any, res, next) => {
  try {
    const { userId, playerId } = req.body;
    
    if (!userId || !playerId) {
      return res.status(400).json({ success: false, error: 'userId and playerId are required' });
    }
    
    // Check constraints
    const roster = await managerService.getUserRoster(userId);
    const injuredCount = roster.filter((p: any) => p.is_injured).length;
    
    if (injuredCount >= 1) {
      return res.status(400).json({ success: false, error: 'Already have a player in injured list' });
    }
    
    const canMove = await managerService.canMoveToInjured(playerId);
    if (!canMove) {
      return res.status(400).json({ success: false, error: 'Player has played in last 7 days' });
    }
    
    await managerService.moveToInjured(userId, playerId);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Release player from injured list
router.post('/injured/release', async (req: any, res, next) => {
  try {
    const { userId, playerId } = req.body;
    
    if (!userId || !playerId) {
      return res.status(400).json({ success: false, error: 'userId and playerId are required' });
    }
    
    await managerService.releaseFromInjured(userId, playerId);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Add player to roster
router.post('/roster/add', async (req: any, res, next) => {
  try {
    const { userId, playerId, playerType } = req.body;
    
    if (!userId || !playerId || !playerType) {
      return res.status(400).json({ success: false, error: 'userId, playerId and playerType are required' });
    }
    
    if (!['regular', 'rookie'].includes(playerType)) {
      return res.status(400).json({ success: false, error: 'playerType must be regular or rookie' });
    }
    
    // Check constraints before adding
    const constraints = await managerService.checkRosterConstraints(userId);
    if (!constraints.valid) {
      return res.status(400).json({ success: false, error: constraints.errors.join(', ') });
    }
    
    await managerService.addPlayerToRoster(userId, playerId, playerType);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Remove player from roster
router.post('/roster/remove', async (req: any, res, next) => {
  try {
    const { userId, playerId } = req.body;
    
    if (!userId || !playerId) {
      return res.status(400).json({ success: false, error: 'userId and playerId are required' });
    }
    
    await managerService.removePlayerFromRoster(userId, playerId);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Create trade proposal
router.post('/trade/create', async (req: any, res, next) => {
  try {
    const { fromUserId, toUserId, tradeDetails } = req.body;
    
    if (!fromUserId || !toUserId || !tradeDetails) {
      return res.status(400).json({ success: false, error: 'fromUserId, toUserId and tradeDetails are required' });
    }
    
    if (fromUserId === toUserId) {
      return res.status(400).json({ success: false, error: 'Cannot trade with yourself' });
    }
    
    const tradeId = await managerService.createTrade(fromUserId, toUserId, tradeDetails);
    res.json({ success: true, data: { tradeId } });
  } catch (error: any) {
    next(error);
  }
});

// Vote on trade
router.post('/trade/vote', async (req: any, res, next) => {
  try {
    const { tradeId, userId, vote } = req.body;
    
    if (!tradeId || !userId || typeof vote !== 'boolean') {
      return res.status(400).json({ success: false, error: 'tradeId, userId and vote (boolean) are required' });
    }
    
    await managerService.voteOnTrade(tradeId, userId, vote);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Get pending trades
router.get('/trades/pending', async (req: any, res, next) => {
  try {
    const trades = await managerService.getPendingTrades();
    res.json({ success: true, data: trades });
  } catch (error: any) {
    next(error);
  }
});

// Update trade status
router.post('/trade/update-status', async (req: any, res, next) => {
  try {
    const { tradeId, status } = req.body;
    
    if (!tradeId || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'tradeId and status (approved/rejected) are required' });
    }
    
    await managerService.updateTradeStatus(tradeId, status);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Execute reshuffle
router.post('/reshuffle', async (req: any, res, next) => {
  try {
    const { userId, retainedPlayerIds } = req.body;
    
    if (!userId || !Array.isArray(retainedPlayerIds) || retainedPlayerIds.length !== 2) {
      return res.status(400).json({ success: false, error: 'Must select exactly 2 players to retain' });
    }
    
    await managerService.executeReshuffle(userId, retainedPlayerIds);
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Get snake draft order for initial draft
router.get('/draft/snake-order', async (req: any, res, next) => {
  try {
    const query = 'SELECT id FROM users ORDER BY score DESC';
    
    db.all(query, [], (err: any, rows: any[]) => {
      if (err) {
        console.error('Error getting users for draft order:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      const userIds = rows.map((row: any) => row.id);
      const draftOrder = managerService.snakeDraftOrder(userIds);
      
      res.json({ success: true, data: { draftOrder } });
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;
