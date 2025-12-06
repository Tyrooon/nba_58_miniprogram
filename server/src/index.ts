import express from 'express';
import cors from 'cors';
import './db';
import { config } from './config';
import usersRouter from './routes/users';
import gamesRouter from './routes/games';
import selectionsRouter from './routes/selections';
import leaderboardRouter from './routes/leaderboard';
import adminRouter from './routes/admin';
import { bootstrapSchedulers } from './tasks/scheduler';
import { purgeExpiredFrozen } from './services/userService';

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

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(400).json({ message: err.message });
});

const start = () => {
  purgeExpiredFrozen();
  bootstrapSchedulers();
  app.listen(config.port, () => {
    console.log(`NBA球星58竞猜API running on http://localhost:${config.port}`);
  });
};

start();









