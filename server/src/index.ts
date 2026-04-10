import express from 'express';
import path from 'path';
import cors from 'cors';
import './db';
import { config, paths } from './config';
import usersRouter from './routes/users';
import gamesRouter from './routes/games';
import selectionsRouter from './routes/selections';
import leaderboardRouter from './routes/leaderboard';
import adminRouter from './routes/admin';
import managerRouter from './routes/manager';
import playoffRouter from './routes/playoff';
import { bootstrapSchedulers } from './tasks/scheduler';
import { purgeExpiredFrozen } from './services/userService';
import { syncDailyData } from './services/gameService';
import db from './db';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/users', usersRouter);
app.use('/api/games', gamesRouter);
app.use('/api/selections', selectionsRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/manager', managerRouter);
app.use('/api/playoff', playoffRouter);

// Serve uploaded files (avatars, etc.)
app.use('/uploads', express.static(path.resolve(paths.data, 'uploads')));

// Serve webapp static files (built into dist/public by root build script)
const publicDir = path.resolve(__dirname, 'public');
app.use(express.static(publicDir));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(400).json({ message: err.message });
});

// Fallback: serve index.html for non-API routes (SPA support)
app.get('*', (_req, res) => {
  res.sendFile(path.resolve(publicDir, 'index.html'));
});

const start = async () => {
  try {
    await purgeExpiredFrozen();
    bootstrapSchedulers();

    // Auto-sync on startup: check if today's game data exists, sync if missing
    try {
      const today = new Date().toISOString().split('T')[0];
      const row = await db.get(
        'SELECT COUNT(*) as cnt FROM games WHERE game_date = ?',
        [today]
      ) as any;
      if (!row || row.cnt === 0) {
        console.log(`[startup] No games found for ${today}, triggering auto-sync...`);
        // Sync yesterday, today, and tomorrow
        const d = (offset: number) => {
          const dt = new Date();
          dt.setDate(dt.getDate() + offset);
          return dt.toISOString().split('T')[0];
        };
        for (const date of [d(-1), d(0), d(1)]) {
          console.log(`[startup] Syncing ${date}...`);
          await syncDailyData(date);
        }
        console.log('[startup] Auto-sync complete');
      } else {
        console.log(`[startup] Found ${row.cnt} games for ${today}, skip auto-sync`);
      }
    } catch (syncErr) {
      console.error('[startup] Auto-sync failed (non-fatal):', syncErr);
    }

    app.listen(config.port, () => {
      console.log('NBA球星58竞猜API running on http://localhost:' + config.port);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();
