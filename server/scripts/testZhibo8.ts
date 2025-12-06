import { getTeamData, getAllTeams, getTeamRosterByName } from '../src/services/zhibo8Service';

async function test() {
  console.log('=== 测试直播吧数据服务 ===\n');
  
  // 1. 测试获取雷霆队数据
  console.log('1. 获取雷霆队数据...');
  const thunderData = await getTeamData('6893');
  if (thunderData) {
    console.log(`   球队: ${thunderData.teamNameCn} (${thunderData.teamName})`);
    console.log(`   战绩: ${thunderData.wins}胜${thunderData.losses}负, 排名: ${thunderData.confRank}`);
    console.log(`   球员数: ${thunderData.players.length}`);
    console.log('   前5名球员:');
    thunderData.players.slice(0, 5).forEach((p, i) => {
      console.log(`     ${i+1}. ${p.playerName}: ${p.pointsPerGame}分/场, ${p.gamesPlayed}场`);
    });
    console.log('   最近比赛:');
    thunderData.recentGames.slice(0, 3).forEach((g, i) => {
      console.log(`     ${i+1}. ${g.gameDate} ${g.awayTeamNameCn} ${g.awayTeamScore} @ ${g.homeTeamNameCn} ${g.homeTeamScore}`);
    });
  }
  
  // 2. 测试获取湖人队数据
  console.log('\n2. 获取湖人队数据...');
  const lakersData = await getTeamData('6906');
  if (lakersData) {
    console.log(`   球队: ${lakersData.teamNameCn} (${lakersData.teamName})`);
    console.log(`   战绩: ${lakersData.wins}胜${lakersData.losses}负`);
    console.log(`   球员数: ${lakersData.players.length}`);
    console.log('   前5名球员:');
    lakersData.players.slice(0, 5).forEach((p, i) => {
      console.log(`     ${i+1}. ${p.playerName}: ${p.pointsPerGame}分/场`);
    });
  }
  
  // 3. 测试通过中文名获取球队名单
  console.log('\n3. 通过中文名获取火箭队名单...');
  const rocketsRoster = await getTeamRosterByName('火箭');
  console.log(`   火箭队球员数: ${rocketsRoster.length}`);
  if (rocketsRoster.length > 0) {
    console.log('   前5名球员:');
    rocketsRoster.slice(0, 5).forEach((p, i) => {
      console.log(`     ${i+1}. ${p.playerName}: ${p.pointsPerGame}分/场`);
    });
  }
  
  // 4. 获取所有球队列表
  console.log('\n4. 获取所有球队列表...');
  const teams = await getAllTeams();
  console.log(`   共 ${teams.length} 支球队`);
  
  console.log('\n=== 测试完成 ===');
}

test().catch(console.error);

