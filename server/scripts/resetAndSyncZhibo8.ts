import db from '../src/db';
import { syncSeasonSchedule, syncDailyData } from '../src/services/gameService';
import { toDateKey, addDays } from '../src/utils/date';

async function resetAndSync() {
  console.log('=== 重置数据库并使用直播吧数据重新同步 ===\n');
  
  // 1. 清空现有数据
  console.log('1. 清空现有数据...');
  await db.prepare('DELETE FROM daily_players').run([]);
  await db.prepare('DELETE FROM games').run([]);
  console.log('   已清空 games 和 daily_players 表\n');
  
  // 2. 同步赛程
  console.log('2. 同步赛程数据...');
  const scheduleResult = await syncSeasonSchedule();
  console.log(`   已同步 ${scheduleResult.totalGames} 场比赛\n`);
  
  // 3. 同步最近几天的球员数据
  console.log('3. 同步最近几天的球员数据...');
  const today = toDateKey();
  
  // 同步最近5天
  for (let i = -5; i <= 2; i++) {
    const targetDate = addDays(today, i);
    console.log(`   同步 ${targetDate}...`);
    try {
      const result = await syncDailyData(targetDate);
      console.log(`     ${result.games} 场比赛, ${result.players} 名球员`);
    } catch (error) {
      console.error(`     同步失败:`, error);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // 4. 验证数据
  console.log('\n4. 验证数据...');
  const gameCount = await db.prepare('SELECT COUNT(*) as c FROM games').get([]) as any;
  const playerCount = await db.prepare('SELECT COUNT(*) as c FROM daily_players').get([]) as any;
  console.log(`   比赛总数: ${gameCount.c}`);
  console.log(`   球员记录总数: ${playerCount.c}`);
  
  // 显示最近比赛
  const recentGames = await db.prepare(`
    SELECT game_date, home_team_name, visitor_team_name, home_score, visitor_score, status
    FROM games
    ORDER BY game_date DESC
    LIMIT 10
  `).all([]) as any[];
  
  console.log('\n   最近10场比赛:');
  for (const g of recentGames) {
    console.log(`     ${g.game_date} ${g.visitor_team_name} ${g.visitor_score} @ ${g.home_team_name} ${g.home_score} (${g.status})`);
  }
  
  // 显示球员场均得分
  const topPlayers = await db.prepare(`
    SELECT player_name, team_name, season_avg
    FROM daily_players
    WHERE game_date = ?
    ORDER BY season_avg DESC
    LIMIT 10
  `).all([today]) as any[];
  
  console.log(`\n   今日(${today})场均得分前10球员:`);
  for (const p of topPlayers) {
    console.log(`     ${p.player_name} (${p.team_name}): ${p.season_avg}分/场`);
  }
  
  console.log('\n=== 完成 ===');
}

resetAndSync().catch(console.error);

