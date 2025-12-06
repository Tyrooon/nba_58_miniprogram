/**
 * 测试从赛况页面获取球员本场得分
 */
import { getMatchPlayerStats, getGameBoxscore, loadMatchIdsForDate, getMatchIdFromCache } from '../src/services/zhibo8MobileService';

async function testMatchPlayerStats() {
  console.log('=== 测试从赛况页面获取球员本场得分 ===\n');
  
  // 测试几个已完成的比赛
  const matchIds = ['1794039', '1794040', '1794041'];
  
  for (const matchId of matchIds) {
    console.log(`\n比赛 ${matchId}:`);
    const players = await getMatchPlayerStats(matchId);
    
    if (players.length > 0) {
      console.log('  球员本场数据:');
      for (const player of players) {
        console.log(`    ${player.playerName}: ${player.points}分 ${player.rebounds}篮板 ${player.assists}助攻`);
      }
    } else {
      console.log('  未获取到球员数据');
    }
  }
}

async function testLoadMatchIds() {
  console.log('\n\n=== 测试加载matchId ===\n');
  
  const gameDate = '2025-12-02';
  console.log(`加载 ${gameDate} 的所有matchId...`);
  
  await loadMatchIdsForDate(gameDate);
  
  // 测试获取matchId
  // 老鹰(6916) @ 活塞(6888) 2025-12-02
  const matchId = getMatchIdFromCache('6888', '6916', gameDate);
  console.log(`老鹰 @ 活塞 matchId: ${matchId}`);
  
  // 骑士(6914) @ 步行者(6899) 2025-12-02
  const matchId2 = getMatchIdFromCache('6899', '6914', gameDate);
  console.log(`骑士 @ 步行者 matchId: ${matchId2}`);
}

async function testGetGameBoxscore() {
  console.log('\n\n=== 测试获取比赛boxscore ===\n');
  
  // 老鹰(1610612737) @ 活塞(1610612765) 2025-12-02
  const homeTeamId = 1610612765; // 活塞
  const awayTeamId = 1610612737; // 老鹰
  const gameDate = '2025-12-02';
  
  console.log(`获取比赛boxscore: 老鹰 @ 活塞 (${gameDate})`);
  const players = await getGameBoxscore(homeTeamId, awayTeamId, gameDate);
  
  if (players.length > 0) {
    console.log('\n球员本场数据:');
    for (const player of players) {
      console.log(`  ${player.playerName}: ${player.points}分 ${player.rebounds}篮板 ${player.assists}助攻`);
    }
  } else {
    console.log('未获取到球员数据');
  }
}

async function main() {
  await testMatchPlayerStats();
  await testLoadMatchIds();
  await testGetGameBoxscore();
  
  console.log('\n\n=== 测试完成 ===');
}

main().catch(console.error);

