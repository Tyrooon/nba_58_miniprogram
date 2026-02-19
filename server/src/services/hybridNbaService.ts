/**
 * 混合NBA数据服务
 * 
 * 数据来源:
 * 1. NBA官方CDN - 获取赛程和实时比分
 * 2. SportsBlaze API - 获取比赛Boxscore和球员数据
 * 3. NBA CDN Boxscore - 作为SportsBlaze的后备数据源
 */

import fetch from 'node-fetch';
import { config } from '../config';
import db from '../db';

// ==================== 时区转换 ====================

/**
 * 获取北京时间的日期字符串
 */
export function getBeijingDateKey(date?: Date): string {
  const d = date || new Date();
  // 北京时间 = UTC + 8小时
  const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().split('T')[0];
}

/**
 * 获取北京时间今天的日期
 */
export function getTodayBeijing(): string {
  return getBeijingDateKey(new Date());
}

/**
 * 将UTC时间转换为北京时间字符串
 */
export function utcToBeijingTime(utcString: string): string {
  const utcDate = new Date(utcString);
  const beijingTime = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 将UTC时间转换为北京时间的日期部分
 */
export function utcToBeijingDate(utcString: string): string {
  const utcDate = new Date(utcString);
  const beijingTime = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().split('T')[0];
}

/**
 * 增加/减少天数
 */
export function addDays(dateKey: string, days: number): string {
  const date = new Date(dateKey);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// ==================== NBA 官方 API ====================

const NBA_CDN_BASE = 'https://cdn.nba.com/static/json/liveData';
const NBA_STATIC_BASE = 'https://cdn.nba.com/static/json/staticData';
const NBA_STATS_BASE = 'https://stats.nba.com/stats';

const NBA_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
};

// ==================== SportsBlaze API ====================

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

const sbBoxscoreCache = new Map<string, { data: any; fetchedAt: number }>();
const SB_BOXSCORE_CACHE_TTL = 10 * 60 * 1000;
const SB_EMPTY_CACHE_TTL = 60 * 60 * 1000;
let lastSBRequestAt = 0;
const SB_MIN_INTERVAL = 1200;
let sbRateLimitedUntil = 0;

async function fetchSBBoxscores(dateStr: string): Promise<any | null> {
  const now = Date.now();
  const cached = sbBoxscoreCache.get(dateStr);
  if (cached) {
    const ttl = (cached.data?.games?.length > 0) ? SB_BOXSCORE_CACHE_TTL : SB_EMPTY_CACHE_TTL;
    if (now - cached.fetchedAt < ttl) return cached.data;
  }

  if (Date.now() < sbRateLimitedUntil) {
    return cached?.data || null;
  }

  const wait = SB_MIN_INTERVAL - (now - lastSBRequestAt);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastSBRequestAt = Date.now();

  const url = `${SB_BASE}/boxscores/daily/${dateStr}.json?key=${config.sportsBlazeApiKey}`;

  try {
    const res = await fetch(url);
    if (res.status === 404) {
      const empty = { games: [] };
      sbBoxscoreCache.set(dateStr, { data: empty, fetchedAt: Date.now() });
      return empty;
    }
    if (res.status === 429) {
      console.warn(`SportsBlaze rate-limited (429) for ${dateStr}, backing off 120s`);
      sbRateLimitedUntil = Date.now() + 120_000;
      return cached?.data || null;
    }
    if (!res.ok) {
      console.error(`SportsBlaze boxscores ${res.status} for ${dateStr}`);
      return cached?.data || null;
    }
    const data = await res.json() as any;
    if (data?.error) {
      const empty = { games: [] };
      sbBoxscoreCache.set(dateStr, { data: empty, fetchedAt: Date.now() });
      return empty;
    }
    sbBoxscoreCache.set(dateStr, { data, fetchedAt: Date.now() });
    const cnt = data?.games?.length || 0;
    if (cnt > 0) console.log(`  SportsBlaze: ${cnt} games for ${dateStr}`);
    return data;
  } catch (e) {
    console.error(`SportsBlaze fetch error for ${dateStr}:`, e);
    return cached?.data || null;
  }
}

function parseSBRoster(roster: any[], teamName: string): BBRBoxscorePlayer[] {
  if (!roster) return [];
  const teamAbbr = SB_TEAM_NAME_TO_ABBR[teamName] || '';

  return roster
    .filter((p: any) => p.played && p.stats)
    .map((p: any) => ({
      playerId: p.id || '',
      playerName: p.name || '',
      teamAbbr,
      points: p.stats?.points ?? 0,
      rebounds: p.stats?.rebounds ?? 0,
      assists: p.stats?.assists ?? 0,
      minutes: p.stats?.time_on_court || `${p.stats?.minutes || 0}:00`,
    }));
}

// 赛程缓存
let scheduleCache: { data: any[]; fetchedAt: number } | null = null;
const SCHEDULE_CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

interface NBAGame {
  gameId: string;
  gameCode: string;
  gameStatus: number; // 1=未开始, 2=进行中, 3=已结束
  gameStatusText: string;
  gameTimeUTC: string;
  homeTeam: {
    teamId: number;
    teamName: string;
    teamCity: string;
    teamTricode: string;
    score: number;
  };
  awayTeam: {
    teamId: number;
    teamName: string;
    teamCity: string;
    teamTricode: string;
    score: number;
  };
}

interface NBABoxscorePlayer {
  personId: number;
  firstName: string;
  familyName: string;
  name: string;
  jerseyNum: string;
  position: string;
  status: string;
  statistics?: {
    points: number;
    reboundsTotal: number;
    assists: number;
    minutes: string;
  };
}

/**
 * 获取完整赛季赛程
 */
async function fetchSeasonSchedule(): Promise<any[]> {
  const now = Date.now();
  if (scheduleCache && now - scheduleCache.fetchedAt < SCHEDULE_CACHE_TTL) {
    return scheduleCache.data;
  }
  
  try {
    const url = `${NBA_STATIC_BASE}/scheduleLeagueV2.json`;
    console.log('Fetching season schedule from NBA API...');
    const res = await fetch(url, { headers: NBA_HEADERS });
    if (res.ok) {
      const data = await res.json() as any;
      const gameDates = data.leagueSchedule?.gameDates || [];
      scheduleCache = { data: gameDates, fetchedAt: now };
      console.log(`Loaded ${gameDates.length} game dates from schedule`);
      return gameDates;
    }
  } catch (e) {
    console.error('Failed to fetch season schedule:', e);
  }
  
  return scheduleCache?.data || [];
}

/**
 * 从赛程中获取指定NBA日期的比赛
 * @param nbaDate NBA日期格式 MM/DD/YYYY（如 "12/03/2025"）
 */
async function getGamesFromSchedule(nbaDate: string): Promise<NBAGame[]> {
  const gameDates = await fetchSeasonSchedule();
  
  // 找到对应日期
  const targetDateStr = `${nbaDate} 00:00:00`;
  const gameDate = gameDates.find((gd: any) => gd.gameDate === targetDateStr);
  
  if (!gameDate || !gameDate.games) {
    return [];
  }
  
  return gameDate.games.map((g: any) => ({
    gameId: g.gameId,
    gameCode: g.gameCode,
    gameStatus: g.gameStatus,
    gameStatusText: g.gameStatusText,
    gameTimeUTC: g.gameDateTimeUTC,
    homeTeam: {
      teamId: g.homeTeam?.teamId,
      teamName: g.homeTeam?.teamName,
      teamCity: g.homeTeam?.teamCity,
      teamTricode: g.homeTeam?.teamTricode,
      score: g.homeTeam?.score || 0,
    },
    awayTeam: {
      teamId: g.awayTeam?.teamId,
      teamName: g.awayTeam?.teamName,
      teamCity: g.awayTeam?.teamCity,
      teamTricode: g.awayTeam?.teamTricode,
      score: g.awayTeam?.score || 0,
    },
  }));
}

/**
 * 从实时比分板获取当天比赛的最新比分
 */
async function fetchTodayScoreboard(): Promise<Map<string, { homeScore: number; awayScore: number; status: number; statusText: string }>> {
  const scoreMap = new Map();
  
  try {
    const todayUrl = `${NBA_CDN_BASE}/scoreboard/todaysScoreboard_00.json`;
    const res = await fetch(todayUrl, { headers: NBA_HEADERS });
    if (res.ok) {
      const data = await res.json() as any;
      const games = data.scoreboard?.games || [];
      for (const g of games) {
        scoreMap.set(g.gameId, {
          homeScore: g.homeTeam?.score || 0,
          awayScore: g.awayTeam?.score || 0,
          status: g.gameStatus,
          statusText: g.gameStatusText,
        });
      }
    }
  } catch (e) {
    // 忽略
  }
  
  return scoreMap;
}

/**
 * 将YYYY-MM-DD格式转换为MM/DD/YYYY格式（NBA赛程API使用）
 */
function toNBAScheduleDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  return `${month}/${day}/${year}`;
}

/**
 * 从NBA CDN获取比赛详情（Boxscore）
 */
async function fetchNBABoxscore(gameId: string): Promise<any | null> {
  try {
    const url = `${NBA_CDN_BASE}/boxscore/boxscore_${gameId}.json`;
    const res = await fetch(url, { headers: NBA_HEADERS });
    if (res.ok) {
      const data = await res.json() as any;
      return data.game;
    }
  } catch (e) {
    console.log(`NBA CDN boxscore failed for ${gameId}`);
  }

  // 尝试Stats API作为备选
  try {
    const url = `${NBA_STATS_BASE}/boxscoretraditionalv2?EndPeriod=10&EndRange=28800&GameID=${gameId}&RangeType=0&StartPeriod=1&StartRange=0`;
    const res = await fetch(url, { headers: NBA_HEADERS });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.log(`NBA Stats boxscore failed for ${gameId}`);
  }

  return null;
}

/**
 * 获取伤病报告
 */
interface InjuryInfo {
  playerId: number;
  playerName: string;
  teamId: number;
  status: string; // "Out", "Questionable", "Probable", "Doubtful"
  comment: string;
}

let injuryCache: { data: Map<number, InjuryInfo>; fetchedAt: number } | null = null;

async function fetchInjuryReport(): Promise<Map<number, InjuryInfo>> {
  const now = Date.now();
  if (injuryCache && now - injuryCache.fetchedAt < 30 * 60 * 1000) { // 30分钟缓存
    return injuryCache.data;
  }

  const injuries = new Map<number, InjuryInfo>();
  
  try {
    // 尝试从NBA Stats获取伤病报告
    const url = `${NBA_STATS_BASE}/playerindex?Historical=0&LeagueID=00&Season=${config.currentSeason}-${(config.currentSeason + 1).toString().slice(-2)}&SeasonType=Regular+Season`;
    // 注意：这个API可能没有直接的伤病信息
    // 实际伤病信息可能需要从其他来源获取
  } catch (e) {
    console.log('Failed to fetch injury report');
  }

  injuryCache = { data: injuries, fetchedAt: now };
  return injuries;
}

// ==================== 球队映射 ====================

// 球队缩写映射
const TEAM_ABBR_TO_ID: Record<string, number> = {
  'ATL': 1610612737, 'BOS': 1610612738, 'BRK': 1610612751, 'CHO': 1610612766,
  'CHA': 1610612766, 'CHI': 1610612741, 'CLE': 1610612739, 'DAL': 1610612742,
  'DEN': 1610612743, 'DET': 1610612765, 'GSW': 1610612744, 'HOU': 1610612745,
  'IND': 1610612754, 'LAC': 1610612746, 'LAL': 1610612747, 'MEM': 1610612763,
  'MIA': 1610612748, 'MIL': 1610612749, 'MIN': 1610612750, 'NOP': 1610612740,
  'NYK': 1610612752, 'OKC': 1610612760, 'ORL': 1610612753, 'PHI': 1610612755,
  'PHO': 1610612756, 'PHX': 1610612756, 'POR': 1610612757, 'SAC': 1610612758,
  'SAS': 1610612759, 'TOR': 1610612761, 'UTA': 1610612762, 'WAS': 1610612764,
};

const ID_TO_TEAM_ABBR: Record<number, string> = {};
for (const [abbr, id] of Object.entries(TEAM_ABBR_TO_ID)) {
  if (!ID_TO_TEAM_ABBR[id]) ID_TO_TEAM_ABBR[id] = abbr;
}

const TEAM_ABBR_TO_CN: Record<string, string> = {
  'ATL': '老鹰', 'BOS': '凯尔特人', 'BRK': '篮网', 'CHO': '黄蜂',
  'CHI': '公牛', 'CLE': '骑士', 'DAL': '独行侠', 'DEN': '掘金',
  'DET': '活塞', 'GSW': '勇士', 'HOU': '火箭', 'IND': '步行者',
  'LAC': '快船', 'LAL': '湖人', 'MEM': '灰熊', 'MIA': '热火',
  'MIL': '雄鹿', 'MIN': '森林狼', 'NOP': '鹈鹕', 'NYK': '尼克斯',
  'OKC': '雷霆', 'ORL': '魔术', 'PHI': '76人', 'PHO': '太阳',
  'POR': '开拓者', 'SAC': '国王', 'SAS': '马刺', 'TOR': '猛龙',
  'UTA': '爵士', 'WAS': '奇才',
};

export function getTeamNameCn(teamId: number): string {
  const abbr = ID_TO_TEAM_ABBR[teamId];
  return abbr ? (TEAM_ABBR_TO_CN[abbr] || abbr) : '未知';
}

export interface BBRPlayer {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  teamId: number;
  position: string;
  gamesPlayed: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  injured?: boolean;
  injuryStatus?: string;
}

export interface BBRBoxscorePlayer {
  playerName: string;
  playerId: string;
  teamAbbr: string;
  points: number;
  rebounds: number;
  assists: number;
  minutes: string;
}

// 全局球员场均数据缓存
let playerStatsCache: { data: BBRPlayer[]; fetchedAt: number } | null = null;

/**
 * 获取所有球员场均数据
 * 优先从 player_game_log（全赛季历史数据）读取，
 * 如不可用则降级为从 SportsBlaze 近期 boxscores 实时构建。
 */
export async function getBBRAllPlayerStats(): Promise<BBRPlayer[]> {
  const now = Date.now();
  if (playerStatsCache && now - playerStatsCache.fetchedAt < 60 * 60 * 1000) {
    return playerStatsCache.data;
  }

  const season = config.currentSeason;

  // 优先尝试 player_game_log 全赛季数据
  try {
    const rows = await db.prepare(`
      SELECT
        a.player_sb_id, a.player_name, a.team_id, a.team_abbr, a.position,
        b.gp, b.ppg, b.rpg, b.apg
      FROM player_game_log a
      INNER JOIN (
        SELECT player_sb_id,
               COUNT(*) as gp,
               MAX(game_date) as last_date,
               ROUND(AVG(points), 1) as ppg,
               ROUND(AVG(rebounds), 1) as rpg,
               ROUND(AVG(assists), 1) as apg
        FROM player_game_log WHERE season = ?
        GROUP BY player_sb_id
      ) b ON a.player_sb_id = b.player_sb_id AND a.game_date = b.last_date
      WHERE a.season = ?
    `).all([season, season]) as any[];

    if (rows.length >= 100) {
      const players: BBRPlayer[] = rows.map((r: any) => ({
        playerId: r.player_sb_id,
        playerName: r.player_name,
        teamAbbr: r.team_abbr || '',
        teamId: r.team_id || 0,
        position: r.position || '',
        gamesPlayed: r.gp,
        pointsPerGame: r.ppg,
        reboundsPerGame: r.rpg,
        assistsPerGame: r.apg,
      }));
      console.log(`Loaded ${players.length} players from player_game_log (full season, ${rows[0]?.gp || '?'}-game avg)`);
      playerStatsCache = { data: players, fetchedAt: now };
      return players;
    }
  } catch (e) {
    console.log('player_game_log query failed, falling back to live boxscores');
  }

  // 降级：从 SportsBlaze 近期 boxscores 实时构建
  return await buildPlayerStatsFromRecentBoxscores(now);
}

async function buildPlayerStatsFromRecentBoxscores(now: number): Promise<BBRPlayer[]> {
  console.log('Building player roster from SportsBlaze recent boxscores...');

  interface AccEntry {
    name: string; teamName: string; teamId: number;
    teamAbbr: string; position: string;
    games: { pts: number; reb: number; ast: number }[];
  }
  const acc = new Map<string, AccEntry>();

  const nbaToday = addDays(getTodayBeijing(), -1);
  let datesWithGames = 0;
  const teamsFound = new Set<number>();

  for (let i = 0; i < 30 && datesWithGames < 7; i++) {
    const dateStr = addDays(nbaToday, -i);
    const data = await fetchSBBoxscores(dateStr);
    if (!data?.games || data.games.length === 0) continue;

    let hasFinals = false;
    for (const game of data.games) {
      if (game.status !== 'Final') continue;
      hasFinals = true;

      const process = (roster: any[], teamName: string) => {
        if (!roster || !teamName) return;
        const teamId = SB_TEAM_NAME_TO_ID[teamName] || 0;
        const teamAbbr = SB_TEAM_NAME_TO_ABBR[teamName] || '';
        if (teamId) teamsFound.add(teamId);

        for (const p of roster) {
          if (!p.id || !p.name || !p.played) continue;
          let entry = acc.get(p.id);
          if (!entry) {
            entry = { name: p.name, teamName, teamId, teamAbbr, position: p.position || '', games: [] };
            acc.set(p.id, entry);
          }
          entry.teamName = teamName;
          entry.teamId = teamId;
          entry.teamAbbr = teamAbbr;
          if (p.position) entry.position = p.position;

          if (p.stats) {
            entry.games.push({
              pts: p.stats.points ?? 0,
              reb: p.stats.rebounds ?? 0,
              ast: p.stats.assists ?? 0,
            });
          }
        }
      };

      process(game.rosters?.away, game.teams?.away?.name);
      process(game.rosters?.home, game.teams?.home?.name);
    }
    if (hasFinals) datesWithGames++;
  }

  const players: BBRPlayer[] = [];
  for (const [id, info] of acc) {
    const n = info.games.length || 1;
    players.push({
      playerId: id,
      playerName: info.name,
      teamAbbr: info.teamAbbr,
      teamId: info.teamId,
      position: info.position,
      gamesPlayed: info.games.length,
      pointsPerGame: Math.round(info.games.reduce((s, g) => s + g.pts, 0) / n * 10) / 10,
      reboundsPerGame: Math.round(info.games.reduce((s, g) => s + g.reb, 0) / n * 10) / 10,
      assistsPerGame: Math.round(info.games.reduce((s, g) => s + g.ast, 0) / n * 10) / 10,
    });
  }

  console.log(`Built roster: ${players.length} players, ${teamsFound.size} teams, ${datesWithGames} dates (fallback)`);
  playerStatsCache = { data: players, fetchedAt: now };
  return players;
}

/**
 * 从BBR获取指定球队的阵容
 */
export async function getBBRTeamRoster(teamId: number): Promise<BBRPlayer[]> {
  const abbr = ID_TO_TEAM_ABBR[teamId];
  if (!abbr) return [];

  const allPlayers = await getBBRAllPlayerStats();
  return allPlayers.filter(p => p.teamAbbr === abbr);
}

/**
 * 获取比赛 Boxscore（优先 SportsBlaze，后备 NBA CDN）
 */
export async function getBBRBoxscore(
  gameDate: string,
  homeTeamId: number,
  nbaGameDate?: string,
  gameId?: string,
): Promise<{ homePlayers: BBRBoxscorePlayer[]; awayPlayers: BBRBoxscorePlayer[] } | null> {
  const datesToTry = nbaGameDate
    ? [nbaGameDate, addDays(nbaGameDate, -1), addDays(nbaGameDate, 1)]
    : [addDays(gameDate, -1), gameDate];

  for (const dateStr of datesToTry) {
    const data = await fetchSBBoxscores(dateStr);
    if (!data?.games) continue;

    const matchingGame = data.games.find((g: any) => {
      const homeId = SB_TEAM_NAME_TO_ID[g.teams?.home?.name] || 0;
      return homeId === homeTeamId;
    });
    if (!matchingGame) continue;

    if (matchingGame.status !== 'Final' && matchingGame.status !== 'In Progress') continue;

    const homePlayers = parseSBRoster(matchingGame.rosters?.home, matchingGame.teams?.home?.name);
    const awayPlayers = parseSBRoster(matchingGame.rosters?.away, matchingGame.teams?.away?.name);

    if (homePlayers.length > 0 || awayPlayers.length > 0) {
      return { homePlayers, awayPlayers };
    }
  }

  // NBA CDN 后备
  let resolvedGameId: string | undefined = gameId;
  if (!resolvedGameId) {
    resolvedGameId = (await resolveGameId(gameDate, homeTeamId, nbaGameDate)) ?? undefined;
  }
  if (!resolvedGameId) return null;

  console.log(`SportsBlaze miss, falling back to NBA CDN boxscore ${resolvedGameId}...`);
  const boxData = await fetchNBABoxscore(resolvedGameId);
  if (!boxData) return null;

  return {
    homePlayers: parseNBABoxscorePlayers(boxData.homeTeam),
    awayPlayers: parseNBABoxscorePlayers(boxData.awayTeam),
  };
}

async function resolveGameId(gameDate: string, homeTeamId: number, nbaGameDate?: string): Promise<string | null> {
  const datesToTry = nbaGameDate
    ? [nbaGameDate, addDays(nbaGameDate, -1), addDays(nbaGameDate, 1)]
    : [addDays(gameDate, -1), gameDate, addDays(gameDate, -2)];

  for (const d of datesToTry) {
    const nbaDate = toNBAScheduleDate(d);
    const games = await getGamesFromSchedule(nbaDate);
    const match = games.find(g => g.homeTeam.teamId === homeTeamId);
    if (match) return match.gameId;
  }
  return null;
}

function parseNBABoxscorePlayers(teamData: any): BBRBoxscorePlayer[] {
  if (!teamData?.players) return [];
  const abbr = teamData.teamTricode || '';

  return teamData.players
    .filter((p: any) => p.status === 'ACTIVE' && p.statistics)
    .map((p: any) => {
      const stats = p.statistics;
      const mins = stats.minutes || stats.minutesCalculated || 'PT0M';
      const minStr = mins.replace('PT', '').replace('M', ':').replace('S', '');
      return {
        playerId: String(p.personId),
        playerName: p.name || `${p.firstName} ${p.familyName}`,
        teamAbbr: abbr,
        points: stats.points ?? 0,
        rebounds: stats.reboundsTotal ?? 0,
        assists: stats.assists ?? 0,
        minutes: minStr,
      } as BBRBoxscorePlayer;
    });
}

// ==================== 统一数据模型 ====================

export interface Game {
  gameId: string;
  gameDate: string; // 北京时间日期
  nbaGameDate: string; // NBA美东时间日期（用于BBR查询）
  gameTimeBeijing: string; // 北京时间完整时间
  status: 'Scheduled' | 'InProgress' | 'Final';
  statusText: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamNameCn: string;
  homeScore: number;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamNameCn: string;
  awayScore: number;
}

export interface Player {
  playerId: number | string;
  playerName: string;
  teamId: number;
  teamName: string;
  position: string;
  seasonAvg: number;
  gamePoints?: number;
  gameRebounds?: number;
  gameAssists?: number;
  injured: boolean;
  injuryStatus?: string;
}

// ==================== 主要服务函数 ====================

/**
 * 获取指定北京时间日期范围的比赛
 * @param startDate 开始日期（北京时间）
 * @param endDate 结束日期（北京时间）
 */
export async function getGamesInRange(startDate: string, endDate: string): Promise<Game[]> {
  const games: Game[] = [];
  const seenGameIds = new Set<string>();
  
  // 获取实时比分数据（用于更新当天比赛状态）
  const todayScores = await fetchTodayScoreboard();
  
  // 由于NBA比赛时间是美东时间，我们需要查询更宽的范围
  // 北京时间比美东时间快12-13小时
  // 美东时间的晚上比赛，转换为北京时间可能是第二天
  
  const nbaStartDate = addDays(startDate, -2); // 往前多查2天
  const nbaEndDate = addDays(endDate, 1); // 往后多查1天
  
  let currentDate = nbaStartDate;
  while (currentDate <= nbaEndDate) {
    // 转换为NBA赛程API使用的日期格式（MM/DD/YYYY）
    const nbaScheduleDate = toNBAScheduleDate(currentDate);
    
    const nbaGames = await getGamesFromSchedule(nbaScheduleDate);
    
    if (nbaGames.length > 0) {
      console.log(`  ${currentDate}: ${nbaGames.length} games`);
    }
    
    for (const g of nbaGames) {
      // 跳过已处理的比赛
      if (seenGameIds.has(g.gameId)) continue;
      seenGameIds.add(g.gameId);
      
      // 转换为北京时间
      const beijingDate = utcToBeijingDate(g.gameTimeUTC);
      const beijingTime = utcToBeijingTime(g.gameTimeUTC);
      
      // 只保留在目标日期范围内的比赛
      if (beijingDate >= startDate && beijingDate <= endDate) {
        // 检查是否有实时比分
        const liveScore = todayScores.get(g.gameId);
        const homeScore = liveScore?.homeScore ?? g.homeTeam.score;
        const awayScore = liveScore?.awayScore ?? g.awayTeam.score;
        const gameStatus = liveScore?.status ?? g.gameStatus;
        const gameStatusText = liveScore?.statusText ?? g.gameStatusText;
        
        const status: 'Scheduled' | 'InProgress' | 'Final' = 
          gameStatus === 1 ? 'Scheduled' : 
          gameStatus === 2 ? 'InProgress' : 'Final';

        games.push({
          gameId: g.gameId,
          gameDate: beijingDate,
          nbaGameDate: currentDate, // 保存NBA美东时间日期
          gameTimeBeijing: beijingTime,
          status,
          statusText: gameStatusText,
          homeTeamId: g.homeTeam.teamId,
          homeTeamName: g.homeTeam.teamCity + ' ' + g.homeTeam.teamName,
          homeTeamNameCn: getTeamNameCn(g.homeTeam.teamId),
          homeScore,
          awayTeamId: g.awayTeam.teamId,
          awayTeamName: g.awayTeam.teamCity + ' ' + g.awayTeam.teamName,
          awayTeamNameCn: getTeamNameCn(g.awayTeam.teamId),
          awayScore,
        });
      }
    }
    
    currentDate = addDays(currentDate, 1);
  }
  
  // 按日期和时间排序
  games.sort((a, b) => a.gameTimeBeijing.localeCompare(b.gameTimeBeijing));
  
  console.log(`Total games in range ${startDate} to ${endDate}: ${games.length}`);
  return games;
}

/**
 * 获取当天前后3天的比赛（共7天）
 */
export async function getGamesAroundToday(): Promise<{ date: string; games: Game[] }[]> {
  const today = getTodayBeijing();
  const startDate = addDays(today, -3);
  const endDate = addDays(today, 3);
  
  const allGames = await getGamesInRange(startDate, endDate);
  
  // 按日期分组
  const result: { date: string; games: Game[] }[] = [];
  const dateMap = new Map<string, Game[]>();
  
  for (const game of allGames) {
    if (!dateMap.has(game.gameDate)) {
      dateMap.set(game.gameDate, []);
    }
    dateMap.get(game.gameDate)!.push(game);
  }
  
  // 确保每一天都有条目
  let currentDate = startDate;
  while (currentDate <= endDate) {
    result.push({
      date: currentDate,
      games: dateMap.get(currentDate) || [],
    });
    currentDate = addDays(currentDate, 1);
  }
  
  return result;
}

/**
 * 刷新当天比赛的比分和球员得分（仅当天）
 */
export async function refreshTodayGames(): Promise<{ updated: number; allFinished: boolean }> {
  const today = getTodayBeijing();
  
  // 获取今天的比赛
  const games = await getGamesInRange(today, today);
  
  let updated = 0;
  let allFinished = true;
  
  for (const game of games) {
    if (game.status !== 'Final') {
      allFinished = false;
    }
    updated++;
  }
  
  return { updated, allFinished };
}

/**
 * 获取比赛的球员数据
 * - 已结束比赛: 从BBR获取本场得分
 * - 未开始/进行中: 从BBR获取球队阵容和场均数据
 */
export async function getGamePlayers(game: Game): Promise<{ homePlayers: Player[]; awayPlayers: Player[] }> {
  const homePlayers: Player[] = [];
  const awayPlayers: Player[] = [];
  
  // 获取所有球员场均数据
  const allPlayerStats = await getBBRAllPlayerStats();
  const playerStatsMap = new Map<string, BBRPlayer>();
  for (const p of allPlayerStats) {
    playerStatsMap.set(p.playerName.toLowerCase(), p);
  }
  
  if (game.status === 'Final') {
    // 已结束比赛：从NBA CDN获取Boxscore
    const boxscore = await getBBRBoxscore(game.gameDate, game.homeTeamId, game.nbaGameDate, game.gameId);
    
    if (boxscore) {
      for (const p of boxscore.homePlayers) {
        const stats = playerStatsMap.get(p.playerName.toLowerCase());
        homePlayers.push({
          playerId: p.playerId,
          playerName: p.playerName,
          teamId: game.homeTeamId,
          teamName: game.homeTeamNameCn,
          position: stats?.position || '',
          seasonAvg: stats?.pointsPerGame || 0,
          gamePoints: p.points,
          gameRebounds: p.rebounds,
          gameAssists: p.assists,
          injured: false,
        });
      }
      
      for (const p of boxscore.awayPlayers) {
        const stats = playerStatsMap.get(p.playerName.toLowerCase());
        awayPlayers.push({
          playerId: p.playerId,
          playerName: p.playerName,
          teamId: game.awayTeamId,
          teamName: game.awayTeamNameCn,
          position: stats?.position || '',
          seasonAvg: stats?.pointsPerGame || 0,
          gamePoints: p.points,
          gameRebounds: p.rebounds,
          gameAssists: p.assists,
          injured: false,
        });
      }
    }
  } else {
    // 未开始/进行中：从BBR获取球队阵容
    const homeRoster = await getBBRTeamRoster(game.homeTeamId);
    const awayRoster = await getBBRTeamRoster(game.awayTeamId);
    
    for (const p of homeRoster) {
      homePlayers.push({
        playerId: p.playerId,
        playerName: p.playerName,
        teamId: game.homeTeamId,
        teamName: game.homeTeamNameCn,
        position: p.position,
        seasonAvg: p.pointsPerGame,
        injured: p.injured || false,
        injuryStatus: p.injuryStatus,
      });
    }
    
    for (const p of awayRoster) {
      awayPlayers.push({
        playerId: p.playerId,
        playerName: p.playerName,
        teamId: game.awayTeamId,
        teamName: game.awayTeamNameCn,
        position: p.position,
        seasonAvg: p.pointsPerGame,
        injured: p.injured || false,
        injuryStatus: p.injuryStatus,
      });
    }
  }
  
  // 按场均得分排序
  homePlayers.sort((a, b) => b.seasonAvg - a.seasonAvg);
  awayPlayers.sort((a, b) => b.seasonAvg - a.seasonAvg);
  
  return { homePlayers, awayPlayers };
}

/**
 * 更新赛程（当天前后3个比赛日）
 */
export async function updateSchedule(): Promise<{ games: number }> {
  const today = getTodayBeijing();
  const startDate = addDays(today, -3);
  const endDate = addDays(today, 3);
  
  const games = await getGamesInRange(startDate, endDate);
  
  return { games: games.length };
}

