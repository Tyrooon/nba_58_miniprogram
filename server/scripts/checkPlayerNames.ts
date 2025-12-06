import db from '../src/db';
import { getHupuBoxscore, getHupuDailyGames } from '../src/services/hupuService';

async function check() {
  console.log('=== 检查球员名匹配 ===\n');
  
  // 获取一场比赛
  const games = await getHupuDailyGames('2025-12-02');
  if (games.length === 0) {
    console.log('没有找到比赛');
    return;
  }
  
  const game = games.find(g => g.homeTeam.teamNameCn === '奇才' || g.awayTeam.teamNameCn === '奇才');
  if (!game) {
    console.log('没有找到奇才的比赛');
    return;
  }
  
  console.log(`比赛: ${game.awayTeam.teamNameCn} vs ${game.homeTeam.teamNameCn}`);
  
  // 获取虎扑boxscore
  const boxscore = await getHupuBoxscore(game.gameId);
  if (!boxscore) {
    console.log('获取boxscore失败');
    return;
  }
  
  // 获取数据库中的球员
  const dbPlayers = await db.prepare(`
    SELECT player_name, team_name 
    FROM daily_players 
    WHERE game_date = ? AND (team_name = ? OR team_name = ?)
  `).all(['2025-12-02', boxscore.homeTeam.teamNameCn, boxscore.awayTeam.teamNameCn]) as any[];
  
  console.log(`\n虎扑球员 (${boxscore.homeTeam.players.length + boxscore.awayTeam.players.length}名):`);
  const hupuPlayers = [...boxscore.homeTeam.players, ...boxscore.awayTeam.players];
  hupuPlayers.slice(0, 10).forEach(p => {
    const matched = dbPlayers.find(db => db.player_name === p.playerNameCn);
    console.log(`  ${p.playerNameCn}: ${p.points}分 ${matched ? '✓' : '✗'}`);
  });
  
  console.log(`\n数据库球员 (${dbPlayers.length}名):`);
  dbPlayers.slice(0, 10).forEach(p => {
    const matched = hupuPlayers.find(h => h.playerNameCn === p.player_name);
    console.log(`  ${p.player_name} ${matched ? '✓' : '✗'}`);
  });
}

check().catch(console.error);

