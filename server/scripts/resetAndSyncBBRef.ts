/**
 * 清理数据库并使用 Basketball Reference 重新同步
 */
import db from '../src/db';
import { syncDailyData, syncSeasonSchedule, refreshTodayScores, getGamesForDate, getPlayersForDate } from '../src/services/gameService';

async function resetAndSync() {
  console.log('=== 清理数据库 ===\n');
  
  // 清空比赛和球员表
  await db.prepare('DELETE FROM games').run([]);
  await db.prepare('DELETE FROM daily_players').run([]);
  
  console.log('数据库已清空\n');
  
  console.log('=== 同步12月赛程 ===\n');
  
  // 只同步12月的赛程
  const { getScheduleByMonth } = await import('../src/services/basketballReferenceService');
  
  const insertGameStmt = db.prepare(`
    INSERT INTO games (external_id, game_date, status, tipoff, home_team_id, home_team_name, visitor_team_id, visitor_team_name, home_score, visitor_score, season)
    VALUES (@external_id, @game_date, @status, @tipoff, @home_team_id, @home_team_name, @visitor_team_id, @visitor_team_name, @home_score, @visitor_score, @season)
    ON CONFLICT(external_id) DO UPDATE SET
      status = excluded.status,
      home_score = excluded.home_score,
      visitor_score = excluded.visitor_score
  `);
  
  const games = await getScheduleByMonth(2026, 'december');
  
  for (const game of games) {
    await insertGameStmt.run({
      external_id: game.gameId,
      game_date: game.gameDate,
      status: game.status,
      tipoff: '',
      home_team_id: game.homeTeamId,
      home_team_name: game.homeTeamNameCn,
      visitor_team_id: game.awayTeamId,
      visitor_team_name: game.awayTeamNameCn,
      home_score: game.homeScore,
      visitor_score: game.awayScore,
      season: '2024-25'
    });
  }
  
  console.log(`同步了 ${games.length} 场比赛\n`);
  
  console.log('=== 同步2025-12-01的球员数据 ===\n');
  
  const result = await syncDailyData('2025-12-01');
  console.log(`同步完成: ${result.games} 场比赛, ${result.players} 名球员\n`);
  
  // 验证结果
  const dbGames = await getGamesForDate('2025-12-01') as any[];
  console.log(`数据库中的比赛 (${dbGames.length}场):`);
  for (const g of dbGames) {
    console.log(`  ${g.external_id}: ${g.visitor_team_name} @ ${g.home_team_name} - ${g.visitor_score}:${g.home_score}`);
  }
  
  const players = await getPlayersForDate('2025-12-01') as any[];
  console.log(`\n数据库中的球员 (${players.length}人):`);
  const topPlayers = players.sort((a: any, b: any) => (b.stats_points || 0) - (a.stats_points || 0)).slice(0, 10);
  for (const p of topPlayers) {
    console.log(`  ${p.player_name} (${p.team_name}): 场均${p.season_avg}分, 本场${p.stats_points}分`);
  }
  
  console.log('\n=== 刷新比分 ===\n');
  const refreshResult = await refreshTodayScores('2025-12-01');
  console.log(`刷新完成: ${refreshResult.updated} 场比赛更新, ${refreshResult.playersUpdated} 名球员更新`);
}

resetAndSync().catch(console.error);

