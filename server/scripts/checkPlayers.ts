import db from '../src/db';

async function check() {
  console.log('=== 检查球员数据 ===\n');
  
  // 检查重复球员
  const duplicates = await db.prepare(`
    SELECT player_name, team_name, COUNT(*) as cnt 
    FROM daily_players 
    WHERE game_date = '2025-12-02' 
    GROUP BY player_name, team_name 
    HAVING cnt > 1 
    LIMIT 10
  `).all([]) as any[];
  console.log('重复球员:', duplicates);
  
  // 统计独立球员数
  const total = await db.prepare(`
    SELECT COUNT(DISTINCT player_id) as cnt 
    FROM daily_players 
    WHERE game_date = '2025-12-02'
  `).get([]) as any;
  console.log('独立球员数:', total?.cnt);
  
  // 查看某个球队的球员
  const lakersPlayers = await db.prepare(`
    SELECT player_name, season_avg 
    FROM daily_players 
    WHERE game_date = '2025-12-02' AND team_name = '湖人'
    ORDER BY season_avg DESC
  `).all([]) as any[];
  console.log('\n湖人队球员:', lakersPlayers.length);
  lakersPlayers.slice(0, 10).forEach((p, i) => {
    console.log(`  ${i+1}. ${p.player_name}: ${p.season_avg}分/场`);
  });
}

check().catch(console.error);

