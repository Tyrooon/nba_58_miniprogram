import db from '../src/db';
import { syncDailyData } from '../src/services/gameService';

async function syncFuture() {
  console.log('=== 同步未来比赛数据 ===\n');
  
  // 获取所有未开打的比赛日期
  const dates = await db.prepare(`
    SELECT DISTINCT game_date FROM games 
    WHERE status != 'Final' 
    ORDER BY game_date ASC
    LIMIT 5
  `).all([]) as any[];
  
  console.log(`找到 ${dates.length} 个未来比赛日\n`);
  
  for (const row of dates) {
    const dateKey = row.game_date;
    console.log(`同步 ${dateKey}...`);
    try {
      const result = await syncDailyData(dateKey);
      console.log(`  ${result.games} 场比赛, ${result.players} 名球员`);
    } catch (error) {
      console.error(`  同步失败:`, error);
    }
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 验证数据
  console.log('\n=== 验证未来比赛球员数据 ===');
  const futurePlayers = await db.prepare(`
    SELECT dp.game_date, dp.team_name, COUNT(*) as player_count
    FROM daily_players dp
    JOIN games g ON dp.game_date = g.game_date
    WHERE g.status != 'Final'
    GROUP BY dp.game_date, dp.team_name
    ORDER BY dp.game_date ASC
    LIMIT 20
  `).all([]) as any[];
  
  console.log('未来比赛球员统计:');
  futurePlayers.forEach(row => {
    console.log(`  ${row.game_date} ${row.team_name}: ${row.player_count} 名球员`);
  });
  
  console.log('\n=== 完成 ===');
}

syncFuture().catch(console.error);

