import { getHupuTeamRoster } from '../src/services/hupuService';

async function test() {
  console.log('=== 测试虎扑球队名单获取 ===\n');
  
  // 测试湖人队
  console.log('1. 获取湖人队名单...');
  const lakersRoster = await getHupuTeamRoster('lakers');
  console.log(`   湖人队球员数: ${lakersRoster.length}`);
  if (lakersRoster.length > 0) {
    console.log('   球员列表:');
    lakersRoster.forEach((p, i) => {
      console.log(`     ${i+1}. ${p.playerNameCn} (${p.position || '未知位置'})`);
    });
  }
  
  // 测试雄鹿队
  console.log('\n2. 获取雄鹿队名单...');
  const bucksRoster = await getHupuTeamRoster('bucks');
  console.log(`   雄鹿队球员数: ${bucksRoster.length}`);
  if (bucksRoster.length > 0) {
    console.log('   前5名球员:');
    bucksRoster.slice(0, 5).forEach((p, i) => {
      console.log(`     ${i+1}. ${p.playerNameCn} (${p.position || '未知位置'})`);
    });
  }
}

test().catch(console.error);

