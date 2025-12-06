import { getHupuBoxscore, getHupuDailyGames } from '../src/services/hupuService';

async function test() {
  console.log('=== 测试虎扑boxscore ===\n');
  
  // 获取12月2日的比赛
  const games = await getHupuDailyGames('2025-12-02');
  console.log(`找到 ${games.length} 场比赛\n`);
  
  if (games.length > 0) {
    const game = games[0];
    console.log(`测试比赛: ${game.awayTeam.teamNameCn} vs ${game.homeTeam.teamNameCn}`);
    console.log(`GameId: ${game.gameId}\n`);
    
    const boxscore = await getHupuBoxscore(game.gameId);
    
    if (boxscore) {
      console.log(`比分: ${boxscore.awayTeam.teamNameCn} ${boxscore.awayTeam.score} - ${boxscore.homeTeam.score} ${boxscore.homeTeam.teamNameCn}`);
      console.log(`\n主队球员 (${boxscore.homeTeam.players.length}名):`);
      boxscore.homeTeam.players.slice(0, 10).forEach((p, i) => {
        console.log(`  ${i+1}. ${p.playerNameCn}: ${p.points}分, ${p.rebounds}板, ${p.assists}助`);
      });
      
      console.log(`\n客队球员 (${boxscore.awayTeam.players.length}名):`);
      boxscore.awayTeam.players.slice(0, 10).forEach((p, i) => {
        console.log(`  ${i+1}. ${p.playerNameCn}: ${p.points}分, ${p.rebounds}板, ${p.assists}助`);
      });
    } else {
      console.log('获取boxscore失败');
    }
  }
}

test().catch(console.error);

