import { syncDailyData, syncSeasonSchedule } from '../src/services/gameService';
import db from '../src/db';

async function test() {
  console.log('=== 测试虎扑数据同步 ===\n');
  
  // 测试同步赛程
  console.log('1. 同步赛程...');
  const scheduleResult = await syncSeasonSchedule();
  console.log('赛程同步结果:', scheduleResult);
  
  // 查看数据库中的比赛
  const games = await db.prepare('SELECT * FROM games ORDER BY game_date DESC LIMIT 5').all([]);
  console.log('\n最近5场比赛:');
  (games as any[]).forEach(g => {
    console.log(`  ${g.game_date} ${g.visitor_team_name} vs ${g.home_team_name} (${g.status})`);
  });
  
  // 测试同步某一天的数据
  console.log('\n2. 同步2025-12-01的比赛数据...');
  const dailyResult = await syncDailyData('2025-12-01');
  console.log('每日同步结果:', dailyResult);
  
  // 查看球员数据
  const players = await db.prepare(`
    SELECT player_name, team_name, stats_points, season_avg 
    FROM daily_players 
    WHERE game_date = '2025-12-01' 
    ORDER BY stats_points DESC 
    LIMIT 10
  `).all([]);
  console.log('\n2025-12-01得分前10球员:');
  (players as any[]).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.player_name} (${p.team_name}): ${p.stats_points}分, 赛季均分: ${p.season_avg}`);
  });
}

test().catch(console.error);

