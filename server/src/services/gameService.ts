import db from '../db';
import { config } from '../config';
import fetch from 'node-fetch';

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
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

// ==================== SportsBlaze 增量抓取 ====================

const SB_BASE = 'https://api.sportsblaze.com/nba/v1';
const SB_TEAM_NAME_TO_ID: Record<string, number> = {
  'Atlanta Hawks': 1610612737, 'Boston Celtics': 1610612738,
  'Brooklyn Nets': 1610612751, 'Charlotte Hornets': 1610612766,
  'Chicago Bulls': 1610612741, 'Cleveland Cavaliers': 1610612739,
  'Dallas Mavericks': 1610612742, 'Denver Nuggets': 1610612743,
  'Detroit Pistons': 1610612765, 'Golden State Warriors': 1610612744,
  'Houston Rockets': 1610612745, 'Indiana Pacers': 1610612754,
  'LA Clippers': 1610612746, 'Los Angeles Clippers': 1610612746,
  'Los Angeles Lakers': 1610612747, 'Memphis Grizzlies': 1610612763,
  'Miami Heat': 1610612748, 'Milwaukee Bucks': 1610612749,
  'Minnesota Timberwolves': 1610612750, 'New Orleans Pelicans': 1610612740,
  'New York Knicks': 1610612752, 'Oklahoma City Thunder': 1610612760,
  'Orlando Magic': 1610612753, 'Philadelphia 76ers': 1610612755,
  'Phoenix Suns': 1610612756, 'Portland Trail Blazers': 1610612757,
  'Sacramento Kings': 1610612758, 'San Antonio Spurs': 1610612759,
  'Toronto Raptors': 1610612761, 'Utah Jazz': 1610612762,
  'Washington Wizards': 1610612764,
};
const SB_TEAM_NAME_TO_ABBR: Record<string, string> = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BRK',
  'Charlotte Hornets': 'CHO', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'LA Clippers': 'LAC', 'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHO',
  'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * 增量更新 player_game_log：只抓取 sb_fetch_log 中缺失的日期
 */
async function updateGameLogIncremental() {
  const season = config.currentSeason;
  const yesterday = addDays(getTodayBeijing(), -1);

  const latestRow = await db.prepare(
    `SELECT MAX(date_key) as latest FROM sb_fetch_log WHERE season = ?`
  ).get([season]) as any;
  const latestDate = latestRow?.latest || `${season}-10-20`;

  // 找出缺失的日期
  const missing: string[] = [];
  let cur = addDays(latestDate, 1);
  while (cur <= yesterday) {
    const exists = await db.prepare(
      `SELECT 1 FROM sb_fetch_log WHERE date_key = ? AND season = ?`
    ).get([cur, season]);
    if (!exists) missing.push(cur);
    cur = addDays(cur, 1);
  }

  if (missing.length === 0) return;
  console.log(`[game-log] ${missing.length} new dates to fetch: ${missing[0]} ~ ${missing[missing.length - 1]}`);

  for (const dateStr of missing) {
    await sleep(6000);
    try {
      const url = `${SB_BASE}/boxscores/daily/${dateStr}.json?key=${config.sportsBlazeApiKey}`;
      const res = await fetch(url);

      if (res.status === 429) {
        console.warn(`[game-log] 429 for ${dateStr}, stopping incremental update`);
        break;
      }
      if (res.status === 404 || !res.ok) {
        await db.prepare(
          `INSERT INTO sb_fetch_log (date_key, season, games_count, players_count) VALUES (?, ?, 0, 0)
           ON CONFLICT(date_key, season) DO UPDATE SET games_count=0, players_count=0, fetched_at=datetime('now')`
        ).run([dateStr, season]);
        console.log(`[game-log] ${dateStr}: no data`);
        continue;
      }

      const data = await res.json() as any;
      if (data?.error || !data?.games) {
        await db.prepare(
          `INSERT INTO sb_fetch_log (date_key, season, games_count, players_count) VALUES (?, ?, 0, 0)
           ON CONFLICT(date_key, season) DO UPDATE SET games_count=0, players_count=0, fetched_at=datetime('now')`
        ).run([dateStr, season]);
        continue;
      }

      let gamesCount = 0, playersCount = 0;
      const upsertStmt = db.prepare(`
        INSERT INTO player_game_log (player_sb_id, game_date, player_name, team_name, team_id, team_abbr, position, points, rebounds, assists, minutes, season)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_sb_id, game_date) DO UPDATE SET
          player_name=excluded.player_name, team_name=excluded.team_name, team_id=excluded.team_id,
          team_abbr=excluded.team_abbr, position=CASE WHEN excluded.position!='' THEN excluded.position ELSE player_game_log.position END,
          points=excluded.points, rebounds=excluded.rebounds, assists=excluded.assists, minutes=excluded.minutes
      `);

      for (const game of data.games) {
        if (game.status !== 'Final') continue;
        gamesCount++;
        const processRoster = async (roster: any[], teamName: string) => {
          if (!roster || !teamName) return;
          const teamId = SB_TEAM_NAME_TO_ID[teamName] || 0;
          const teamAbbr = SB_TEAM_NAME_TO_ABBR[teamName] || '';
          for (const p of roster) {
            if (!p.id || !p.name || !p.played || !p.stats) continue;
            await upsertStmt.run([p.id, dateStr, p.name, teamName, teamId, teamAbbr,
              p.position || '', p.stats.points ?? 0, p.stats.rebounds ?? 0,
              p.stats.assists ?? 0, p.stats.minutes ?? 0, season]);
            playersCount++;
          }
        };
        await processRoster(game.rosters?.away, game.teams?.away?.name);
        await processRoster(game.rosters?.home, game.teams?.home?.name);
      }

      await db.prepare(
        `INSERT INTO sb_fetch_log (date_key, season, games_count, players_count) VALUES (?, ?, ?, ?)
         ON CONFLICT(date_key, season) DO UPDATE SET games_count=excluded.games_count, players_count=excluded.players_count, fetched_at=datetime('now')`
      ).run([dateStr, season, gamesCount, playersCount]);

      if (gamesCount > 0) console.log(`[game-log] ${dateStr}: ${gamesCount} games, ${playersCount} players`);
    } catch (e: any) {
      console.error(`[game-log] ${dateStr}: network error - ${e.message}`);
      break;
    }
  }
}

/**
 * 用 player_game_log 全赛季数据批量修正 daily_players.season_avg
 */
async function fixSeasonAvg(startDate: string, endDate: string) {
  const season = config.currentSeason;

  const avgs = await db.prepare(`
    SELECT a.player_name, b.ppg
    FROM player_game_log a
    INNER JOIN (
      SELECT player_sb_id, MAX(game_date) as last_date, ROUND(AVG(points), 1) as ppg
      FROM player_game_log WHERE season = ?
      GROUP BY player_sb_id
    ) b ON a.player_sb_id = b.player_sb_id AND a.game_date = b.last_date
    WHERE a.season = ?
  `).all([season, season]) as any[];

  if (avgs.length === 0) return;

  const avgMap = new Map<string, number>();
  for (const r of avgs) {
    avgMap.set(r.player_name.toLowerCase(), r.ppg);
  }

  const players = await db.prepare(
    `SELECT DISTINCT player_name FROM daily_players WHERE game_date >= ? AND game_date <= ?`
  ).all([startDate, endDate]) as any[];

  let updated = 0;
  for (const p of players) {
    const ppg = avgMap.get(p.player_name.toLowerCase());
    if (ppg !== undefined) {
      await db.prepare(
        `UPDATE daily_players SET season_avg = ? WHERE player_name = ? AND game_date >= ? AND game_date <= ?`
      ).run([ppg, p.player_name, startDate, endDate]);
      updated++;
    }
  }

  if (updated > 0) console.log(`[fix-avg] Updated season_avg for ${updated} players`);
}

// ==================== 数据库操作 ====================

/**
 * 同步比赛数据到数据库
 */
export const syncDailyData = async (targetDate?: string) => {
  const dateKey = targetDate || getTodayBeijing();
  console.log(`Syncing data for ${dateKey}...`);

  // 增量抓取 player_game_log 中缺失的日期
  try {
    await updateGameLogIncremental();
  } catch (e: any) {
    console.warn(`[game-log] incremental update failed: ${e.message}`);
  }

  const startDate = addDays(dateKey, -7);
  const endDate = addDays(dateKey, 7);
  
  const games = await getGamesInRange(startDate, endDate);
  
  // 仅清理最近 ±1 天的 daily_players（状态可能有变化的日期）
  // 不再删除 games 表（依赖 UPSERT 更新）
  const freshStart = addDays(dateKey, -1);
  const freshEnd = addDays(dateKey, 1);
  console.log(`Refreshing daily_players for ${freshStart} to ${freshEnd}...`);
  await db.prepare('DELETE FROM daily_players WHERE game_date >= ? AND game_date <= ?').run([freshStart, freshEnd]);
  
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

  // 获取球员场均数据
  console.log('Fetching player stats...');
  const allPlayerStats = await getBBRAllPlayerStats();
  
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

  // 检查哪些日期已有完整的球员数据（已 Final 的历史比赛）
  const existingDates = new Set<string>();
  const existingRows = await db.prepare(
    `SELECT DISTINCT game_date FROM daily_players WHERE game_date >= ? AND game_date <= ? AND stats_status = 'played'`
  ).all([startDate, endDate]) as any[];
  for (const row of existingRows) existingDates.add(row.game_date);

  let totalPlayers = 0;
  let skippedGames = 0;
  for (const game of games) {
    // 跳过已有完整球员数据的历史 Final 比赛（不在刷新窗口内）
    const inFreshWindow = game.gameDate >= freshStart && game.gameDate <= freshEnd;
    if (!inFreshWindow && game.status === 'Final' && existingDates.has(game.gameDate)) {
      skippedGames++;
      continue;
    }

    const homePlayers = playersByTeam.get(game.homeTeamId) || [];
    const awayPlayers = playersByTeam.get(game.awayTeamId) || [];
    
    // 仅对需要刷新的 Final 比赛获取 boxscore
    let boxscoreResult: { homePlayers: any[]; awayPlayers: any[] } | null = null;
    let boxscoreData: Map<string, { points: number; rebounds: number; assists: number }> | null = null;
    if (game.status === 'Final') {
      try {
        boxscoreResult = await getBBRBoxscore(game.gameDate, game.homeTeamId, game.nbaGameDate);
        if (boxscoreResult) {
          boxscoreData = new Map();
          for (const p of [...boxscoreResult.homePlayers, ...boxscoreResult.awayPlayers]) {
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
    
    if (boxscoreResult && game.status === 'Final') {
      const existingNames = new Set([
        ...homePlayers.map(p => p.playerName.toLowerCase()),
        ...awayPlayers.map(p => p.playerName.toLowerCase()),
      ]);
      
      for (const p of boxscoreResult.homePlayers) {
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
      for (const p of boxscoreResult.awayPlayers) {
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
  }

  console.log(`Synced ${totalGames} games, ${totalPlayers} players (skipped ${skippedGames} games with existing data)`);

  // 用 player_game_log 全赛季数据修正 season_avg
  try {
    await fixSeasonAvg(startDate, endDate);
  } catch (e: any) {
    console.warn(`[fix-avg] failed: ${e.message}`);
  }

  return { games: totalGames, players: totalPlayers };
};

/**
 * 轻量同步单日数据：仅拉取指定日期的赛程+球员，用于前端刷新按钮
 */
export const syncSingleDate = async (dateKey: string) => {
  console.log(`[sync-single] ${dateKey}`);

  const games = await getGamesInRange(dateKey, dateKey);
  if (games.length === 0) {
    return { date: dateKey, games: 0, players: 0 };
  }

  // UPSERT games
  const insertGameStmt = db.prepare(`
    INSERT INTO games (external_id, game_date, status, tipoff, home_team_id, home_team_name, visitor_team_id, visitor_team_name, home_score, visitor_score, season)
    VALUES (@external_id, @game_date, @status, @tipoff, @home_team_id, @home_team_name, @visitor_team_id, @visitor_team_name, @home_score, @visitor_score, @season)
    ON CONFLICT(external_id) DO UPDATE SET
      status = excluded.status,
      home_score = excluded.home_score,
      visitor_score = excluded.visitor_score
  `);

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
  }

  // 清理该日的 daily_players 以便重新写入
  await db.prepare('DELETE FROM daily_players WHERE game_date = ?').run([dateKey]);

  const allPlayerStats = await getBBRAllPlayerStats();
  const playersByTeam = new Map<number, typeof allPlayerStats>();
  for (const player of allPlayerStats) {
    if (!playersByTeam.has(player.teamId)) playersByTeam.set(player.teamId, []);
    playersByTeam.get(player.teamId)!.push(player);
  }

  const insertPlayerStmt = db.prepare(`
    INSERT INTO daily_players (game_date, team_id, team_name, player_id, player_name, position, season_avg, stats_points, stats_rebounds, stats_assists, stats_status)
    VALUES (@game_date, @team_id, @team_name, @player_id, @player_name, @position, @season_avg, @stats_points, @stats_rebounds, @stats_assists, @stats_status)
    ON CONFLICT(game_date, player_id) DO UPDATE SET
      team_id = excluded.team_id, team_name = excluded.team_name, position = excluded.position,
      season_avg = excluded.season_avg, stats_points = excluded.stats_points,
      stats_rebounds = excluded.stats_rebounds, stats_assists = excluded.stats_assists, stats_status = excluded.stats_status
  `);

  let totalPlayers = 0;
  for (const game of games) {
    let boxscoreData: Map<string, { points: number; rebounds: number; assists: number }> | null = null;
    if (game.status === 'Final') {
      try {
        const boxscoreResult = await getBBRBoxscore(game.gameDate, game.homeTeamId, game.nbaGameDate);
        if (boxscoreResult) {
          boxscoreData = new Map();
          for (const p of [...boxscoreResult.homePlayers, ...boxscoreResult.awayPlayers]) {
            boxscoreData.set(p.playerName.toLowerCase(), { points: p.points, rebounds: p.rebounds, assists: p.assists });
          }
        }
      } catch (_) {}
    }

    const sides = [
      { players: playersByTeam.get(game.homeTeamId) || [], teamId: game.homeTeamId, teamName: game.homeTeamNameCn },
      { players: playersByTeam.get(game.awayTeamId) || [], teamId: game.awayTeamId, teamName: game.awayTeamNameCn },
    ];
    const existingNames = new Set<string>();

    for (const side of sides) {
      for (const player of side.players) {
        const bs = boxscoreData?.get(player.playerName.toLowerCase());
        await insertPlayerStmt.run({
          game_date: game.gameDate, team_id: side.teamId, team_name: side.teamName,
          player_id: hashString(player.playerId), player_name: player.playerName,
          position: player.position || '', season_avg: player.pointsPerGame,
          stats_points: bs?.points || 0, stats_rebounds: bs?.rebounds || 0, stats_assists: bs?.assists || 0,
          stats_status: game.status === 'Final' ? 'played' : 'scheduled',
        });
        existingNames.add(player.playerName.toLowerCase());
        totalPlayers++;
      }
    }

  }

  // 修正 season_avg
  try { await fixSeasonAvg(dateKey, dateKey); } catch (_) {}

  console.log(`[sync-single] ${dateKey}: ${games.length} games, ${totalPlayers} players`);
  return { date: dateKey, games: games.length, players: totalPlayers };
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

// ==================== 智能刷新检查 ====================

/**
 * 检查是否需要同步：
 * 1. 数据库里最新的 daily_players 日期早于今天
 * 2. 今天有比赛且第一场已经开赛
 * 返回 { shouldSync, reason }
 */
export const shouldSync = async (): Promise<{ shouldSync: boolean; reason: string }> => {
  const today = getTodayBeijing();

  // 检查 daily_players 最新日期
  const latestRow = await db.prepare(
    `SELECT MAX(game_date) as latest FROM daily_players WHERE stats_status = 'played'`
  ).get() as any;
  const latestDate = latestRow?.latest;

  // 如果没有任何数据，必须同步
  if (!latestDate) {
    return { shouldSync: true, reason: 'no data in database' };
  }

  // 检查 player_game_log 最新抓取日期
  const latestFetchRow = await db.prepare(
    `SELECT MAX(date_key) as latest FROM sb_fetch_log WHERE games_count > 0`
  ).get() as any;
  const latestFetchDate = latestFetchRow?.latest;

  // 如果最新抓取日期至少是昨天，说明数据还比较新
  const yesterday = addDays(today, -1);
  if (latestFetchDate && latestFetchDate >= yesterday) {
    // 数据已经是最新的，检查今天是否有新比赛结束
    const unfinishedToday = await db.prepare(
      `SELECT COUNT(*) as c FROM games WHERE game_date = ? AND status != 'Final'`
    ).get([today]) as any;

    if (unfinishedToday?.c === 0) {
      // 今天没有正在进行的比赛
      const todayGames = await db.prepare(
        `SELECT COUNT(*) as c FROM games WHERE game_date = ?`
      ).get([today]) as any;
      if (todayGames?.c > 0) {
        return { shouldSync: false, reason: `today's ${todayGames.c} games all finished, data up to date` };
      }
    }
  }

  // 检查今天是否有比赛
  const todayGames = await db.prepare(
    `SELECT tipoff FROM games WHERE game_date = ? ORDER BY tipoff ASC LIMIT 1`
  ).get([today]) as any;

  if (!todayGames?.tipoff) {
    // DB 里没有今天的比赛信息 —— 可能赛程还没更新
    if (latestFetchDate && latestFetchDate < yesterday) {
      return { shouldSync: true, reason: `game log behind (latest: ${latestFetchDate}), need update` };
    }
    return { shouldSync: false, reason: 'no games scheduled today' };
  }

  // 今天有比赛，检查第一场是否已经开赛
  const firstTipoff = todayGames.tipoff; // 北京时间 "HH:MM" 或 "YYYY-MM-DD HH:MM"
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const currentHHMM = `${String(beijingNow.getUTCHours()).padStart(2, '0')}:${String(beijingNow.getUTCMinutes()).padStart(2, '0')}`;

  // tipoff 可能是 "08:00" (HH:MM) 格式的北京时间
  const tipoffTime = firstTipoff.includes(' ') ? firstTipoff.split(' ')[1] : firstTipoff;

  if (currentHHMM < tipoffTime) {
    return { shouldSync: false, reason: `first game at ${tipoffTime} BJT, hasn't started yet (now: ${currentHHMM})` };
  }

  return { shouldSync: true, reason: `first game started at ${tipoffTime} BJT, time to sync` };
};
