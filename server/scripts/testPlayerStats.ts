import { getHupuPlayerStats, getHupuSeasonAverages } from '../src/services/hupuService';

async function test() {
  console.log('=== 测试虎扑球员统计数据 ===\n');
  
  // 获取第1页球员统计
  console.log('1. 获取第1页球员统计...');
  const page1 = await getHupuPlayerStats('pts', 1);
  console.log(`   第1页球员数: ${page1.length}`);
  if (page1.length > 0) {
    console.log('   前5名:');
    page1.slice(0, 5).forEach((p, i) => {
      console.log(`     ${i+1}. ${p.playerNameCn} (${p.teamNameCn}): ${p.pointsPerGame}分/场, ${p.gamesPlayed}场`);
    });
  }
  
  // 获取更多页
  console.log('\n2. 获取更多页球员统计...');
  for (let page = 2; page <= 5; page++) {
    const players = await getHupuPlayerStats('pts', page);
    console.log(`   第${page}页: ${players.length}名球员`);
    if (players.length === 0) break;
    await new Promise(r => setTimeout(r, 300));
  }
  
  // 测试获取所有球员赛季均分
  console.log('\n3. 获取所有球员赛季均分...');
  const averages = await getHupuSeasonAverages();
  const count = Object.keys(averages).length;
  console.log(`   共获取 ${count} 名球员的赛季均分`);
  
  // 显示一些示例
  const samples = Object.entries(averages).slice(0, 10);
  console.log('   示例数据:');
  samples.forEach(([id, data]) => {
    console.log(`     ID ${id}: ${data.playerName} - ${data.avg}分/场`);
  });
}

test().catch(console.error);

