/**
 * 混合NBA数据服务
 * 
 * 数据来源:
 * 1. NBA官方API - 获取赛程和比分
 * 2. Basketball Reference - 获取球员阵容和场均得分
 * 
 * 功能:
 * - 赛程: 当天前后3天的NBA比赛
 * - 比分: NBA官方API实时更新
 * - 球员阵容: BBR获取
 * - 场均得分: BBR获取
 * - 伤病状态: NBA官方API获取
 */

import fetch from 'node-fetch';
import { config } from '../config';

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

const NBA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
};

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

// ==================== Basketball Reference API ====================

const BBR_BASE = 'https://www.basketball-reference.com';
const BBR_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// BBR页面缓存
const bbrPageCache: Record<string, { html: string; timestamp: number }> = {};
const BBR_CACHE_TTL = 10 * 60 * 1000; // 10分钟缓存
let lastBBRRequestTime = 0;
const BBR_MIN_INTERVAL = 3500; // 3.5秒间隔避免429

async function fetchBBRPage(url: string): Promise<string | null> {
  // 检查缓存
  if (bbrPageCache[url] && Date.now() - bbrPageCache[url].timestamp < BBR_CACHE_TTL) {
    return bbrPageCache[url].html;
  }

  // 限速
  const now = Date.now();
  if (now - lastBBRRequestTime < BBR_MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, BBR_MIN_INTERVAL - (now - lastBBRRequestTime)));
  }
  lastBBRRequestTime = Date.now();

  try {
    const res = await fetch(url, { headers: BBR_HEADERS });
    if (res.status === 429) {
      console.log(`BBR rate limited for ${url}, waiting 30s...`);
      await new Promise(r => setTimeout(r, 30000));
      return fetchBBRPage(url);
    }
    if (!res.ok) {
      console.log(`BBR request failed: ${res.status} for ${url}`);
      return null;
    }
    const html = await res.text();
    bbrPageCache[url] = { html, timestamp: Date.now() };
    return html;
  } catch (e) {
    console.error(`BBR fetch error for ${url}:`, e);
    return null;
  }
}

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
 * 从BBR获取所有球员场均数据
 */
export async function getBBRAllPlayerStats(): Promise<BBRPlayer[]> {
  const now = Date.now();
  if (playerStatsCache && now - playerStatsCache.fetchedAt < 60 * 60 * 1000) { // 1小时缓存
    return playerStatsCache.data;
  }

  const seasonYear = config.currentSeason + 1;
  const url = `${BBR_BASE}/leagues/NBA_${seasonYear}_per_game.html`;
  console.log(`Fetching BBR player stats from ${url}...`);
  
  const html = await fetchBBRPage(url);
  if (!html) return playerStatsCache?.data || [];

  const players: BBRPlayer[] = [];

  // 解析球员数据
  const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*data-stat="name_display"[^>]*>(?:<a[^>]*href="\/players\/[a-z]\/([^"]+)\.html"[^>]*>)?([^<]+)(?:<\/a>)?<\/td>[\s\S]*?<td[^>]*data-stat="age"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="team_name_abbr"[^>]*>(?:<a[^>]*>)?([^<]*)(?:<\/a>)?<\/td>[\s\S]*?<td[^>]*data-stat="pos"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="games"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="games_started"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="mp_per_g"[^>]*>[^<]*<\/td>[\s\S]*?(?:[\s\S]*?<td[^>]*data-stat="trb_per_g"[^>]*>([^<]*)<\/td>)?[\s\S]*?(?:<td[^>]*data-stat="ast_per_g"[^>]*>([^<]*)<\/td>)?[\s\S]*?<td[^>]*data-stat="pts_per_g"[^>]*>([^<]*)<\/td>/gi;

  let match;
  const allRows: BBRPlayer[] = [];
  while ((match = rowRegex.exec(html)) !== null) {
    const [, playerId, playerName, teamAbbr, pos, games, trb, ast, pts] = match;
    if (!playerName || !teamAbbr) continue;

    // Skip "TOT" (total) rows for traded players — they don't map to a real team
    if (teamAbbr === 'TOT' || teamAbbr === '2TM' || teamAbbr === '3TM') continue;

    allRows.push({
      playerId: playerId || playerName.toLowerCase().replace(/\s+/g, ''),
      playerName: playerName.trim().replace(/&amp;/g, '&'),
      teamAbbr,
      teamId: TEAM_ABBR_TO_ID[teamAbbr] || 0,
      position: pos || '',
      gamesPlayed: parseInt(games) || 0,
      pointsPerGame: parseFloat(pts) || 0,
      reboundsPerGame: parseFloat(trb) || 0,
      assistsPerGame: parseFloat(ast) || 0,
    });
  }

  // Deduplicate traded players: BBR lists rows chronologically,
  // so the last row is the player's current team.
  const playerMap = new Map<string, BBRPlayer>();
  for (const p of allRows) {
    playerMap.set(p.playerId, p);
  }
  players.push(...playerMap.values());

  console.log(`Found ${players.length} players from BBR (${allRows.length} rows before dedup)`);
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
 * 从BBR获取指定比赛的Boxscore
 * 注意：BBR使用美东时间的日期，需要从北京时间转换
 * @param gameDate 北京时间日期 YYYY-MM-DD
 * @param homeTeamId 主队ID
 * @param nbaGameDate 可选的NBA美东时间日期（如果知道的话）
 */
export async function getBBRBoxscore(gameDate: string, homeTeamId: number, nbaGameDate?: string): Promise<{ homePlayers: BBRBoxscorePlayer[]; awayPlayers: BBRBoxscorePlayer[] } | null> {
  const homeAbbr = ID_TO_TEAM_ABBR[homeTeamId];
  if (!homeAbbr) return null;

  // BBR使用美东时间日期，通常比北京时间晚一天
  // 如果提供了nbaGameDate，使用它；否则尝试北京时间减一天
  const bbrDate = nbaGameDate || addDays(gameDate, -1);
  const dateStr = bbrDate.replace(/-/g, '');
  const gameId = `${dateStr}0${homeAbbr}`;
  const url = `${BBR_BASE}/boxscores/${gameId}.html`;
  
  console.log(`Fetching BBR boxscore from ${url}...`);
  const html = await fetchBBRPage(url);
  if (!html) return null;

  const homePlayers = parseBBRPlayerTable(html, homeAbbr);
  
  // 查找客队缩写
  const tableIds = html.match(/id="box-([A-Z]+)-game-basic"/g) || [];
  let awayAbbr = '';
  for (const id of tableIds) {
    const m = id.match(/box-([A-Z]+)-game/);
    if (m && m[1] !== homeAbbr) {
      awayAbbr = m[1];
      break;
    }
  }
  
  const awayPlayers = awayAbbr ? parseBBRPlayerTable(html, awayAbbr) : [];

  return { homePlayers, awayPlayers };
}

function parseBBRPlayerTable(html: string, teamAbbr: string): BBRBoxscorePlayer[] {
  const players: BBRBoxscorePlayer[] = [];
  
  const tableRegex = new RegExp(`<table[^>]*id="box-${teamAbbr}-game-basic"[^>]*>([\\s\\S]*?)<\\/table>`, 'i');
  const tableMatch = html.match(tableRegex);
  if (!tableMatch) return players;

  const tableHtml = tableMatch[1];
  const rowRegex = /<tr[^>]*>[\s\S]*?<th[^>]*data-stat="player"[^>]*>(?:<a[^>]*href="\/players\/[a-z]\/([^"]+)\.html"[^>]*>)?([^<]+)(?:<\/a>)?<\/th>([\s\S]*?)<\/tr>/gi;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const playerId = rowMatch[1] || '';
    const playerName = rowMatch[2].trim();
    const rowData = rowMatch[3];

    if (playerName.includes('Totals') || playerName.includes('Reserves') || playerName.includes('Starters')) {
      continue;
    }

    const getStatValue = (stat: string): string => {
      const m = rowData.match(new RegExp(`<td[^>]*data-stat="${stat}"[^>]*>([^<]*)<\\/td>`));
      return m ? m[1] : '';
    };

    players.push({
      playerId: playerId || playerName.toLowerCase().replace(/\s+/g, ''),
      playerName: playerName.replace(/&amp;/g, '&'),
      teamAbbr,
      points: parseInt(getStatValue('pts')) || 0,
      rebounds: parseInt(getStatValue('trb')) || 0,
      assists: parseInt(getStatValue('ast')) || 0,
      minutes: getStatValue('mp') || '0:00',
    });
  }

  return players;
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
    // 已结束比赛：从BBR获取Boxscore（使用NBA美东时间日期）
    const boxscore = await getBBRBoxscore(game.gameDate, game.homeTeamId, game.nbaGameDate);
    
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

