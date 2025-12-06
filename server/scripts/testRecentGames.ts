import { getTeamData, getAllTeams } from '../src/services/zhibo8Service';

async function test() {
  console.log('=== 检查最近比赛 ===\n');
  
  // 检查雷霆队
  const thunder = await getTeamData('6893');
  if (thunder) {
    console.log('雷霆最近比赛:');
    thunder.recentGames.slice(0, 5).forEach(g => {
      console.log(`  ${g.gameDate}: ${g.awayTeamNameCn} ${g.awayTeamScore} @ ${g.homeTeamNameCn} ${g.homeTeamScore} (${g.status})`);
    });
  }
  
  // 收集所有比赛日期
  console.log('\n收集所有球队的比赛...');
  const allTeams = await getAllTeams();
  const dates = new Set<string>();
  
  for (const team of allTeams.slice(0, 5)) { // 只检查前5个球队
    const data = await getTeamData(team.teamId);
    if (data) {
      for (const g of data.recentGames) {
        dates.add(g.gameDate);
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\n找到的比赛日期:');
  Array.from(dates).sort().forEach(d => console.log(`  ${d}`));
}

test().catch(console.error);

