import db from '../src/db';
import { syncDailyData } from '../src/services/gameService';
import { toDateKey } from '../src/utils/date';

async function test() {
  console.log('=== 测试单日数据同步 ===\n');
  
  const today = toDateKey();
  console.log(`同步 ${today} 的数据...`);
  
  try {
    const result = await syncDailyData(today);
    console.log(`结果: ${result.games} 场比赛, ${result.players} 名球员`);
    
    // 查看同步的数据
    const games = await db.prepare(`
      SELECT game_date, home_team_name, visitor_team_name, home_score, visitor_score, status
      FROM games
      WHERE game_date = ?
    `).all([today]) as any[];
    
    console.log(`\n今日比赛 (${games.length}场):`);
    for (const g of games) {
      console.log(`  ${g.visitor_team_name} ${g.visitor_score} @ ${g.home_team_name} ${g.home_score} (${g.status})`);
    }
    
    // 查看球员
    const players = await db.prepare(`
      SELECT player_name, team_name, season_avg
      FROM daily_players
      WHERE game_date = ?
      ORDER BY season_avg DESC
      LIMIT 10
    `).all([today]) as any[];
    
    console.log(`\n场均得分前10:`);
    for (const p of players) {
      console.log(`  ${p.player_name} (${p.team_name}): ${p.season_avg}分/场`);
    }
    
  } catch (error) {
    console.error('同步失败:', error);
  }
  
  console.log('\n=== 完成 ===');
}

test().catch(console.error);

