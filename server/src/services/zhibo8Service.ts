/**
 * 直播吧 NBA 数据爬虫服务
 * 数据来源: https://data.zhibo8.cc
 */

import fetch from 'node-fetch';

// 直播吧API基础URL
const API_BASE = 'https://data.zhibo8.cc/manage/public/app.php';

// 直播吧球队ID到NBA官方球队ID的映射（根据实际API返回的数据更新）
const ZHIBO8_TEAM_MAP: Record<string, { nbaId: number; name: string; abbr: string; nameCn: string }> = {
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
const TEAM_NAME_TO_ID: Record<string, string> = {};
for (const [id, info] of Object.entries(ZHIBO8_TEAM_MAP)) {
  TEAM_NAME_TO_ID[info.nameCn] = id;
  TEAM_NAME_TO_ID[info.name] = id;
  TEAM_NAME_TO_ID[info.abbr] = id;
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
function getTeamInfo(zhibo8TeamId: string): { nbaId: number; name: string; abbr: string; nameCn: string } | null {
  return ZHIBO8_TEAM_MAP[zhibo8TeamId] || null;
}

// 根据中文名获取球队ID
function getTeamIdByName(teamName: string): string | null {
  return TEAM_NAME_TO_ID[teamName] || null;
}

// 接口类型定义
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
  gameId: string;
  gameDate: string;
  utcMillis: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamNameCn: string;
  homeTeamScore: number;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamNameCn: string;
  awayTeamScore: number;
  status: string;
}

export interface Zhibo8TeamData {
  teamId: string;
  nbaTeamId: number;
  teamName: string;
  teamNameCn: string;
  wins: number;
  losses: number;
  confRank: number;
  players: Zhibo8Player[];
  recentGames: Zhibo8Game[];
}

/**
 * 获取球队数据（包括球员名单和统计）
 */
export async function getTeamData(zhibo8TeamId: string): Promise<Zhibo8TeamData | null> {
  try {
    const url = `${API_BASE}?_url=/nba_v2/team&teamId=${zhibo8TeamId}&random=${Math.random()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    // 获取原始文本，处理可能的PHP错误信息
    let text = await response.text();
    // 移除PHP错误信息，只保留JSON部分
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
    
    // 合并 recent_games, before_games 和 after_games
    const allGameLists = [
      ...(teamData.match?.recent_games || []),
      ...(teamData.match?.before_games || []),
      ...(teamData.match?.after_games || []),
    ];
    
    // 去重（使用 utcMillis + homeTeamId + awayTeamId 作为唯一标识）
    const seenGames = new Set<string>();
    
    for (const g of allGameLists) {
      const homeTeamId = getTeamIdByName(g.homeTeam);
      const awayTeamId = getTeamIdByName(g.awayTeam);
      
      if (!homeTeamId || !awayTeamId) continue;
      
      const gameKey = `${g.utcMillis}_${homeTeamId}_${awayTeamId}`;
      if (seenGames.has(gameKey)) continue;
      seenGames.add(gameKey);
      
      const homeInfo = getTeamInfo(homeTeamId);
      const awayInfo = getTeamInfo(awayTeamId);
      
      if (!homeInfo || !awayInfo) continue;
      
      // 从日期字符串提取日期 "2025年12月01日" -> "2025-12-01"
      const dateMatch = g.date.match(/(\d{4})年(\d{2})月(\d{2})日/);
      const gameDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : '';
      
      recentGames.push({
        gameId: `zhibo8_${g.utcMillis}_${homeTeamId}_${awayTeamId}`,
        gameDate,
        utcMillis: g.utcMillis,
        homeTeamId: homeInfo.nbaId,
        homeTeamName: homeInfo.name,
        homeTeamNameCn: g.homeTeam,
        homeTeamScore: parseInt(g.homeTeamScore) || 0,
        awayTeamId: awayInfo.nbaId,
        awayTeamName: awayInfo.name,
        awayTeamNameCn: g.awayTeam,
        awayTeamScore: parseInt(g.awayTeamScore) || 0,
        status: g.homeTeamScore && g.awayTeamScore ? 'Final' : 'Scheduled',
      });
    }
    
    return {
      teamId: zhibo8TeamId,
      nbaTeamId: teamInfo.nbaId,
      teamName: teamInfo.name,
      teamNameCn: teamInfo.nameCn,
      wins: parseInt(teamData.team?.wins) || 0,
      losses: parseInt(teamData.team?.losses) || 0,
      confRank: parseInt(teamData.team?.confRank) || 0,
      players,
      recentGames,
    };
  } catch (error) {
    console.error(`Failed to fetch team data for ${zhibo8TeamId}:`, error);
    return null;
  }
}

/**
 * 获取所有球队列表
 */
export async function getAllTeams(): Promise<{ teamId: string; nbaTeamId: number; teamName: string; teamNameCn: string }[]> {
  const teams: { teamId: string; nbaTeamId: number; teamName: string; teamNameCn: string }[] = [];
  
  for (const [teamId, info] of Object.entries(ZHIBO8_TEAM_MAP)) {
    teams.push({
      teamId,
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
    const teamData = await getTeamData(team.teamId);
    
    if (teamData) {
      for (const player of teamData.players) {
        // 如果球员已存在，保留得分更高的记录（可能是转会后的球员）
        const existing = allPlayers.get(player.playerId);
        if (!existing || player.pointsPerGame > existing.pointsPerGame) {
          allPlayers.set(player.playerId, player);
        }
      }
    }
    
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return allPlayers;
}

/**
 * 获取球员每场比赛的得分数据
 * 从直播吧球员详情页面获取：https://data.zhibo8.cc/nbaData/player/#/shuju?player_id=xxx
 * @param zhibo8PlayerId 直播吧球员ID
 * @param gameDate 比赛日期 (YYYY-MM-DD)
 * @param opponentTeamName 对手球队名（中文，用于匹配）
 * @returns 球员该场比赛的得分、篮板、助攻等数据
 */
export async function getPlayerGameStats(
  zhibo8PlayerId: string,
  gameDate: string,
  opponentTeamName?: string
): Promise<{ points: number; rebounds: number; assists: number } | null> {
  try {
    // 尝试从直播吧球员详情API获取比赛数据
    // 根据用户提供的URL格式，尝试不同的API路径
    const apiPaths = [
      `?_url=/nba_v2/player_games&player_id=${zhibo8PlayerId}`,
      `?_url=/nba_v2/player_detail&player_id=${zhibo8PlayerId}`,
      `?_url=/nba_v2/player_game_stats&player_id=${zhibo8PlayerId}`,
    ];
    
    for (const path of apiPaths) {
      try {
        const url = `${API_BASE}${path}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        let text = await response.text();
        const jsonStart = text.indexOf('{');
        if (jsonStart > 0) {
          text = text.substring(jsonStart);
        }
        
        try {
          const data = JSON.parse(text);
          
          if (data.status === '1' && data.data) {
            // 查找匹配的比赛数据
            const games = data.data.games || data.data.game_list || data.data.list || [];
            for (const game of games) {
              // 匹配日期
              let gameDateStr = game.date || game.gameDate || game.日期 || '';
              // 处理不同的日期格式
              if (gameDateStr.includes('年') && gameDateStr.includes('月')) {
                // "2025年12月01日" -> "2025-12-01"
                const dateMatch = gameDateStr.match(/(\d{4})年(\d{2})月(\d{2})日/);
                if (dateMatch) {
                  gameDateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                }
              }
              
              if (gameDateStr === gameDate || gameDateStr.replace(/-/g, '') === gameDate.replace(/-/g, '')) {
                // 如果提供了对手球队名，需要匹配
                const opponent = game.opponent || game.对手 || game.opponentTeam || '';
                if (!opponentTeamName || opponent.includes(opponentTeamName) || opponentTeamName.includes(opponent)) {
                  return {
                    points: parseInt(game.points || game.得分 || game.分数 || 0) || 0,
                    rebounds: parseInt(game.rebounds || game.篮板 || 0) || 0,
                    assists: parseInt(game.assists || game.助攻 || 0) || 0,
                  };
                }
              }
            }
          }
        } catch (parseError) {
          // JSON解析失败，继续尝试下一个路径
          continue;
        }
      } catch (e) {
        // 网络错误，继续尝试下一个路径
        continue;
      }
    }
    
    // 如果API不可用，返回null
    return null;
  } catch (error) {
    console.error(`Failed to get player game stats for ${zhibo8PlayerId}:`, error);
    return null;
  }
}

/**
 * 从球队比赛数据中获取球员的单场得分
 * 这个方法通过获取球队的比赛数据，然后匹配球员
 * @param teamId 球队ID
 * @param gameDate 比赛日期
 * @param playerName 球员名（中文）
 * @returns 球员该场比赛的得分、篮板、助攻
 */
export async function getPlayerGameStatsFromTeam(
  teamId: string,
  gameDate: string,
  playerName: string
): Promise<{ points: number; rebounds: number; assists: number } | null> {
  try {
    // 获取球队数据
    const teamData = await getTeamData(teamId);
    if (!teamData) {
      return null;
    }
    
    // 查找该日期的比赛
    const game = teamData.recentGames.find(g => g.gameDate === gameDate);
    if (!game || game.status !== 'Final') {
      return null;
    }
    
    // 注意：直播吧的球队API可能不包含单场球员得分
    // 需要从其他数据源获取，或者通过解析网页
    
    // 暂时返回null，需要实现从网页解析或使用其他API
    return null;
  } catch (error) {
    console.error(`Failed to get player game stats from team for ${playerName}:`, error);
    return null;
  }
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
      teamName: player.teamName,
      playerName: player.playerName,
    };
  }
  
  return result;
}

/**
 * 获取特定球队的球员名单（用于未来比赛）
 */
export async function getTeamRoster(zhibo8TeamId: string): Promise<Zhibo8Player[]> {
  const teamData = await getTeamData(zhibo8TeamId);
  return teamData?.players || [];
}

/**
 * 根据中文球队名获取球员名单
 */
export async function getTeamRosterByName(teamNameCn: string): Promise<Zhibo8Player[]> {
  const teamId = getTeamIdByName(teamNameCn);
  if (!teamId) {
    console.error(`Unknown team name: ${teamNameCn}`);
    return [];
  }
  return getTeamRoster(teamId);
}

/**
 * 获取所有球队的赛程（合并去重）
 */
export async function getAllGames(): Promise<Zhibo8Game[]> {
  const gamesMap = new Map<string, Zhibo8Game>();
  
  const teams = await getAllTeams();
  
  for (const team of teams) {
    const teamData = await getTeamData(team.teamId);
    
    if (teamData) {
      for (const game of teamData.recentGames) {
        // 使用比赛时间戳和球队ID作为唯一标识
        const key = `${game.utcMillis}_${Math.min(game.homeTeamId, game.awayTeamId)}_${Math.max(game.homeTeamId, game.awayTeamId)}`;
        if (!gamesMap.has(key)) {
          gamesMap.set(key, game);
        }
      }
    }
    
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // 按日期排序
  const games = Array.from(gamesMap.values());
  games.sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  
  return games;
}

// 导出球队映射供其他模块使用
export { ZHIBO8_TEAM_MAP, TEAM_NAME_TO_ID, getTeamInfo, getTeamIdByName, getOrCreatePlayerId };

