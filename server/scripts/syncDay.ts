import db from '../src/db';
import { syncDailyData } from '../src/services/gameService';

async function sync() {
  const targetDate = process.argv[2] || '2025-12-01';
  console.log(`同步 ${targetDate} 的数据...`);
  
  const result = await syncDailyData(targetDate);
  console.log('结果:', result);
  
  // 查看同步的数据
  const games = await db.prepare('SELECT * FROM games WHERE game_date = ?').all([targetDate]) as any[];
  console.log(`\n比赛数: ${games.length}`);
  games.forEach(g => console.log(`  ${g.visitor_team_name} @ ${g.home_team_name}: ${g.visitor_score}-${g.home_score}`));
  
  const players = await db.prepare('SELECT player_name, team_name, season_avg FROM daily_players WHERE game_date = ? ORDER BY season_avg DESC LIMIT 10').all([targetDate]) as any[];
  console.log('\n前10球员:');
  players.forEach(p => console.log(`  ${p.player_name} (${p.team_name}): ${p.season_avg}`));
}

sync().catch(console.error);

