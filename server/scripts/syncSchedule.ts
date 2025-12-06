import db from '../src/db';
import { syncSeasonSchedule, syncDailyData } from '../src/services/gameService';
import { toDateKey, addDays } from '../src/utils/date';

async function sync() {
  console.log('=== 同步赛程数据 ===\n');
  
  // 1. 同步赛程
  console.log('1. 同步赛程...');
  const result = await syncSeasonSchedule();
  console.log(`   已同步 ${result.totalGames} 场比赛\n`);
  
  // 2. 查看比赛日期范围
  const dateRange = await db.prepare(`
    SELECT MIN(game_date) as min_date, MAX(game_date) as max_date, COUNT(*) as total
    FROM games
  `).get([]) as any;
  console.log(`2. 比赛日期范围: ${dateRange.min_date} ~ ${dateRange.max_date}`);
  console.log(`   总比赛数: ${dateRange.total}\n`);
  
  // 3. 查看未来比赛
  const today = toDateKey();
  const futureGames = await db.prepare(`
    SELECT game_date, COUNT(*) as c
    FROM games
    WHERE game_date >= ?
    GROUP BY game_date
    ORDER BY game_date ASC
    LIMIT 10
  `).all([today]) as any[];
  
  console.log(`3. 未来10天比赛 (从${today}开始):`);
  futureGames.forEach(g => console.log(`   ${g.game_date}: ${g.c}场`));
  
  // 4. 同步今天和明天的球员数据
  console.log('\n4. 同步今明两天球员数据...');
  for (let i = 0; i <= 1; i++) {
    const targetDate = addDays(today, i);
    console.log(`   同步 ${targetDate}...`);
    try {
      const dayResult = await syncDailyData(targetDate);
      console.log(`     ${dayResult.games}场比赛, ${dayResult.players}名球员`);
    } catch (error) {
      console.error(`     失败:`, error);
    }
  }
  
  console.log('\n=== 完成 ===');
}

sync().catch(console.error);

