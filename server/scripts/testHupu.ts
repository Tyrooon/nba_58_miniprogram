import { getHupuSchedule, getHupuBoxscore, getHupuPlayerStats, getHupuSeasonAverages } from '../src/services/hupuService';

async function test() {
  console.log('=== 测试虎扑赛程爬取 ===');
  const games = await getHupuSchedule();
  console.log('获取到比赛数:', games.length);
  if (games.length > 0) {
    console.log('第一场比赛:', JSON.stringify(games[0], null, 2));
    
    // 测试boxscore
    const gameWithBoxscore = games.find(g => g.boxscoreUrl);
    if (gameWithBoxscore) {
      console.log('\n=== 测试虎扑比赛详情爬取 ===');
      console.log('测试比赛ID:', gameWithBoxscore.gameId);
      const boxscore = await getHupuBoxscore(gameWithBoxscore.gameId);
      if (boxscore) {
        console.log('比分:', boxscore.awayTeam.teamNameCn, boxscore.awayTeam.score, 'vs', boxscore.homeTeam.teamNameCn, boxscore.homeTeam.score);
        console.log('客队球员数:', boxscore.awayTeam.players.length);
        console.log('主队球员数:', boxscore.homeTeam.players.length);
        if (boxscore.awayTeam.players.length > 0) {
          const topScorer = boxscore.awayTeam.players.sort((a, b) => b.points - a.points)[0];
          console.log('客队得分王:', topScorer.playerNameCn, topScorer.points, '分');
        }
      }
    }
  }
  
  console.log('\n=== 测试虎扑球员统计爬取 ===');
  const players = await getHupuPlayerStats('pts', 1);
  console.log('获取到球员数:', players.length);
  if (players.length > 0) {
    console.log('得分榜前5:');
    players.slice(0, 5).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.playerNameCn} (${p.teamNameCn}): ${p.pointsPerGame}分/场, ${p.gamesPlayed}场`);
    });
  }
  
  console.log('\n=== 测试获取所有球员赛季均分 ===');
  const averages = await getHupuSeasonAverages();
  const avgCount = Object.keys(averages).length;
  console.log('获取到球员赛季均分数:', avgCount);
  if (avgCount > 0) {
    const sample = Object.entries(averages).slice(0, 3);
    console.log('示例数据:');
    sample.forEach(([id, data]) => {
      console.log(`  ID ${id}: ${data.playerName} - ${data.avg}分/场 (${data.teamName})`);
    });
  }
}

test().catch(console.error);

