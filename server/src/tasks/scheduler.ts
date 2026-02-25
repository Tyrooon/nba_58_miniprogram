import cron from 'node-cron';
import { config } from '../config';
import { syncDailyData, shouldSync } from '../services/gameService';
import { computeDayScores } from '../services/scoringService';
import { purgeExpiredFrozen } from '../services/userService';
import { processSeasonStats } from '../services/seasonStatsService';

export const bootstrapSchedulers = () => {
  console.log('[scheduler] Bootstrapping schedulers...');
  console.log('[scheduler] syncCron:', config.syncCron);
  console.log('[scheduler] scoreCron:', config.scoreCron);

  cron.schedule(config.syncCron, async () => {
    try {
      console.log('[cron] Sync triggered');
      const check = await shouldSync();
      if (!check.shouldSync) {
        console.info(`[cron] 跳过同步: ${check.reason}`);
        return;
      }
      console.info(`[cron] 开始同步: ${check.reason}`);
      await syncDailyData();
      await purgeExpiredFrozen();
      console.info(`[cron] 同步今日赛程/球员完成`);
    } catch (error) {
      console.error('[cron] 同步失败', error);
      console.error('[cron] Error stack:', error.stack);
    }
  });

  cron.schedule(config.scoreCron, async () => {
    try {
      console.log('[cron] Score computation triggered');
      const summary = await computeDayScores();
      console.info(`[cron] 计分完成`, summary);
    } catch (error) {
      console.error('[cron] 计分失败', error);
      console.error('[cron] Error stack:', error.stack);
    }
  });

  const seasonCron = config.seasonStatsCron ?? '0 * * * *';
  console.log('[scheduler] seasonStatsCron:', seasonCron);
  cron.schedule(seasonCron, async () => {
    try {
      console.log('[cron] Season stats triggered');
      await processSeasonStats();
    } catch (error) {
      console.error('[cron] 赛季统计更新失败', error);
      console.error('[cron] Error stack:', error.stack);
    }
  });

  console.log('[scheduler] Schedulers bootstrap complete');
};







