/**
 * 直播吧手机版 NBA 数据服务
 * 数据来源:
 * - 比赛详情: https://m.zhibo8.cc/json/match/{matchId}.json
 * - 球队数据: https://data.zhibo8.cc/manage/public/app.php?_url=/nba_v2/team&teamId={teamId}
 * - 球员场均: https://dc.qiumibao.com/dc/db/924/2025/{teamId}_regular.json
 * - 排行榜: https://stats.qiumibao.com/data/json_v2/list/nba.htm
 */

import fetch from 'node-fetch';

// API URLs
const MATCH_API = 'https://m.zhibo8.cc/json/match';
const TEAM_API = 'https://data.zhibo8.cc/manage/public/app.php';
const PLAYER_STATS_API = 'https://dc.qiumibao.com/dc/db/924/2025';
const RANKING_API = 'https://stats.qiumibao.com/data/json_v2/list/nba.htm';

// 直播吧球队ID到NBA官方球队ID的映射
export const ZHIBO8_TEAM_MAP: Record<string, { nbaId: number; name: string; abbr: string; nameCn: string }> = {
  // 西北分区
  '6891': { nbaId: 1610612762, name: 'Jazz', abbr: 'UTA', nameCn: '爵士' },
  '6893': { nbaId: 1610612760, name: 'Thunder', abbr: 'OKC', nameCn: '雷霆' },
  '6896': { nbaId: 1610612757, name: 'Trail Blazers', abbr: 'POR', nameCn: '开拓者' },
  '6903': { nbaId: 1610612750, name: 'Timberwolves', abbr: 'MIN', nameCn: '森林狼' },
  '6910': { nbaId: 1610612743, name: 'Nuggets', abbr: 'DEN', nameCn: '掘金' },
  // 太平洋分区
  '6895': { nbaId: 1610612758, name: 'Kings', abbr: 'SAC', nameCn: '国王' },
  '6897': { nbaId: 1610612756, name: 'Suns', abbr: 'PHX', nameCn: '太阳' },
  '6906': { nbaId: 1610612747, name: 'Lakers', abbr: 'LAL', nameCn: '湖人' },
  '6907': { nbaId: 1610612746, name: 'Clippers', abbr: 'LAC', nameCn: '快船' },
  '6909': { nbaId: 1610612744, name: 'Warriors', abbr: 'GSW', nameCn: '勇士' },
  // 西南分区
  '6890': { nbaId: 1610612763, name: 'Grizzlies', abbr: 'MEM', nameCn: '灰熊' },
  '6894': { nbaId: 1610612759, name: 'Spurs', abbr: 'SAS', nameCn: '马刺' },
  '6908': { nbaId: 1610612745, name: 'Rockets', abbr: 'HOU', nameCn: '火箭' },
  '6911': { nbaId: 1610612742, name: 'Mavericks', abbr: 'DAL', nameCn: '独行侠' },
  '6913': { nbaId: 1610612740, name: 'Pelicans', abbr: 'NOP', nameCn: '鹈鹕' },
  // 东南分区
  '6887': { nbaId: 1610612766, name: 'Hornets', abbr: 'CHA', nameCn: '黄蜂' },
  '6889': { nbaId: 1610612764, name: 'Wizards', abbr: 'WAS', nameCn: '奇才' },
  '6900': { nbaId: 1610612753, name: 'Magic', abbr: 'ORL', nameCn: '魔术' },
  '6905': { nbaId: 1610612748, name: 'Heat', abbr: 'MIA', nameCn: '热火' },
  '6916': { nbaId: 1610612737, name: 'Hawks', abbr: 'ATL', nameCn: '老鹰' },
  // 中部分区
  '6888': { nbaId: 1610612765, name: 'Pistons', abbr: 'DET', nameCn: '活塞' },
  '6899': { nbaId: 1610612754, name: 'Pacers', abbr: 'IND', nameCn: '步行者' },
  '6904': { nbaId: 1610612749, name: 'Bucks', abbr: 'MIL', nameCn: '雄鹿' },
  '6912': { nbaId: 1610612741, name: 'Bulls', abbr: 'CHI', nameCn: '公牛' },
  '6914': { nbaId: 1610612739, name: 'Cavaliers', abbr: 'CLE', nameCn: '骑士' },
  // 大西洋分区
  '6892': { nbaId: 1610612761, name: 'Raptors', abbr: 'TOR', nameCn: '猛龙' },
  '6898': { nbaId: 1610612755, name: '76ers', abbr: 'PHI', nameCn: '76人' },
  '6901': { nbaId: 1610612752, name: 'Knicks', abbr: 'NYK', nameCn: '尼克斯' },
  '6902': { nbaId: 1610612751, name: 'Nets', abbr: 'BKN', nameCn: '篮网' },
  '6915': { nbaId: 1610612738, name: 'Celtics', abbr: 'BOS', nameCn: '凯尔特人' },
};

// 中文球队名到直播吧ID的映射
export const TEAM_NAME_TO_ID: Record<string, string> = {};
for (const [id, info] of Object.entries(ZHIBO8_TEAM_MAP)) {
  TEAM_NAME_TO_ID[info.nameCn] = id;
  TEAM_NAME_TO_ID[info.name] = id;
  TEAM_NAME_TO_ID[info.abbr] = id;
}

// NBA ID到直播吧ID的映射
export const NBA_ID_TO_ZHIBO8: Record<number, string> = {};
for (const [zhibo8Id, info] of Object.entries(ZHIBO8_TEAM_MAP)) {
  NBA_ID_TO_ZHIBO8[info.nbaId] = zhibo8Id;
}

// 球员ID映射（直播吧ID -> 内部ID）
let playerIdCounter = 10000;
const playerIdMap: Record<string, number> = {};

function getOrCreatePlayerId(zhibo8PlayerId: string, playerName: string): number {
  const key = `zhibo8_${zhibo8PlayerId}`;
  if (!playerIdMap[key]) {
    playerIdMap[key] = playerIdCounter++;
  }
  return playerIdMap[key];
}

// 获取直播吧球队信息
export function getTeamInfo(zhibo8TeamId: string): { nbaId: number; name: string; abbr: string; nameCn: string } | null {
  return ZHIBO8_TEAM_MAP[zhibo8TeamId] || null;
}

// 根据中文名获取球队ID
export function getTeamIdByName(teamName: string): string | null {
  // 移除可能的空格
  const cleanName = teamName.trim().replace(/\s+/g, '');
  return TEAM_NAME_TO_ID[cleanName] || TEAM_NAME_TO_ID[teamName] || null;
}

// 根据NBA ID获取直播吧ID
export function getZhibo8TeamId(nbaId: number): string | null {
  return NBA_ID_TO_ZHIBO8[nbaId] || null;
}

// 类型定义
export interface Zhibo8Player {
  playerId: number;
  zhibo8PlayerId: string;
  playerName: string;
  teamId: number;
  teamName: string;
  teamNameCn: string;
  position: string;
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  fgPercent: number;
  threePercent: number;
  ftPercent: number;
}

export interface Zhibo8Game {
  matchId: string;
  gameDate: string;
  matchTime: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamNameCn: string;
  homeTeamScore: number;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamNameCn: string;
  awayTeamScore: number;
  status: 'Scheduled' | 'InProgress' | 'Final';
  zhibo8HomeId: string;
  zhibo8AwayId: string;
}

export interface Zhibo8TeamData {
  teamId: string;
  nbaTeamId: number;
  teamName: string;
  teamNameCn: string;
  wins: number;
  losses: number;
  players: Zhibo8Player[];
  recentGames: Zhibo8Game[];
  futureGames: Zhibo8Game[];
}

/**
 * 获取比赛详情
 */
export async function getMatchDetail(matchId: string): Promise<any | null> {
  try {
    const url = `${MATCH_API}/${matchId}.json`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch match ${matchId}: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch match ${matchId}:`, error);
    return null;
  }
}

/**
 * 获取球队数据（包括球员名单和比赛列表）
 */
export async function getTeamData(zhibo8TeamId: string): Promise<Zhibo8TeamData | null> {
  try {
    const url = `${TEAM_API}?_url=/nba_v2/team&teamId=${zhibo8TeamId}&random=${Math.random()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      },
    });
    
    let text = await response.text();
    // 移除PHP错误信息
    const jsonStart = text.indexOf('{');
    if (jsonStart > 0) {
      text = text.substring(jsonStart);
    }
    
    const data = JSON.parse(text) as any;
    
    if (data.status !== '1' || !data.data) {
      console.error(`Failed to fetch team data for ${zhibo8TeamId}:`, data.mesg);
      return null;
    }
    
    const teamInfo = getTeamInfo(zhibo8TeamId);
    if (!teamInfo) {
      console.error(`Unknown team ID: ${zhibo8TeamId}`);
      return null;
    }
    
    const teamData = data.data;
    
    // 解析球员数据
    const players: Zhibo8Player[] = [];
    const playerList = teamData.player?.data?.list || [];
    
    for (const p of playerList) {
      const zhibo8PlayerId = String(p.playerId);
      const playerId = getOrCreatePlayerId(zhibo8PlayerId, p['球员']);
      
      players.push({
        playerId,
        zhibo8PlayerId,
        playerName: p['球员'],
        teamId: teamInfo.nbaId,
        teamName: teamInfo.name,
        teamNameCn: teamInfo.nameCn,
        position: '',
        gamesPlayed: parseInt(p['场数']) || 0,
        minutesPerGame: parseFloat(p['分钟']) || 0,
        pointsPerGame: parseFloat(p['得分']) || 0,
        reboundsPerGame: parseFloat(p['篮板']) || 0,
        assistsPerGame: parseFloat(p['助攻']) || 0,
        stealsPerGame: parseFloat(p['抢断']) || 0,
        blocksPerGame: parseFloat(p['盖帽']) || 0,
        fgPercent: parseFloat(p['命中率']) || 0,
        threePercent: parseFloat(p['三分%']) || 0,
        ftPercent: parseFloat(p['罚球%']) || 0,
      });
    }
    
    // 解析比赛（包括已完成的和未来的）
    const recentGames: Zhibo8Game[] = [];
    const futureGames: Zhibo8Game[] = [];
    
    // 处理最近比赛
    const recentGamesList = teamData.match?.recent_games || [];
    for (const g of recentGamesList) {
      const game = parseGameData(g, zhibo8TeamId);
      if (game) {
        recentGames.push(game);
      }
    }
    
    // 处理之前的比赛
    const beforeGamesList = teamData.match?.before_games || [];
    for (const g of beforeGamesList) {
      const game = parseGameData(g, zhibo8TeamId);
      if (game) {
        recentGames.push(game);
      }
    }
    
    // 处理未来的比赛
    const afterGamesList = teamData.match?.after_games || [];
    for (const g of afterGamesList) {
      const game = parseGameData(g, zhibo8TeamId);
      if (game) {
        futureGames.push(game);
      }
    }
    
    return {
      teamId: zhibo8TeamId,
      nbaTeamId: teamInfo.nbaId,
      teamName: teamInfo.name,
      teamNameCn: teamInfo.nameCn,
      wins: parseInt(teamData.team?.wins) || 0,
      losses: parseInt(teamData.team?.losses) || 0,
      players,
      recentGames,
      futureGames,
    };
  } catch (error) {
    console.error(`Failed to fetch team data for ${zhibo8TeamId}:`, error);
    return null;
  }
}

/**
 * 解析比赛数据
 */
function parseGameData(g: any, currentTeamId: string): Zhibo8Game | null {
  try {
    // 解析日期 "2025年12月01日" -> "2025-12-01"
    const dateMatch = g.date?.match(/(\d{4})年(\d{2})月(\d{2})日/);
    const gameDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : '';
    
    if (!gameDate) return null;
    
    // 获取球队信息
    const homeTeamId = getTeamIdByName(g.homeTeam);
    const awayTeamId = getTeamIdByName(g.awayTeam);
    
    if (!homeTeamId || !awayTeamId) return null;
    
    const homeInfo = getTeamInfo(homeTeamId);
    const awayInfo = getTeamInfo(awayTeamId);
    
    if (!homeInfo || !awayInfo) return null;
    
    // 判断比赛状态
    const homeScore = parseInt(g.homeTeamScore) || 0;
    const awayScore = parseInt(g.awayTeamScore) || 0;
    let status: 'Scheduled' | 'InProgress' | 'Final' = 'Scheduled';
    
    if (homeScore > 0 || awayScore > 0) {
      status = 'Final';
    }
    
    // 生成matchId
    const matchId = g.matchId || `zhibo8_${gameDate.replace(/-/g, '')}_${homeTeamId}_${awayTeamId}`;
    
    return {
      matchId,
      gameDate,
      matchTime: g.time || '',
      homeTeamId: homeInfo.nbaId,
      homeTeamName: homeInfo.name,
      homeTeamNameCn: g.homeTeam,
      homeTeamScore: homeScore,
      awayTeamId: awayInfo.nbaId,
      awayTeamName: awayInfo.name,
      awayTeamNameCn: g.awayTeam,
      awayTeamScore: awayScore,
      status,
      zhibo8HomeId: homeTeamId,
      zhibo8AwayId: awayTeamId,
    };
  } catch (error) {
    console.error('Failed to parse game data:', error);
    return null;
  }
}

/**
 * 获取球员场均数据
 */
export async function getTeamPlayerStats(zhibo8TeamId: string): Promise<Zhibo8Player[]> {
  try {
    const url = `${PLAYER_STATS_API}/${zhibo8TeamId}_regular.json`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch player stats for team ${zhibo8TeamId}: ${response.status}`);
      return [];
    }
    
    const data = await response.json() as any;
    
    if (data.status !== 1 || !data.data) {
      console.error(`Invalid player stats response for team ${zhibo8TeamId}`);
      return [];
    }
    
    const teamInfo = getTeamInfo(zhibo8TeamId);
    if (!teamInfo) return [];
    
    const players: Zhibo8Player[] = [];
    const playerList = data.data.on || [];
    
    for (const p of playerList) {
      const zhibo8PlayerId = String(p.player_id);
      const playerId = getOrCreatePlayerId(zhibo8PlayerId, p.player_name_cn);
      
      players.push({
        playerId,
        zhibo8PlayerId,
        playerName: p.player_name_cn,
        teamId: teamInfo.nbaId,
        teamName: teamInfo.name,
        teamNameCn: teamInfo.nameCn,
        position: '',
        gamesPlayed: parseInt(p.times) || 0,
        minutesPerGame: parseFloat(p.minutes) || 0,
        pointsPerGame: parseFloat(p.points) || 0,
        reboundsPerGame: parseFloat(p['off+def']) || 0,
        assistsPerGame: parseFloat(p.ass) || 0,
        stealsPerGame: parseFloat(p.ste) || 0,
        blocksPerGame: parseFloat(p.blo) || 0,
        fgPercent: parseFloat(p.field) || 0,
        threePercent: parseFloat(p.three) || 0,
        ftPercent: parseFloat(p.free) || 0,
      });
    }
    
    return players;
  } catch (error) {
    console.error(`Failed to fetch player stats for team ${zhibo8TeamId}:`, error);
    return [];
  }
}

/**
 * 获取所有球队列表
 */
export async function getAllTeams(): Promise<{ teamId: string; nbaTeamId: number; teamName: string; teamNameCn: string }[]> {
  const teams: { teamId: string; nbaTeamId: number; teamName: string; teamNameCn: string }[] = [];
  
  for (const [id, info] of Object.entries(ZHIBO8_TEAM_MAP)) {
    teams.push({
      teamId: id,
      nbaTeamId: info.nbaId,
      teamName: info.name,
      teamNameCn: info.nameCn,
    });
  }
  
  return teams;
}

/**
 * 获取所有球队的球员数据和赛季统计
 */
export async function getAllPlayersStats(): Promise<Map<number, Zhibo8Player>> {
  const allPlayers = new Map<number, Zhibo8Player>();
  
  const teams = await getAllTeams();
  
  for (const team of teams) {
    console.log(`Fetching players for ${team.teamNameCn}...`);
    const players = await getTeamPlayerStats(team.teamId);
    
    for (const player of players) {
      // 如果球员已存在，保留得分更高的记录（可能是转会后的球员）
      const existing = allPlayers.get(player.playerId);
      if (!existing || player.pointsPerGame > existing.pointsPerGame) {
        allPlayers.set(player.playerId, player);
      }
    }
    
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  return allPlayers;
}

/**
 * 获取球员赛季场均得分映射
 * 返回 playerId -> { avg, teamId, teamName, playerName }
 */
export async function getSeasonAverages(): Promise<Record<number, { avg: number; teamId: number; teamName: string; playerName: string }>> {
  const result: Record<number, { avg: number; teamId: number; teamName: string; playerName: string }> = {};
  
  const allPlayers = await getAllPlayersStats();
  
  for (const [playerId, player] of allPlayers) {
    result[playerId] = {
      avg: player.pointsPerGame,
      teamId: player.teamId,
      teamName: player.teamNameCn,
      playerName: player.playerName,
    };
  }
  
  return result;
}

/**
 * 获取所有比赛（通过获取所有球队的比赛）
 */
export async function getAllGames(): Promise<Zhibo8Game[]> {
  const gamesMap = new Map<string, Zhibo8Game>();
  
  const teams = await getAllTeams();
  
  for (const team of teams) {
    console.log(`Fetching games for ${team.teamNameCn}...`);
    const teamData = await getTeamData(team.teamId);
    
    if (teamData) {
      // 添加最近比赛
      for (const game of teamData.recentGames) {
        const key = `${game.gameDate}_${Math.min(game.homeTeamId, game.awayTeamId)}_${Math.max(game.homeTeamId, game.awayTeamId)}`;
        if (!gamesMap.has(key)) {
          gamesMap.set(key, game);
        }
      }
      
      // 添加未来比赛
      for (const game of teamData.futureGames) {
        const key = `${game.gameDate}_${Math.min(game.homeTeamId, game.awayTeamId)}_${Math.max(game.homeTeamId, game.awayTeamId)}`;
        if (!gamesMap.has(key)) {
          gamesMap.set(key, game);
        }
      }
    }
    
    await new Promise(r => setTimeout(r, 300)); // 避免请求过快
  }
  
  return Array.from(gamesMap.values()).sort((a, b) => a.gameDate.localeCompare(b.gameDate));
}

/**
 * 获取指定日期的比赛
 */
export async function getGamesByDate(dateKey: string): Promise<Zhibo8Game[]> {
  const allGames = await getAllGames();
  return allGames.filter(g => g.gameDate === dateKey);
}

/**
 * 获取指定球队的球员名单（用于未开始的比赛）
 */
export async function getTeamRoster(zhibo8TeamId: string): Promise<Zhibo8Player[]> {
  const players = await getTeamPlayerStats(zhibo8TeamId);
  return players;
}

/**
 * 根据球队名获取球员名单
 */
export async function getTeamRosterByName(teamName: string): Promise<Zhibo8Player[]> {
  const teamId = getTeamIdByName(teamName);
  if (!teamId) {
    console.error(`Unknown team name: ${teamName}`);
    return [];
  }
  return getTeamRoster(teamId);
}

/**
 * 快速获取指定日期的比赛比分（只获取相关球队）
 */
export async function refreshGameScores(dateKey: string, teamIds: string[]): Promise<Map<string, { homeScore: number; awayScore: number; status: string }>> {
  const result = new Map<string, { homeScore: number; awayScore: number; status: string }>();
  
  // 并行获取所有相关球队的数据
  const teamDataPromises = teamIds.map(teamId => getTeamData(teamId));
  const teamDataResults = await Promise.all(teamDataPromises);
  
  for (const teamData of teamDataResults) {
    if (!teamData) continue;
    
    // 查找该日期的比赛
    for (const game of [...teamData.recentGames, ...teamData.futureGames]) {
      if (game.gameDate === dateKey) {
        const key = `${game.homeTeamId}_${game.awayTeamId}`;
        result.set(key, {
          homeScore: game.homeTeamScore,
          awayScore: game.awayTeamScore,
          status: game.status,
        });
      }
    }
  }
  
  return result;
}

/**
 * 球员本场比赛数据
 */
export interface PlayerGameStats {
  playerName: string;
  points: number;
  rebounds: number;
  assists: number;
}

/**
 * 从赛况页面解析球员本场得分
 * 直播吧没有直接的boxscore API，但赛况页面的标题包含球员得分信息
 * 例如: "🏀活塞力擒老鹰 康宁汉姆18+8+8 杰伦·约翰逊29+13+7"
 * @param matchId 比赛ID
 * @returns 球员本场数据数组
 */
export async function getMatchPlayerStats(matchId: string): Promise<PlayerGameStats[]> {
  try {
    // 获取赛况页面
    const saikuangUrl = `https://m.zhibo8.com/saikuang/nba/2025/${matchId}.htm`;
    const response = await fetch(saikuangUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch saikuang page for match ${matchId}: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    
    // 从标题中提取球员数据
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (!titleMatch) {
      return [];
    }
    
    const title = titleMatch[1];
    const players: PlayerGameStats[] = [];
    
    // 解析标题中的球员数据
    // 格式: 球员名+得分+篮板+助攻 或 球员名+得分+篮板
    // 例如: 康宁汉姆18+8+8 或 杜兰特25+6
    const playerPattern = /([\u4e00-\u9fa5·\-]+)(\d+)\+(\d+)(?:\+(\d+))?/g;
    let match;
    
    while ((match = playerPattern.exec(title)) !== null) {
      const playerName = match[1];
      const points = parseInt(match[2]) || 0;
      const rebounds = parseInt(match[3]) || 0;
      const assists = parseInt(match[4]) || 0;
      
      players.push({
        playerName,
        points,
        rebounds,
        assists,
      });
    }
    
    return players;
  } catch (error) {
    console.error(`Failed to get player stats for match ${matchId}:`, error);
    return [];
  }
}

// matchId缓存（日期_主队_客队 -> matchId）
const matchIdCache: Record<string, string> = {};

/**
 * 批量获取某一天所有比赛的matchId
 * 通过遍历一定范围的matchId来获取
 * @param gameDate 比赛日期 (YYYY-MM-DD)
 */
export async function loadMatchIdsForDate(gameDate: string): Promise<void> {
  try {
    // 已知的参考点: 2025-12-02的比赛matchId约为1794039
    // 每天大约有10-15场比赛
    const referenceDate = new Date('2025-12-02');
    const referenceId = 1794039;
    const targetDate = new Date(gameDate);
    
    // 计算日期差
    const daysDiff = Math.floor((targetDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // 估算目标日期的matchId（每天约12场比赛）
    const estimatedStartId = referenceId + daysDiff * 12;
    
    console.log(`Loading matchIds for ${gameDate}, estimated range: ${estimatedStartId - 30} to ${estimatedStartId + 30}...`);
    
    // 并行获取一批matchId（在估算ID前后各30个）
    const promises: Promise<void>[] = [];
    
    for (let id = estimatedStartId - 30; id <= estimatedStartId + 30; id++) {
      const promise = (async () => {
        try {
          const url = `${MATCH_API}/${id}.json`;
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
          });
          
          if (!response.ok) return;
          
          const data = await response.json() as any;
          
          if (data.match_date === gameDate) {
            const key = `${gameDate}_${data.home_id}_${data.visit_id}`;
            matchIdCache[key] = String(data.match_id);
          }
        } catch (e) {
          // 忽略单个请求错误
        }
      })();
      promises.push(promise);
    }
    
    await Promise.all(promises);
    console.log(`Loaded ${Object.keys(matchIdCache).filter(k => k.startsWith(gameDate)).length} matchIds for ${gameDate}`);
  } catch (error) {
    console.error(`Failed to load matchIds for ${gameDate}:`, error);
  }
}

/**
 * 获取matchId（从缓存或直接查找）
 */
export function getMatchIdFromCache(homeZhibo8Id: string, awayZhibo8Id: string, gameDate: string): string | null {
  const key = `${gameDate}_${homeZhibo8Id}_${awayZhibo8Id}`;
  return matchIdCache[key] || null;
}

/**
 * 获取指定比赛的球员本场得分（完整流程）
 * @param homeTeamId NBA主队ID
 * @param awayTeamId NBA客队ID
 * @param gameDate 比赛日期 (YYYY-MM-DD)
 * @returns 球员本场数据数组
 */
export async function getGameBoxscore(homeTeamId: number, awayTeamId: number, gameDate: string): Promise<PlayerGameStats[]> {
  // 转换为直播吧球队ID
  const homeZhibo8Id = getZhibo8TeamId(homeTeamId);
  const awayZhibo8Id = getZhibo8TeamId(awayTeamId);
  
  if (!homeZhibo8Id || !awayZhibo8Id) {
    console.log(`Cannot find zhibo8 team IDs for ${homeTeamId} vs ${awayTeamId}`);
    return [];
  }
  
  // 先尝试从缓存获取matchId
  let matchId = getMatchIdFromCache(homeZhibo8Id, awayZhibo8Id, gameDate);
  
  // 如果缓存中没有，加载该日期的所有matchId
  if (!matchId) {
    await loadMatchIdsForDate(gameDate);
    matchId = getMatchIdFromCache(homeZhibo8Id, awayZhibo8Id, gameDate);
  }
  
  if (!matchId) {
    console.log(`No matchId found for ${homeTeamId} vs ${awayTeamId} on ${gameDate}`);
    return [];
  }
  
  console.log(`Found matchId: ${matchId} for ${homeTeamId} vs ${awayTeamId} on ${gameDate}`);
  
  // 获取球员本场数据
  return getMatchPlayerStats(matchId);
}

