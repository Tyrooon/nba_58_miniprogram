/**
 * Basketball Reference 数据服务
 * 数据来源: https://www.basketball-reference.com/
 * 
 * 主要API:
 * - 赛程: /leagues/NBA_2025_games-{month}.html
 * - Boxscore: /boxscores/{YYYYMMDD}0{TEAM}.html
 * - 球员场均: /leagues/NBA_2025_per_game.html
 * - 今日比分: /boxscores/
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://www.basketball-reference.com';

// 请求头
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// 缓存
const pageCache: Record<string, { html: string; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 请求间隔
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000; // 最少3秒间隔

// 球队缩写到NBA ID的映射
export const TEAM_ABBR_TO_ID: Record<string, number> = {
  'ATL': 1610612737, // Hawks
  'BOS': 1610612738, // Celtics
  'BRK': 1610612751, // Nets
  'CHO': 1610612766, // Hornets (Basketball Reference uses CHO)
  'CHA': 1610612766, // Hornets (alternative)
  'CHI': 1610612741, // Bulls
  'CLE': 1610612739, // Cavaliers
  'DAL': 1610612742, // Mavericks
  'DEN': 1610612743, // Nuggets
  'DET': 1610612765, // Pistons
  'GSW': 1610612744, // Warriors
  'HOU': 1610612745, // Rockets
  'IND': 1610612754, // Pacers
  'LAC': 1610612746, // Clippers
  'LAL': 1610612747, // Lakers
  'MEM': 1610612763, // Grizzlies
  'MIA': 1610612748, // Heat
  'MIL': 1610612749, // Bucks
  'MIN': 1610612750, // Timberwolves
  'NOP': 1610612740, // Pelicans
  'NYK': 1610612752, // Knicks
  'OKC': 1610612760, // Thunder
  'ORL': 1610612753, // Magic
  'PHI': 1610612755, // 76ers
  'PHO': 1610612756, // Suns (Basketball Reference uses PHO)
  'PHX': 1610612756, // Suns (alternative)
  'POR': 1610612757, // Trail Blazers
  'SAC': 1610612758, // Kings
  'SAS': 1610612759, // Spurs
  'TOR': 1610612761, // Raptors
  'UTA': 1610612762, // Jazz
  'WAS': 1610612764, // Wizards
};

// NBA ID到球队缩写的映射
export const ID_TO_TEAM_ABBR: Record<number, string> = {};
for (const [abbr, id] of Object.entries(TEAM_ABBR_TO_ID)) {
  if (!ID_TO_TEAM_ABBR[id]) {
    ID_TO_TEAM_ABBR[id] = abbr;
  }
}

// 球队全名到缩写的映射
export const TEAM_NAME_TO_ABBR: Record<string, string> = {
  'Atlanta': 'ATL', 'Hawks': 'ATL', 'Atlanta Hawks': 'ATL',
  'Boston': 'BOS', 'Celtics': 'BOS', 'Boston Celtics': 'BOS',
  'Brooklyn': 'BRK', 'Nets': 'BRK', 'Brooklyn Nets': 'BRK',
  'Charlotte': 'CHO', 'Hornets': 'CHO', 'Charlotte Hornets': 'CHO',
  'Chicago': 'CHI', 'Bulls': 'CHI', 'Chicago Bulls': 'CHI',
  'Cleveland': 'CLE', 'Cavaliers': 'CLE', 'Cleveland Cavaliers': 'CLE',
  'Dallas': 'DAL', 'Mavericks': 'DAL', 'Dallas Mavericks': 'DAL',
  'Denver': 'DEN', 'Nuggets': 'DEN', 'Denver Nuggets': 'DEN',
  'Detroit': 'DET', 'Pistons': 'DET', 'Detroit Pistons': 'DET',
  'Golden State': 'GSW', 'Warriors': 'GSW', 'Golden State Warriors': 'GSW',
  'Houston': 'HOU', 'Rockets': 'HOU', 'Houston Rockets': 'HOU',
  'Indiana': 'IND', 'Pacers': 'IND', 'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC', 'Clippers': 'LAC', 'LA Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL', 'Lakers': 'LAL', 'LA Lakers': 'LAL',
  'Memphis': 'MEM', 'Grizzlies': 'MEM', 'Memphis Grizzlies': 'MEM',
  'Miami': 'MIA', 'Heat': 'MIA', 'Miami Heat': 'MIA',
  'Milwaukee': 'MIL', 'Bucks': 'MIL', 'Milwaukee Bucks': 'MIL',
  'Minnesota': 'MIN', 'Timberwolves': 'MIN', 'Minnesota Timberwolves': 'MIN',
  'New Orleans': 'NOP', 'Pelicans': 'NOP', 'New Orleans Pelicans': 'NOP',
  'New York': 'NYK', 'Knicks': 'NYK', 'New York Knicks': 'NYK',
  'Oklahoma City': 'OKC', 'Thunder': 'OKC', 'Oklahoma City Thunder': 'OKC',
  'Orlando': 'ORL', 'Magic': 'ORL', 'Orlando Magic': 'ORL',
  'Philadelphia': 'PHI', '76ers': 'PHI', 'Philadelphia 76ers': 'PHI',
  'Phoenix': 'PHO', 'Suns': 'PHO', 'Phoenix Suns': 'PHO',
  'Portland': 'POR', 'Trail Blazers': 'POR', 'Blazers': 'POR', 'Portland Trail Blazers': 'POR',
  'Sacramento': 'SAC', 'Kings': 'SAC', 'Sacramento Kings': 'SAC',
  'San Antonio': 'SAS', 'Spurs': 'SAS', 'San Antonio Spurs': 'SAS',
  'Toronto': 'TOR', 'Raptors': 'TOR', 'Toronto Raptors': 'TOR',
  'Utah': 'UTA', 'Jazz': 'UTA', 'Utah Jazz': 'UTA',
  'Washington': 'WAS', 'Wizards': 'WAS', 'Washington Wizards': 'WAS',
};

// 球队缩写到中文名的映射
export const TEAM_ABBR_TO_CN: Record<string, string> = {
  'ATL': '老鹰', 'BOS': '凯尔特人', 'BRK': '篮网', 'CHO': '黄蜂',
  'CHI': '公牛', 'CLE': '骑士', 'DAL': '独行侠', 'DEN': '掘金',
  'DET': '活塞', 'GSW': '勇士', 'HOU': '火箭', 'IND': '步行者',
  'LAC': '快船', 'LAL': '湖人', 'MEM': '灰熊', 'MIA': '热火',
  'MIL': '雄鹿', 'MIN': '森林狼', 'NOP': '鹈鹕', 'NYK': '尼克斯',
  'OKC': '雷霆', 'ORL': '魔术', 'PHI': '76人', 'PHO': '太阳',
  'POR': '开拓者', 'SAC': '国王', 'SAS': '马刺', 'TOR': '猛龙',
  'UTA': '爵士', 'WAS': '奇才',
};

// 类型定义
export interface BBRefGame {
  gameId: string;
  gameDate: string;
  homeTeamAbbr: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamNameCn: string;
  homeScore: number;
  awayTeamAbbr: string;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamNameCn: string;
  awayScore: number;
  status: 'Scheduled' | 'InProgress' | 'Final';
  boxscoreUrl: string;
}

export interface BBRefPlayer {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  teamId: number;
  teamName: string;
  teamNameCn: string;
  position: string;
  gamesPlayed: number;
  gamesStarted: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  fgPercent: number;
  fg3Percent: number;
  ftPercent: number;
}

export interface BBRefBoxscorePlayer {
  playerName: string;
  playerId: string;
  teamAbbr: string;
  minutes: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  plusMinus: number;
  fgMade: number;
  fgAttempts: number;
  fg3Made: number;
  fg3Attempts: number;
  ftMade: number;
  ftAttempts: number;
}

export interface BBRefBoxscore {
  gameId: string;
  gameDate: string;
  homeTeamAbbr: string;
  homeTeamScore: number;
  awayTeamAbbr: string;
  awayTeamScore: number;
  homePlayers: BBRefBoxscorePlayer[];
  awayPlayers: BBRefBoxscorePlayer[];
}

/**
 * 获取HTML页面（带缓存和限速）
 */
async function fetchPage(url: string, useCache: boolean = true): Promise<string | null> {
  // 检查缓存
  if (useCache && pageCache[url]) {
    const cached = pageCache[url];
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Using cached page for ${url}`);
      return cached.html;
    }
  }
  
  // 限速：确保请求间隔
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`Rate limiting: waiting ${waitTime}ms...`);
    await new Promise(r => setTimeout(r, waitTime));
  }
  lastRequestTime = Date.now();
  
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (response.status === 429) {
      console.error(`Rate limited (429) for ${url}, waiting 30s and retrying...`);
      await new Promise(r => setTimeout(r, 30000));
      return fetchPage(url, false);
    }
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    const html = await response.text();
    
    // 存入缓存
    pageCache[url] = { html, timestamp: Date.now() };
    
    return html;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

/**
 * 解析HTML实体
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * 获取指定月份的赛程
 * @param year 赛季年份 (如2025表示2024-25赛季)
 * @param month 月份名称 (如 'december')
 */
export async function getScheduleByMonth(year: number, month: string): Promise<BBRefGame[]> {
  const url = `${BASE_URL}/leagues/NBA_${year}_games-${month.toLowerCase()}.html`;
  console.log(`Fetching schedule from ${url}...`);
  
  const html = await fetchPage(url);
  if (!html) return [];
  
  const games: BBRefGame[] = [];
  
  // 解析赛程表格
  // 每行格式: <tr><th data-stat="date_game" csk="YYYYMMDD0XXX">...</th><td data-stat="visitor_team_name">...</td>...
  const rowRegex = /<tr\s*>[\s\S]*?<th[^>]*data-stat="date_game"[^>]*csk="(\d{8}0[A-Z]{3})"[^>]*>[\s\S]*?<\/th>[\s\S]*?<td[^>]*data-stat="visitor_team_name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/td>[\s\S]*?<td[^>]*data-stat="visitor_pts"[^>]*>(\d*)<\/td>[\s\S]*?<td[^>]*data-stat="home_team_name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/td>[\s\S]*?<td[^>]*data-stat="home_pts"[^>]*>(\d*)<\/td>[\s\S]*?<\/tr>/gi;
  
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const [, gameKey, awayTeamName, awayPtsStr, homeTeamName, homePtsStr] = match;
    
    // 解析日期 (YYYYMMDD0XXX -> YYYY-MM-DD)
    const dateStr = gameKey.substring(0, 8);
    const gameDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    const homeTeamAbbr = gameKey.substring(9);
    
    // 获取客队缩写
    const awayTeamAbbr = TEAM_NAME_TO_ABBR[awayTeamName] || awayTeamName.substring(0, 3).toUpperCase();
    
    const homeScore = parseInt(homePtsStr) || 0;
    const awayScore = parseInt(awayPtsStr) || 0;
    
    const homeTeamId = TEAM_ABBR_TO_ID[homeTeamAbbr] || 0;
    const awayTeamId = TEAM_ABBR_TO_ID[awayTeamAbbr] || 0;
    
    games.push({
      gameId: gameKey,
      gameDate,
      homeTeamAbbr,
      homeTeamId,
      homeTeamName,
      homeTeamNameCn: TEAM_ABBR_TO_CN[homeTeamAbbr] || homeTeamName,
      homeScore,
      awayTeamAbbr,
      awayTeamId,
      awayTeamName,
      awayTeamNameCn: TEAM_ABBR_TO_CN[awayTeamAbbr] || awayTeamName,
      awayScore,
      status: homeScore > 0 || awayScore > 0 ? 'Final' : 'Scheduled',
      boxscoreUrl: `/boxscores/${gameKey}.html`,
    });
  }
  
  console.log(`Found ${games.length} games for ${month} ${year}`);
  return games;
}

/**
 * 获取指定日期的比赛
 */
export async function getGamesByDate(dateKey: string): Promise<BBRefGame[]> {
  // 确定月份
  const date = new Date(dateKey);
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const month = monthNames[date.getMonth()];
  
  // 确定赛季年份 (10月-6月为同一赛季)
  let seasonYear = date.getFullYear();
  if (date.getMonth() >= 9) { // 10月及以后
    seasonYear += 1;
  }
  
  const allGames = await getScheduleByMonth(seasonYear, month);
  return allGames.filter(g => g.gameDate === dateKey);
}

/**
 * 获取今日比分（从首页）
 */
export async function getTodayScores(): Promise<BBRefGame[]> {
  const url = `${BASE_URL}/boxscores/`;
  console.log(`Fetching today's scores from ${url}...`);
  
  const html = await fetchPage(url);
  if (!html) return [];
  
  const games: BBRefGame[] = [];
  
  // 解析比赛摘要
  // <div class="game_summary">...<a href="/boxscores/YYYYMMDD0XXX.html">...
  const summaryRegex = /<div class="game_summary[^"]*">([\s\S]*?)<\/div>\s*<\/div>/gi;
  const linkRegex = /\/boxscores\/(\d{8}0[A-Z]{3})\.html/;
  const teamScoreRegex = /<tr class="(winner|loser)">\s*<td><a href="\/teams\/([A-Z]+)\/\d+\.html">([^<]+)<\/a><\/td>\s*<td class="right">(\d+)<\/td>/g;
  
  let summaryMatch;
  while ((summaryMatch = summaryRegex.exec(html)) !== null) {
    const summary = summaryMatch[1];
    
    // 获取gameId
    const linkMatch = summary.match(linkRegex);
    if (!linkMatch) continue;
    
    const gameId = linkMatch[1];
    const dateStr = gameId.substring(0, 8);
    const gameDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    const homeTeamAbbr = gameId.substring(9);
    
    // 解析两队得分
    const teams: { abbr: string; name: string; score: number; isWinner: boolean }[] = [];
    let teamMatch;
    const teamRegex = /<tr class="(winner|loser)">\s*<td><a href="\/teams\/([A-Z]+)\/\d+\.html">([^<]+)<\/a><\/td>\s*<td class="right">(\d+)<\/td>/g;
    
    while ((teamMatch = teamRegex.exec(summary)) !== null) {
      teams.push({
        abbr: teamMatch[2],
        name: teamMatch[3],
        score: parseInt(teamMatch[4]) || 0,
        isWinner: teamMatch[1] === 'winner',
      });
    }
    
    if (teams.length !== 2) continue;
    
    // 确定主客队 (第一个是客队，第二个是主队)
    const awayTeam = teams[0];
    const homeTeam = teams[1];
    
    games.push({
      gameId,
      gameDate,
      homeTeamAbbr: homeTeam.abbr,
      homeTeamId: TEAM_ABBR_TO_ID[homeTeam.abbr] || 0,
      homeTeamName: homeTeam.name,
      homeTeamNameCn: TEAM_ABBR_TO_CN[homeTeam.abbr] || homeTeam.name,
      homeScore: homeTeam.score,
      awayTeamAbbr: awayTeam.abbr,
      awayTeamId: TEAM_ABBR_TO_ID[awayTeam.abbr] || 0,
      awayTeamName: awayTeam.name,
      awayTeamNameCn: TEAM_ABBR_TO_CN[awayTeam.abbr] || awayTeam.name,
      awayScore: awayTeam.score,
      status: 'Final',
      boxscoreUrl: `/boxscores/${gameId}.html`,
    });
  }
  
  console.log(`Found ${games.length} games today`);
  return games;
}

/**
 * 获取比赛Boxscore
 * @param gameId 比赛ID (格式: YYYYMMDD0XXX)
 */
export async function getBoxscore(gameId: string): Promise<BBRefBoxscore | null> {
  const url = `${BASE_URL}/boxscores/${gameId}.html`;
  console.log(`Fetching boxscore from ${url}...`);
  
  const html = await fetchPage(url);
  if (!html) return null;
  
  const dateStr = gameId.substring(0, 8);
  const gameDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  const homeTeamAbbr = gameId.substring(9);
  
  // 查找客队缩写 (从页面标题或其他地方)
  const titleMatch = html.match(/<title>([^<]+) vs ([^<]+) Box Score/i);
  let awayTeamAbbr = '';
  if (titleMatch) {
    awayTeamAbbr = TEAM_NAME_TO_ABBR[titleMatch[1]] || '';
  }
  
  // 解析比分
  let homeScore = 0;
  let awayScore = 0;
  
  const scoreRegex = /<div class="score">(\d+)<\/div>/g;
  const scores: number[] = [];
  let scoreMatch;
  while ((scoreMatch = scoreRegex.exec(html)) !== null) {
    scores.push(parseInt(scoreMatch[1]));
  }
  if (scores.length >= 2) {
    awayScore = scores[0];
    homeScore = scores[1];
  }
  
  // 解析球员统计表格
  const homePlayers = parsePlayerTable(html, homeTeamAbbr);
  const awayPlayers = awayTeamAbbr ? parsePlayerTable(html, awayTeamAbbr) : [];
  
  // 如果没找到客队缩写，尝试从表格ID推断
  if (!awayTeamAbbr && homePlayers.length > 0) {
    const tableIds = html.match(/id="box-([A-Z]+)-game-basic"/g) || [];
    for (const tableId of tableIds) {
      const abbr = tableId.match(/box-([A-Z]+)-game/)?.[1];
      if (abbr && abbr !== homeTeamAbbr) {
        awayTeamAbbr = abbr;
        break;
      }
    }
    if (awayTeamAbbr) {
      const awayPlayersRetry = parsePlayerTable(html, awayTeamAbbr);
      if (awayPlayersRetry.length > 0) {
        awayPlayers.push(...awayPlayersRetry);
      }
    }
  }
  
  return {
    gameId,
    gameDate,
    homeTeamAbbr,
    homeTeamScore: homeScore,
    awayTeamAbbr,
    awayTeamScore: awayScore,
    homePlayers,
    awayPlayers,
  };
}

/**
 * 解析球员统计表格
 */
function parsePlayerTable(html: string, teamAbbr: string): BBRefBoxscorePlayer[] {
  const players: BBRefBoxscorePlayer[] = [];
  
  // 查找球队的基本统计表格
  const tableRegex = new RegExp(`<table[^>]*id="box-${teamAbbr}-game-basic"[^>]*>([\\s\\S]*?)<\\/table>`, 'i');
  const tableMatch = html.match(tableRegex);
  if (!tableMatch) return players;
  
  const tableHtml = tableMatch[1];
  
  // 解析每一行球员数据
  // 先找到所有tr行，然后逐行解析
  const rowRegex = /<tr[^>]*>[\s\S]*?<th[^>]*data-stat="player"[^>]*>(?:<a[^>]*href="\/players\/[a-z]\/([^"]+)\.html"[^>]*>)?([^<]+)(?:<\/a>)?<\/th>([\s\S]*?)<\/tr>/gi;
  
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const playerId = rowMatch[1] || '';
    const playerName = rowMatch[2].trim();
    const rowData = rowMatch[3];
    
    // 跳过统计行 (Team Totals, Reserves, Starters 等)
    if (playerName.includes('Totals') || playerName.includes('Reserves') || playerName.includes('Starters')) {
      continue;
    }
    
    // 解析各项数据
    const getStatValue = (stat: string): string => {
      const match = rowData.match(new RegExp(`<td[^>]*data-stat="${stat}"[^>]*>([^<]*)<\\/td>`));
      return match ? match[1] : '';
    };
    
    const minutes = getStatValue('mp');
    const fg = getStatValue('fg');
    const fga = getStatValue('fga');
    const fg3 = getStatValue('fg3');
    const fg3a = getStatValue('fg3a');
    const ft = getStatValue('ft');
    const fta = getStatValue('fta');
    const trb = getStatValue('trb');
    const ast = getStatValue('ast');
    const stl = getStatValue('stl');
    const blk = getStatValue('blk');
    const tov = getStatValue('tov');
    const pf = getStatValue('pf');
    const pts = getStatValue('pts');
    const plusMinus = getStatValue('plus_minus');
    
    players.push({
      playerId: playerId || playerName.toLowerCase().replace(/\s+/g, ''),
      playerName: decodeHtmlEntities(playerName),
      teamAbbr,
      minutes: minutes || '0:00',
      points: parseInt(pts) || 0,
      rebounds: parseInt(trb) || 0,
      assists: parseInt(ast) || 0,
      steals: parseInt(stl) || 0,
      blocks: parseInt(blk) || 0,
      turnovers: parseInt(tov) || 0,
      fouls: parseInt(pf) || 0,
      plusMinus: parseInt(plusMinus) || 0,
      fgMade: parseInt(fg) || 0,
      fgAttempts: parseInt(fga) || 0,
      fg3Made: parseInt(fg3) || 0,
      fg3Attempts: parseInt(fg3a) || 0,
      ftMade: parseInt(ft) || 0,
      ftAttempts: parseInt(fta) || 0,
    });
  }
  
  return players;
}

/**
 * 获取所有球员的场均数据
 * @param seasonYear 赛季年份 (如2025表示2024-25赛季)
 */
export async function getAllPlayerStats(seasonYear: number = 2025): Promise<BBRefPlayer[]> {
  const url = `${BASE_URL}/leagues/NBA_${seasonYear}_per_game.html`;
  console.log(`Fetching player stats from ${url}...`);
  
  const html = await fetchPage(url);
  if (!html) return [];
  
  const players: BBRefPlayer[] = [];
  
  // 解析球员统计表格
  const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*data-stat="name_display"[^>]*>(?:<a[^>]*href="\/players\/[a-z]\/([^"]+)\.html"[^>]*>)?([^<]+)(?:<\/a>)?<\/td>[\s\S]*?<td[^>]*data-stat="age"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="team_name_abbr"[^>]*>(?:<a[^>]*>)?([^<]*)(?:<\/a>)?<\/td>[\s\S]*?<td[^>]*data-stat="pos"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="games"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="games_started"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="mp_per_g"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="fg_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="fga_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="fg_pct"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="fg3_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="fg3a_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="fg3_pct"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="fg2_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="fg2a_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="fg2_pct"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="efg_pct"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="ft_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="fta_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="ft_pct"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="orb_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="drb_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="trb_per_g"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="ast_per_g"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="stl_per_g"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="blk_per_g"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*data-stat="tov_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="pf_per_g"[^>]*>[^<]*<\/td>[\s\S]*?<td[^>]*data-stat="pts_per_g"[^>]*>([^<]*)<\/td>/gi;
  
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const [, playerId, playerName, age, teamAbbr, pos, games, gamesStarted, mpg, fgPct, fg3Pct, ftPct, trb, ast, stl, blk, pts] = rowMatch;
    
    // 跳过无效行
    if (!playerName || !teamAbbr) continue;
    
    const teamId = TEAM_ABBR_TO_ID[teamAbbr] || 0;
    
    players.push({
      playerId: playerId || playerName.toLowerCase().replace(/\s+/g, ''),
      playerName: decodeHtmlEntities(playerName.trim()),
      teamAbbr,
      teamId,
      teamName: teamAbbr,
      teamNameCn: TEAM_ABBR_TO_CN[teamAbbr] || teamAbbr,
      position: pos || '',
      gamesPlayed: parseInt(games) || 0,
      gamesStarted: parseInt(gamesStarted) || 0,
      minutesPerGame: parseFloat(mpg) || 0,
      pointsPerGame: parseFloat(pts) || 0,
      reboundsPerGame: parseFloat(trb) || 0,
      assistsPerGame: parseFloat(ast) || 0,
      stealsPerGame: parseFloat(stl) || 0,
      blocksPerGame: parseFloat(blk) || 0,
      fgPercent: parseFloat(fgPct) || 0,
      fg3Percent: parseFloat(fg3Pct) || 0,
      ftPercent: parseFloat(ftPct) || 0,
    });
  }
  
  console.log(`Found ${players.length} players`);
  return players;
}

/**
 * 获取球员赛季场均得分映射
 */
export async function getSeasonAverages(seasonYear: number = 2025): Promise<Record<string, { avg: number; teamId: number; teamName: string; playerName: string }>> {
  const players = await getAllPlayerStats(seasonYear);
  const result: Record<string, { avg: number; teamId: number; teamName: string; playerName: string }> = {};
  
  for (const player of players) {
    result[player.playerId] = {
      avg: player.pointsPerGame,
      teamId: player.teamId,
      teamName: player.teamNameCn,
      playerName: player.playerName,
    };
  }
  
  return result;
}

/**
 * 获取指定球队的球员名单
 */
export async function getTeamRoster(teamAbbr: string, seasonYear: number = 2025): Promise<BBRefPlayer[]> {
  const allPlayers = await getAllPlayerStats(seasonYear);
  return allPlayers.filter(p => p.teamAbbr === teamAbbr);
}

/**
 * 根据日期和球队获取Boxscore
 */
export async function getBoxscoreByDateAndTeams(gameDate: string, homeTeamId: number, awayTeamId: number): Promise<BBRefBoxscore | null> {
  // 构造gameId
  const homeAbbr = ID_TO_TEAM_ABBR[homeTeamId];
  if (!homeAbbr) {
    console.error(`Unknown home team ID: ${homeTeamId}`);
    return null;
  }
  
  const dateStr = gameDate.replace(/-/g, '');
  const gameId = `${dateStr}0${homeAbbr}`;
  
  return getBoxscore(gameId);
}

