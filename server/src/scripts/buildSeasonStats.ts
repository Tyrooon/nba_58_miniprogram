/**
 * 赛季球员数据批量构建脚本
 *
 * 从 SportsBlaze API 逐日获取本赛季所有比赛 boxscores，
 * 将每位球员每场比赛的数据写入 player_game_log 表。
 * 支持断点续传 —— 已处理的日期记录在 sb_fetch_log 中。
 *
 * 用法:
 *   npx ts-node src/scripts/buildSeasonStats.ts          # 一次完整跑完
 *   npx ts-node src/scripts/buildSeasonStats.ts --batch 30  # 每次处理 30 天
 *   npx ts-node src/scripts/buildSeasonStats.ts --from 2026-02-20 --to 2026-02-27  # 仅重跑指定日期
 */

import fetch from 'node-fetch';
import db from '../db';
import { config } from '../config';

// ==================== SportsBlaze 配置 ====================

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
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BRK', 'Charlotte Hornets': 'CHO',
  'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET', 'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'LA Clippers': 'LAC', 'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHO', 'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
};

// ==================== 工具函数 ====================

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ==================== API 请求 ====================

const REQUEST_INTERVAL = 6000;
const BACKOFF_ON_429 = 15_000;
const MAX_CONSECUTIVE_429 = 3;

async function fetchBoxscores(dateStr: string): Promise<any | '429' | 'NETWORK_ERROR' | null> {
  const url = `${SB_BASE}/boxscores/daily/${dateStr}.json?key=${config.sportsBlazeApiKey}`;

  try {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (res.status === 429) return '429';
    if (!res.ok) {
      console.error(`  [${res.status}] ${dateStr}`);
      return 'NETWORK_ERROR';
    }
    const data = await res.json() as any;
    if (data?.error) return null;
    return data;
  } catch (e: any) {
    console.error(`  [ERR] ${dateStr}: ${e.message}`);
    return 'NETWORK_ERROR';
  }
}

// ==================== 数据入库 ====================

async function processDate(dateStr: string, season: number): Promise<{ games: number; players: number }> {
  const data = await fetchBoxscores(dateStr);

  if (data === '429') throw new Error('RATE_LIMITED');
  if (data === 'NETWORK_ERROR') throw new Error('NETWORK_ERROR');
  if (!data || !data.games || data.games.length === 0) {
    await logFetchedDate(dateStr, season, 0, 0);
    return { games: 0, players: 0 };
  }

  let gamesCount = 0;
  let playersCount = 0;

  const upsertStmt = db.prepare(`
    INSERT INTO player_game_log
      (player_sb_id, game_date, player_name, team_name, team_id, team_abbr, position, points, rebounds, assists, minutes, season)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_sb_id, game_date) DO UPDATE SET
      player_name = excluded.player_name,
      team_name = excluded.team_name,
      team_id = excluded.team_id,
      team_abbr = excluded.team_abbr,
      position = CASE WHEN excluded.position != '' THEN excluded.position ELSE player_game_log.position END,
      points = excluded.points,
      rebounds = excluded.rebounds,
      assists = excluded.assists,
      minutes = excluded.minutes
  `);

  for (const game of data.games) {
    if (game.status !== 'Final') continue;
    gamesCount++;

    const insertRoster = async (roster: any[], teamName: string) => {
      if (!roster || !teamName) return;
      const teamId = SB_TEAM_NAME_TO_ID[teamName] || 0;
      const teamAbbr = SB_TEAM_NAME_TO_ABBR[teamName] || '';

      for (const p of roster) {
        if (!p.id || !p.name || !p.played || !p.stats) continue;

        await upsertStmt.run([
          p.id, dateStr, p.name, teamName, teamId, teamAbbr,
          p.position || '', p.stats.points ?? 0, p.stats.rebounds ?? 0,
          p.stats.assists ?? 0, p.stats.minutes ?? 0, season,
        ]);
        playersCount++;
      }
    };

    await insertRoster(game.rosters?.away, game.teams?.away?.name);
    await insertRoster(game.rosters?.home, game.teams?.home?.name);
  }

  await logFetchedDate(dateStr, season, gamesCount, playersCount);
  return { games: gamesCount, players: playersCount };
}

async function logFetchedDate(dateStr: string, season: number, games: number, players: number) {
  await db.prepare(`
    INSERT INTO sb_fetch_log (date_key, season, games_count, players_count, fetched_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date_key, season) DO UPDATE SET
      games_count = excluded.games_count,
      players_count = excluded.players_count,
      fetched_at = excluded.fetched_at
  `).run([dateStr, season, games, players]);
}

// ==================== 主流程 ====================

async function main() {
  const season = config.currentSeason;
  const seasonStart = `${season}-10-20`;
  const endDate = getYesterday();

  const fromIdx = process.argv.indexOf('--from');
  const toIdx = process.argv.indexOf('--to');
  const fromDate = fromIdx >= 0 ? process.argv[fromIdx + 1] : '';
  const toDate = toIdx >= 0 ? process.argv[toIdx + 1] : '';

  const batchArg = process.argv.find(a => a === '--batch');
  const batchIdx = process.argv.indexOf('--batch');
  const batchSize = batchIdx >= 0 ? parseInt(process.argv[batchIdx + 1] || '0', 10) : 0;

  let dates: string[] = [];

  if (fromDate && toDate) {
    // 指定日期范围模式：只处理 fromDate 到 toDate，强制重跑
    let cur = fromDate;
    while (cur <= toDate) {
      dates.push(cur);
      cur = addDays(cur, 1);
    }
    // 先删除这些日期的旧数据，确保干净重写
    for (const d of dates) {
      await db.prepare('DELETE FROM player_game_log WHERE game_date = ? AND season = ?').run([d, season]);
      await db.prepare('DELETE FROM sb_fetch_log WHERE date_key = ? AND season = ?').run([d, season]);
    }
    console.log(`\n========== NBA Season ${season}-${season + 1} Stats Builder (Range Mode) ==========`);
    console.log(`  Date range   : ${fromDate} ~ ${toDate}`);
    console.log(`  Dates to run : ${dates.length}`);
  } else {
    // 默认模式：按 sb_fetch_log 断点续传
    const processedRows = await db.prepare(
      'SELECT date_key FROM sb_fetch_log WHERE season = ?'
    ).all([season]) as unknown as any[];
    const processed = new Set(processedRows.map((r: any) => r.date_key));

    let cur = seasonStart;
    while (cur <= endDate) {
      if (!processed.has(cur)) dates.push(cur);
      cur = addDays(cur, 1);
    }

    console.log(`\n========== NBA Season ${season}-${season + 1} Stats Builder ==========`);
    console.log(`  Season start : ${seasonStart}`);
    console.log(`  End date     : ${endDate}`);
    console.log(`  Already done : ${processed.size} dates`);
    console.log(`  Remaining    : ${dates.length} dates`);
  }

  console.log(`  Batch size   : ${batchSize || 'unlimited'}`);
  console.log(`  API interval : ${REQUEST_INTERVAL}ms`);
  console.log('');

  if (dates.length === 0) {
    console.log('\n✅ All dates already processed! Season stats are up to date.\n');
    await printSummary(season);
    process.exit(0);
  }

  const toProcess = batchSize > 0 ? dates.slice(0, batchSize) : dates;
  console.log(`  This run     : ${toProcess.length} dates\n`);

  let totalGames = 0;
  let totalPlayers = 0;
  let consecutive429 = 0;
  let processedCount = 0;

  for (const dateStr of toProcess) {
    if (consecutive429 >= MAX_CONSECUTIVE_429) {
      console.log(`\n⚠️  ${MAX_CONSECUTIVE_429} consecutive rate limits. Stopping. Re-run later to continue.`);
      break;
    }

    await sleep(REQUEST_INTERVAL);

    try {
      const result = await processDate(dateStr, season);
      consecutive429 = 0;
      processedCount++;

      if (result.games > 0) {
        console.log(`  ${dateStr}: ${result.games} games, ${result.players} players ✓`);
      } else {
        console.log(`  ${dateStr}: no games`);
      }

      totalGames += result.games;
      totalPlayers += result.players;
    } catch (e: any) {
      if (e.message === 'RATE_LIMITED') {
        consecutive429++;
        console.log(`  ${dateStr}: 429 rate limited (${consecutive429}/${MAX_CONSECUTIVE_429}), waiting ${BACKOFF_ON_429 / 1000}s...`);
        await sleep(BACKOFF_ON_429);
      } else if (e.message === 'NETWORK_ERROR') {
        console.log(`  ${dateStr}: network error, will retry on next run`);
      } else {
        console.error(`  ${dateStr}: ERROR - ${e.message}`);
      }
    }
  }

  console.log(`\n---------- Run Summary ----------`);
  console.log(`  Dates processed : ${processedCount}`);
  console.log(`  Games found     : ${totalGames}`);
  console.log(`  Player entries  : ${totalPlayers}`);
  console.log(`  Remaining       : ${dates.length - processedCount} dates`);

  await printSummary(season);
  process.exit(0);
}

async function printSummary(season: number) {
  const stats = await db.prepare(`
    SELECT COUNT(DISTINCT player_sb_id) as players,
           COUNT(*) as entries,
           COUNT(DISTINCT game_date) as game_dates
    FROM player_game_log WHERE season = ?
  `).get([season]) as any;

  const fetchLog = await db.prepare(`
    SELECT COUNT(*) as total, SUM(games_count) as games
    FROM sb_fetch_log WHERE season = ?
  `).get([season]) as any;

  console.log(`\n---------- Season ${season} Database ----------`);
  console.log(`  Fetched dates  : ${fetchLog?.total || 0}`);
  console.log(`  Total games    : ${fetchLog?.games || 0}`);
  console.log(`  Unique players : ${stats?.players || 0}`);
  console.log(`  Game log rows  : ${stats?.entries || 0}`);
  console.log(`  Game dates     : ${stats?.game_dates || 0}`);

  const topPlayers = await db.prepare(`
    SELECT player_name, COUNT(*) as gp, ROUND(AVG(points), 1) as ppg
    FROM player_game_log WHERE season = ?
    GROUP BY player_sb_id
    HAVING gp >= 10
    ORDER BY ppg DESC
    LIMIT 10
  `).all([season]) as unknown as any[];

  if (topPlayers.length > 0) {
    console.log(`\n  Top scorers (≥10 games):`);
    for (const p of topPlayers) {
      console.log(`    ${p.player_name}: ${p.ppg} ppg (${p.gp} games)`);
    }
  }
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
