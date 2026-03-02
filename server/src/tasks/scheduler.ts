import cron from 'node-cron';
import { config } from '../config';
import { syncDailyData, shouldSync, refreshTodayScores } from '../services/gameService';
import { computeDayScores } from '../services/scoringService';
import { purgeExpiredFrozen } from '../services/userService';
import { processSeasonStats } from '../services/seasonStatsService';
import { getTodayBeijing } from '../services/hybridNbaService';

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
    } catch (error: unknown) {
      console.error('[cron] 同步失败', error);
      console.error('[cron] Error stack:', error instanceof Error ? error.stack : String(error));
    }
  });

  // 计分任务：轮询，当天所有比赛结束后自动刷新比分并记分
  cron.schedule(config.scoreCron, async () => {
    try {
      const today = getTodayBeijing();
      console.log('[cron] Score job triggered for', today);

      // 1) 刷新当天所有已结束比赛的比分和球员 boxscore 到 daily_players
      const refresh = await refreshTodayScores(today);
      console.log(
        `[cron] refreshTodayScores: date=${refresh.date}, games=${refresh.games}, updated=${refresh.updated}, playersUpdated=${refresh.playersUpdated}, allFinished=${refresh.allFinished}`
      );

      // 2) 如果还有比赛未 Final，则先不记分，等下一轮 cron 再来
      if (!refresh.allFinished) {
        console.log('[cron] Some games not finished yet, skip scoring this round');
        return;
      }

      // 3) 所有比赛都 Final 时，统一对当天所有选人计算得分
      const summary = await computeDayScores(today);
      console.info('[cron] 计分完成', summary);
    } catch (error: unknown) {
      console.error('[cron] 计分任务失败', error);
      console.error('[cron] Error stack:', error instanceof Error ? error.stack : String(error));
    }
  });

  const seasonCron = config.seasonStatsCron ?? '0 * * * *';
  console.log('[scheduler] seasonStatsCron:', seasonCron);
  cron.schedule(seasonCron, async () => {
    try {
      console.log('[cron] Season stats triggered');
      await processSeasonStats();
    } catch (error: unknown) {
      console.error('[cron] 赛季统计更新失败', error);
      console.error('[cron] Error stack:', error instanceof Error ? error.stack : String(error));
    }
  });

  console.log('[scheduler] Schedulers bootstrap complete');
};







