import path from 'path';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, '..', '.env'),
});

export const config = {
  port: Number(process.env.PORT ?? 80),
  ballDontLieBase: process.env.BALL_DONT_LIE_BASE ?? 'https://api.balldontlie.io/v1',
  ballDontLieApiKey: process.env.BALL_DONT_LIE_API_KEY ?? '',
  currentSeason: Number(process.env.CURRENT_SEASON ?? 2025),
  sportsBlazeApiKey: process.env.SPORTSBLAZE_API_KEY ?? '',
  adminApiToken: process.env.ADMIN_API_TOKEN ?? '',
  syncCron: process.env.SYNC_CRON ?? '5 4 * * *',
  scoreCron: process.env.SCORE_CRON ?? '0 14 * * *',
  seasonStatsCron: process.env.SEASON_STATS_CRON ?? '0 * * * *',
  freezeDays: 7,
  // 微信小程序配置
  wechatAppId: process.env.WECHAT_APPID ?? '',
  wechatSecret: process.env.WECHAT_SECRET ?? '',

  // 选人模式配置
  // 设置为 false 以关闭对应模式
  modeEnabled: {
    regular: process.env.MODE_REGULAR !== 'false',
    plus58: process.env.MODE_PLUS58 !== 'false',
    minus58: process.env.MODE_MINUS58 !== 'false',
    manager: process.env.MODE_MANAGER !== 'false',
  },
};

const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data');

export const paths = {
  root: path.resolve(__dirname, '..'),
  data: dataDir,
  // Allow overriding DB file name via env for working with snapshots like "nba_guess (7).db"
  dbFile: path.resolve(dataDir, process.env.DB_FILE || 'nba_guess.db'),
};
