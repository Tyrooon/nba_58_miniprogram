import cron from 'node-cron';
import { config } from '../config';
import { syncDailyData } from '../services/gameService';
import { computeDayScores } from '../services/scoringService';
import { purgeExpiredFrozen } from '../services/userService';
import { processSeasonStats } from '../services/seasonStatsService';

export const bootstrapSchedulers = () => {
  cron.schedule(config.syncCron, async () => {
    try {
      await syncDailyData();
      purgeExpiredFrozen();
      console.info(`[cron] 同步今日赛程/球员完成`);
    } catch (error) {
      console.error('[cron] 同步失败', error);
    }
  });

  cron.schedule(config.scoreCron, async () => {
    try {
      const summary = await computeDayScores();
      console.info(`[cron] 计分完成`, summary);
    } catch (error) {
      console.error('[cron] 计分失败', error);
    }
  });

  const seasonCron = config.seasonStatsCron ?? '0 * * * *';
  cron.schedule(seasonCron, async () => {
    try {
      await processSeasonStats();
    } catch (error) {
      console.error('[cron] 赛季统计更新失败', error);
    }
  });
};







