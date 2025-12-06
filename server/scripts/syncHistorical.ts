import db from '../src/db';
import { syncDailyData } from '../src/services/gameService';

async function syncHistorical() {
  console.log('=== 同步历史比赛数据 ===\n');
  
  // 获取所有有比赛的日期
  const dates = await db.prepare(`
    SELECT DISTINCT game_date FROM games 
    WHERE status = 'Final' 
    ORDER BY game_date ASC
  `).all([]) as any[];
  
  console.log(`找到 ${dates.length} 个已完成的比赛日\n`);
  
  for (const row of dates) {
    const dateKey = row.game_date;
    console.log(`同步 ${dateKey}...`);
    try {
      const result = await syncDailyData(dateKey);
      console.log(`  ${result.updated_games} 场比赛, ${result.players} 名球员`);
    } catch (error) {
      console.error(`  同步失败:`, error);
    }
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n=== 完成 ===');
}

syncHistorical().catch(console.error);

