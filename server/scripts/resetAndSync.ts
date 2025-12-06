import db from '../src/db';
import { syncSeasonSchedule, syncDailyData } from '../src/services/gameService';

async function resetAndSync() {
  console.log('=== 重置并同步虎扑数据 ===\n');
  
  // 1. 清空旧数据
  console.log('1. 清空旧数据...');
  await db.exec('DELETE FROM daily_players');
  await db.exec('DELETE FROM games');
  await db.exec('DELETE FROM player_season_totals');
  await db.exec('DELETE FROM season_aggregate_log');
  console.log('   已清空所有比赛和球员数据\n');
  
  // 2. 同步赛程
  console.log('2. 从虎扑同步赛程...');
  const scheduleResult = await syncSeasonSchedule();
  console.log(`   同步了 ${scheduleResult.totalGames} 场比赛\n`);
  
  // 3. 查看同步结果
  const games = await db.prepare('SELECT * FROM games ORDER BY game_date ASC LIMIT 10').all([]) as any[];
  console.log('3. 最早10场比赛:');
  games.forEach(g => {
    console.log(`   ${g.game_date} ${g.external_id}: ${g.visitor_team_name} @ ${g.home_team_name} (${g.status})`);
  });
  
  // 4. 同步今天的比赛数据
  const today = new Date().toISOString().split('T')[0];
  console.log(`\n4. 同步 ${today} 的比赛数据...`);
  const dailyResult = await syncDailyData(today);
  console.log('   同步结果:', dailyResult);
  
  // 5. 查看球员数据
  const players = await db.prepare(`
    SELECT player_name, team_name, stats_points, season_avg 
    FROM daily_players 
    WHERE game_date = ? 
    ORDER BY stats_points DESC 
    LIMIT 10
  `).all([today]) as any[];
  
  if (players.length > 0) {
    console.log(`\n5. ${today} 得分前10球员:`);
    players.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.player_name} (${p.team_name}): ${p.stats_points}分, 赛季均分: ${p.season_avg}`);
    });
  } else {
    console.log(`\n5. ${today} 暂无球员数据`);
  }
  
  console.log('\n=== 完成 ===');
}

resetAndSync().catch(console.error);

