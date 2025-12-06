/**
 * 检查API返回的比赛数据中是否有matchId
 */
import fetch from 'node-fetch';

async function checkTeamMatchData() {
  console.log('=== 检查球队API返回的比赛数据 ===\n');
  
  const teamId = '6888'; // 活塞
  const url = `https://data.zhibo8.cc/manage/public/app.php?_url=/nba_v2/team&teamId=${teamId}`;
  
  console.log(`获取球队数据: ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  let text = await response.text();
  const jsonStart = text.indexOf('{');
  if (jsonStart > 0) {
    text = text.substring(jsonStart);
  }
  
  const data = JSON.parse(text) as any;
  
  if (data.status === '1' && data.data && data.data.match) {
    console.log('\n最近比赛原始数据:');
    const recentGames = data.data.match.recent_games || [];
    for (const game of recentGames.slice(0, 3)) {
      console.log(`\n  比赛: ${game.awayTeam} @ ${game.homeTeam}`);
      console.log(`  日期: ${game.date}`);
      console.log(`  比分: ${game.awayTeamScore} - ${game.homeTeamScore}`);
      console.log(`  matchId: ${game.matchId}`);
      console.log(`  所有字段: ${Object.keys(game).join(', ')}`);
      console.log(`  原始数据: ${JSON.stringify(game)}`);
    }
  }
}

async function checkMatchJson() {
  console.log('\n\n=== 检查比赛详情JSON ===\n');
  
  // 从m.zhibo8.cc获取比赛详情
  const matchIds = ['1794039', '1794040'];
  
  for (const matchId of matchIds) {
    console.log(`\n比赛 ${matchId}:`);
    const url = `https://m.zhibo8.cc/json/match/${matchId}.json`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (response.ok) {
      const data = await response.json() as any;
      console.log(`  ${data.visit_team} @ ${data.home_team}`);
      console.log(`  match_id: ${data.match_id}`);
      console.log(`  home_id: ${data.home_id}`);
      console.log(`  visit_id: ${data.visit_id}`);
      console.log(`  match_date: ${data.match_date}`);
    }
  }
}

async function main() {
  await checkTeamMatchData();
  await checkMatchJson();
}

main().catch(console.error);

