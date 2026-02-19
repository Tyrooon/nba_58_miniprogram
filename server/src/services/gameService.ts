import db from '../db';
import { config } from '../config';

// 字符串哈希函数
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

import {
  getTodayBeijing,
  addDays,
  getGamesInRange,
  getGamesAroundToday,
  refreshTodayGames,
  getGamePlayers,
  updateSchedule,
  getTeamNameCn,
  getBBRAllPlayerStats,
  getBBRTeamRoster,
  getBBRBoxscore,
  Game,
  Player,
} from './hybridNbaService';

// ==================== 数据库操作 ====================

/**
 * 同步比赛数据到数据库
 */
export const syncDailyData = async (targetDate?: string) => {
  const dateKey = targetDate || getTodayBeijing();
  console.log(`Syncing data for ${dateKey}...`);
  
  // 获取前后7天的比赛
  const startDate = addDays(dateKey, -7);
  const endDate = addDays(dateKey, 7);
  
  const games = await getGamesInRange(startDate, endDate);
  
  // 先清理指定日期范围的旧数据
  console.log(`Clearing old data from ${startDate} to ${endDate}...`);
  await db.prepare('DELETE FROM games WHERE game_date >= ? AND game_date <= ?').run([startDate, endDate]);
  await db.prepare('DELETE FROM daily_players WHERE game_date >= ? AND game_date <= ?').run([startDate, endDate]);
  
  const insertGameStmt = db.prepare(`
    INSERT INTO games (external_id, game_date, status, tipoff, home_team_id, home_team_name, visitor_team_id, visitor_team_name, home_score, visitor_score, season)
    VALUES (@external_id, @game_date, @status, @tipoff, @home_team_id, @home_team_name, @visitor_team_id, @visitor_team_name, @home_score, @visitor_score, @season)
    ON CONFLICT(external_id) DO UPDATE SET
      status = excluded.status,
      home_score = excluded.home_score,
      visitor_score = excluded.visitor_score
  `);

  let totalGames = 0;
  for (const game of games) {
    await insertGameStmt.run({
      external_id: game.gameId,
      game_date: game.gameDate,
      status: game.status,
      tipoff: game.gameTimeBeijing,
      home_team_id: game.homeTeamId,
      home_team_name: game.homeTeamNameCn,
      visitor_team_id: game.awayTeamId,
      visitor_team_name: game.awayTeamNameCn,
      home_score: game.homeScore,
      visitor_score: game.awayScore,
      season: config.currentSeason,
    });
    totalGames++;
  }

  // 获取BBR球员场均数据
  console.log('Fetching BBR player stats...');
  const allPlayerStats = await getBBRAllPlayerStats();
  
  // 按球队分组
  const playersByTeam = new Map<number, typeof allPlayerStats>();
  for (const player of allPlayerStats) {
    if (!playersByTeam.has(player.teamId)) {
      playersByTeam.set(player.teamId, []);
    }
    playersByTeam.get(player.teamId)!.push(player);
  }
  
  const insertPlayerStmt = db.prepare(`
    INSERT INTO daily_players (game_date, team_id, team_name, player_id, player_name, position, season_avg, stats_points, stats_rebounds, stats_assists, stats_status)
    VALUES (@game_date, @team_id, @team_name, @player_id, @player_name, @position, @season_avg, @stats_points, @stats_rebounds, @stats_assists, @stats_status)
    ON CONFLICT(game_date, player_id) DO UPDATE SET
      team_id = excluded.team_id,
      team_name = excluded.team_name,
      position = excluded.position,
      season_avg = excluded.season_avg,
      stats_points = excluded.stats_points,
      stats_rebounds = excluded.stats_rebounds,
      stats_assists = excluded.stats_assists,
      stats_status = excluded.stats_status
  `);

  // 为每场比赛同步球员数据
  let totalPlayers = 0;
  for (const game of games) {
    // 获取主客队球员（从BBR场均数据中）
    const homePlayers = playersByTeam.get(game.homeTeamId) || [];
    const awayPlayers = playersByTeam.get(game.awayTeamId) || [];
    
    // 如果比赛已结束，获取boxscore数据
    let boxscoreData: Map<string, { points: number; rebounds: number; assists: number }> | null = null;
    if (game.status === 'Final') {
      try {
        const boxscore = await getBBRBoxscore(game.gameDate, game.homeTeamId, game.nbaGameDate);
        if (boxscore) {
          boxscoreData = new Map();
          for (const p of [...boxscore.homePlayers, ...boxscore.awayPlayers]) {
            boxscoreData.set(p.playerName.toLowerCase(), {
              points: p.points,
              rebounds: p.rebounds,
              assists: p.assists,
            });
          }
        }
      } catch (e) {
        console.log(`Failed to get boxscore for ${game.gameDate}`);
      }
    }
    
    for (const player of homePlayers) {
      const boxscoreStats = boxscoreData?.get(player.playerName.toLowerCase());
      await insertPlayerStmt.run({
        game_date: game.gameDate,
        team_id: game.homeTeamId,
        team_name: game.homeTeamNameCn,
        player_id: hashString(player.playerId),
        player_name: player.playerName,
        position: player.position || '',
        season_avg: player.pointsPerGame,
        stats_points: boxscoreStats?.points || 0,
        stats_rebounds: boxscoreStats?.rebounds || 0,
        stats_assists: boxscoreStats?.assists || 0,
        stats_status: game.status === 'Final' ? 'played' : 'scheduled',
      });
      totalPlayers++;
    }
    
    for (const player of awayPlayers) {
      const boxscoreStats = boxscoreData?.get(player.playerName.toLowerCase());
      await insertPlayerStmt.run({
        game_date: game.gameDate,
        team_id: game.awayTeamId,
        team_name: game.awayTeamNameCn,
        player_id: hashString(player.playerId),
        player_name: player.playerName,
        position: player.position || '',
        season_avg: player.pointsPerGame,
        stats_points: boxscoreStats?.points || 0,
        stats_rebounds: boxscoreStats?.rebounds || 0,
        stats_assists: boxscoreStats?.assists || 0,
        stats_status: game.status === 'Final' ? 'played' : 'scheduled',
      });
      totalPlayers++;
    }
    
    // 如果有boxscore数据，插入那些不在BBR场均数据中但有得分的球员（复用已获取的boxscoreData）
    if (boxscoreData && game.status === 'Final') {
      const existingNames = new Set([
        ...homePlayers.map(p => p.playerName.toLowerCase()),
        ...awayPlayers.map(p => p.playerName.toLowerCase()),
      ]);
      
      try {
        const boxscore = await getBBRBoxscore(game.gameDate, game.homeTeamId, game.nbaGameDate);
        if (boxscore) {
          for (const p of boxscore.homePlayers) {
            if (!existingNames.has(p.playerName.toLowerCase())) {
              await insertPlayerStmt.run({
                game_date: game.gameDate,
                team_id: game.homeTeamId,
                team_name: game.homeTeamNameCn,
                player_id: hashString(p.playerId || p.playerName),
                player_name: p.playerName,
                position: '',
                season_avg: 0,
                stats_points: p.points,
                stats_rebounds: p.rebounds,
                stats_assists: p.assists,
                stats_status: 'played',
              });
              totalPlayers++;
            }
          }
          for (const p of boxscore.awayPlayers) {
            if (!existingNames.has(p.playerName.toLowerCase())) {
              await insertPlayerStmt.run({
                game_date: game.gameDate,
                team_id: game.awayTeamId,
                team_name: game.awayTeamNameCn,
                player_id: hashString(p.playerId || p.playerName),
                player_name: p.playerName,
                position: '',
                season_avg: 0,
                stats_points: p.points,
                stats_rebounds: p.rebounds,
                stats_assists: p.assists,
                stats_status: 'played',
              });
              totalPlayers++;
            }
          }
        }
      } catch (e) {
        console.log(`Failed to insert extra boxscore players for ${game.gameDate}`);
      }
    }
  }

  console.log(`Synced ${totalGames} games and ${totalPlayers} players`);
  return { games: totalGames, players: totalPlayers };
};

/**
 * 快速刷新当天比赛比分（仅当天）
 */
export const refreshTodayScores = async (targetDate?: string) => {
  const dateKey = targetDate || getTodayBeijing();
  console.log(`Refreshing scores for ${dateKey}...`);
  
  // 仅获取当天的比赛
  const games = await getGamesInRange(dateKey, dateKey);
  
  if (games.length === 0) {
    return { date: dateKey, games: 0, updated: 0, playersUpdated: 0, allFinished: true };
  }
  
  const updateGameStmt = db.prepare(`
    UPDATE games 
    SET home_score = ?, visitor_score = ?, status = ?
    WHERE external_id = ?
  `);
  
  const updatePlayerStmt = db.prepare(`
    UPDATE daily_players
    SET stats_points = ?, stats_rebounds = ?, stats_assists = ?, stats_status = ?
    WHERE game_date = ? AND player_name = ?
  `);
  
  // 如果球员不存在，则插入新记录
  const insertPlayerStmt = db.prepare(`
    INSERT OR IGNORE INTO daily_players (game_date, team_id, team_name, player_id, player_name, position, season_avg, stats_points, stats_rebounds, stats_assists, stats_status)
    VALUES (?, ?, ?, ?, ?, '', 0, ?, ?, ?, 'played')
  `);
  
  let updated = 0;
  let playersUpdated = 0;
  let allFinished = true;
  
  for (const game of games) {
    // 更新比分
    await updateGameStmt.run([
      game.homeScore,
      game.awayScore,
      game.status,
      game.gameId,
    ]);
    updated++;
    
    console.log(`  Updated: ${game.awayTeamNameCn} @ ${game.homeTeamNameCn}: ${game.awayScore}-${game.homeScore} (${game.status})`);
    
    if (game.status !== 'Final') {
      allFinished = false;
    }
    
    // 如果比赛已结束，从BBR获取球员得分
    if (game.status === 'Final') {
      const boxscore = await getBBRBoxscore(game.gameDate, game.homeTeamId, game.nbaGameDate);
      
      if (boxscore) {
        // 处理主队球员
        for (const player of boxscore.homePlayers) {
          const result = await updatePlayerStmt.run([
            player.points,
            player.rebounds,
            player.assists,
            'played',
            dateKey,
            player.playerName,
          ]) as any;
          
          if (result?.changes > 0) {
            playersUpdated++;
          } else {
            // 球员不存在，插入新记录
            await insertPlayerStmt.run([
              dateKey,
              game.homeTeamId,
              game.homeTeamNameCn,
              hashString(player.playerId || player.playerName),
              player.playerName,
              player.points,
              player.rebounds,
              player.assists,
            ]);
            playersUpdated++;
          }
        }
        
        // 处理客队球员
        for (const player of boxscore.awayPlayers) {
          const result = await updatePlayerStmt.run([
            player.points,
            player.rebounds,
            player.assists,
            'played',
            dateKey,
            player.playerName,
          ]) as any;
          
          if (result?.changes > 0) {
            playersUpdated++;
          } else {
            // 球员不存在，插入新记录
            await insertPlayerStmt.run([
              dateKey,
              game.awayTeamId,
              game.awayTeamNameCn,
              hashString(player.playerId || player.playerName),
              player.playerName,
              player.points,
              player.rebounds,
              player.assists,
            ]);
            playersUpdated++;
          }
        }
      }
    }
  }
  
  console.log(`Updated ${updated} games, ${playersUpdated} players. All finished: ${allFinished}`);
  return { date: dateKey, games: games.length, updated, playersUpdated, allFinished };
};

/**
 * 更新赛程（当天前后7个比赛日）
 */
export const syncSeasonSchedule = async () => {
  console.log('Updating schedule (today ± 7 days)...');
  
  const today = getTodayBeijing();
  const startDate = addDays(today, -7);
  const endDate = addDays(today, 7);
  
  const games = await getGamesInRange(startDate, endDate);
  
  const insertGameStmt = db.prepare(`
    INSERT INTO games (external_id, game_date, status, tipoff, home_team_id, home_team_name, visitor_team_id, visitor_team_name, home_score, visitor_score, season)
    VALUES (@external_id, @game_date, @status, @tipoff, @home_team_id, @home_team_name, @visitor_team_id, @visitor_team_name, @home_score, @visitor_score, @season)
    ON CONFLICT(external_id) DO UPDATE SET
      status = excluded.status,
      tipoff = excluded.tipoff,
      home_score = excluded.home_score,
      visitor_score = excluded.visitor_score
  `);
  
  let totalGames = 0;
  for (const game of games) {
    await insertGameStmt.run({
      external_id: game.gameId,
      game_date: game.gameDate,
      status: game.status,
      tipoff: game.gameTimeBeijing,
      home_team_id: game.homeTeamId,
      home_team_name: game.homeTeamNameCn,
      visitor_team_id: game.awayTeamId,
      visitor_team_name: game.awayTeamNameCn,
      home_score: game.homeScore,
      visitor_score: game.awayScore,
      season: config.currentSeason,
    });
    totalGames++;
  }
  
  console.log(`Synced ${totalGames} games to schedule`);
  return { games: totalGames };
};

// ==================== 查询函数 ====================

export const getGamesForDate = async (date: string) => {
  const games = await db.prepare(`
    SELECT * FROM games WHERE game_date = ? ORDER BY tipoff ASC
  `).all([date]);
  return games;
};

export const getPlayersForDate = async (date: string) => {
  const players = await db.prepare(`
    SELECT * FROM daily_players WHERE game_date = ?
  `).all([date]);
  return players;
};

/**
 * 获取即将到来的比赛日期列表
 */
export const getUpcomingGameDates = async (limit: number = 7): Promise<string[]> => {
  const today = getTodayBeijing();
  const startDate = addDays(today, -3);
  
  const stmt = db.prepare(`
    SELECT DISTINCT game_date 
    FROM games 
    WHERE game_date >= ?
    ORDER BY game_date ASC
    LIMIT ?
  `);
  const rows = await stmt.all([startDate, limit]) as any[];
  return rows.map(r => r.game_date);
};

/**
 * 获取日期范围内的比赛（包含球员数据）
 */
export const getGamesByDateRange = async (start: string, end: string) => {
  const stmt = db.prepare(`
    SELECT * FROM games 
    WHERE game_date >= ? AND game_date <= ?
    ORDER BY game_date ASC, tipoff ASC
  `);
  const games = await stmt.all([start, end]) as any[];
  
  // 获取日期范围内的所有球员
  const playersStmt = db.prepare(`
    SELECT * FROM daily_players 
    WHERE game_date >= ? AND game_date <= ?
  `);
  const allPlayers = await playersStmt.all([start, end]) as any[];
  
  // 按日期和球队分组球员
  const playersByDateAndTeam = new Map<string, Map<number, any[]>>();
  for (const player of allPlayers) {
    const dateKey = player.game_date;
    if (!playersByDateAndTeam.has(dateKey)) {
      playersByDateAndTeam.set(dateKey, new Map());
    }
    const teamMap = playersByDateAndTeam.get(dateKey)!;
    if (!teamMap.has(player.team_id)) {
      teamMap.set(player.team_id, []);
    }
    teamMap.get(player.team_id)!.push(player);
  }
  
  // 按日期分组
  const result: { date: string; games: any[] }[] = [];
  const dateMap = new Map<string, any[]>();
  
  for (const game of games) {
    if (!dateMap.has(game.game_date)) {
      dateMap.set(game.game_date, []);
    }
    
    // 获取该日期该比赛的球员
    const teamMap = playersByDateAndTeam.get(game.game_date) || new Map();
    const homePlayers = (teamMap.get(game.home_team_id) || [])
      .sort((a: any, b: any) => (b.season_avg || 0) - (a.season_avg || 0));
    const visitorPlayers = (teamMap.get(game.visitor_team_id) || [])
      .sort((a: any, b: any) => (b.season_avg || 0) - (a.season_avg || 0));
    
    dateMap.get(game.game_date)!.push({
      ...game,
      home_players: homePlayers,
      visitor_players: visitorPlayers,
    });
  }
  
  for (const [date, dateGames] of dateMap) {
    result.push({ date, games: dateGames });
  }
  
  // 按日期排序
  result.sort((a, b) => a.date.localeCompare(b.date));
  
  return result;
};

/**
 * 获取指定日期的比赛及球员数据
 */
export const getGamesWithPlayers = async (date: string) => {
  // 获取比赛
  const games = await db.prepare(`
    SELECT * FROM games WHERE game_date = ? ORDER BY tipoff ASC
  `).all([date]) as any[];
  
  // 获取球员
  const players = await db.prepare(`
    SELECT * FROM daily_players WHERE game_date = ?
  `).all([date]) as any[];
  
  // 按球队分组球员
  const playersByTeam = new Map<number, any[]>();
  for (const player of players) {
    if (!playersByTeam.has(player.team_id)) {
      playersByTeam.set(player.team_id, []);
    }
    playersByTeam.get(player.team_id)!.push(player);
  }
  
  // 组装结果（使用前端期望的字段名）
  return games.map(game => ({
    ...game,
    home_players: (playersByTeam.get(game.home_team_id) || []).sort((a: any, b: any) => (b.season_avg || 0) - (a.season_avg || 0)),
    visitor_players: (playersByTeam.get(game.visitor_team_id) || []).sort((a: any, b: any) => (b.season_avg || 0) - (a.season_avg || 0)),
  }));
};

/**
 * 获取下一个比赛日的球员数据
 */
export const getNextGameDayPlayers = async (targetDate?: string) => {
  const dateKey = targetDate || getTodayBeijing();
  
  // 查找下一个有比赛的日期
  const nextDateRow = await db.prepare(`
    SELECT DISTINCT game_date 
    FROM games 
    WHERE game_date >= ?
    ORDER BY game_date ASC
    LIMIT 1
  `).get([dateKey]) as any;
  
  if (!nextDateRow) {
    return { date: null, games: [], players: [] };
  }
  
  const nextDate = nextDateRow.game_date;
  
  // 获取该日期的比赛和球员
  const games = await getGamesWithPlayers(nextDate);
  const players = await getPlayersForDate(nextDate);
  
  return { date: nextDate, games, players };
};

export const getGameTimeline = async (startDate: string, days: number) => {
  const timeline: { date: string; games: any[] }[] = [];
  
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const games = await getGamesForDate(date);
    timeline.push({ date, games: games as any[] });
  }
  
  return timeline;
};

// ==================== 球员选择函数 ====================

export const selectPlayer = async (playMode: string, playerId: number, gameDate: string, teamId: number) => {
  const stmt = db.prepare(`
    INSERT INTO player_selections (play_mode, player_id, game_date, team_id, selected_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(play_mode, player_id, game_date) DO UPDATE SET
      team_id = excluded.team_id,
      selected_at = excluded.selected_at
  `);
  await stmt.run([playMode, playerId, gameDate, teamId]);
};

export const deselectPlayer = async (playMode: string, playerId: number, gameDate: string) => {
  const stmt = db.prepare(`
    DELETE FROM player_selections
    WHERE play_mode = ? AND player_id = ? AND game_date = ?
  `);
  await stmt.run([playMode, playerId, gameDate]);
};

export const getSelectedPlayers = async (playMode: string, gameDate: string) => {
  const stmt = db.prepare(`
    SELECT ps.*, dp.player_name, dp.team_name, dp.season_avg, dp.stats_points, dp.stats_rebounds, dp.stats_assists
    FROM player_selections ps
    JOIN daily_players dp ON ps.player_id = dp.player_id AND ps.game_date = dp.game_date
    WHERE ps.play_mode = ? AND ps.game_date = ?
  `);
  return stmt.all([playMode, gameDate]);
};

// ==================== 冻结球员函数 ====================

export const freezePlayer = async (playMode: string, playerId: number, gameDate: string, teamId: number) => {
  const stmt = db.prepare(`
    INSERT INTO frozen_players (play_mode, player_id, game_date, team_id, frozen_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(play_mode, player_id, game_date) DO NOTHING
  `);
  await stmt.run([playMode, playerId, gameDate, teamId]);
};

export const unfreezePlayer = async (playMode: string, playerId: number, gameDate: string) => {
  const stmt = db.prepare(`
    DELETE FROM frozen_players
    WHERE play_mode = ? AND player_id = ? AND game_date = ?
  `);
  await stmt.run([playMode, playerId, gameDate]);
};

export const getFrozenPlayers = async (playMode: string, gameDate: string) => {
  const stmt = db.prepare(`
    SELECT fp.*, dp.player_name, dp.team_name, dp.season_avg, dp.stats_points
    FROM frozen_players fp
    JOIN daily_players dp ON fp.player_id = dp.player_id AND fp.game_date = dp.game_date
    WHERE fp.play_mode = ? AND fp.game_date = ?
  `);
  return stmt.all([playMode, gameDate]);
};

// ==================== 锁定信息函数 ====================

export const getLockInfo = async (playMode: string, gameDate: string) => {
  const stmt = db.prepare(`
    SELECT * FROM lock_info
    WHERE play_mode = ? AND game_date = ?
  `);
  return stmt.get([playMode, gameDate]);
};

export const setLockInfo = async (playMode: string, gameDate: string, isLocked: boolean, lockedAt?: string) => {
  const stmt = db.prepare(`
    INSERT INTO lock_info (play_mode, game_date, is_locked, locked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(play_mode, game_date) DO UPDATE SET
      is_locked = excluded.is_locked,
      locked_at = excluded.locked_at
  `);
  await stmt.run([playMode, gameDate, isLocked ? 1 : 0, lockedAt || null]);
};
