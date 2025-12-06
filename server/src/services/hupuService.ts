/**
 * 虎扑NBA数据爬虫服务
 * 用于替代NBA官方API获取比赛和球员数据
 */

import { config } from '../config';

// 虎扑请求头
const HUPU_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Connection': 'keep-alive',
  'Referer': 'https://nba.hupu.com/'
};

// 虎扑球队名称到NBA Team ID的映射
const HUPU_TEAM_MAP: Record<string, { id: number; name: string; abbr: string }> = {
  '火箭': { id: 1610612745, name: 'Rockets', abbr: 'HOU' },
  '休斯顿火箭': { id: 1610612745, name: 'Rockets', abbr: 'HOU' },
  '马刺': { id: 1610612759, name: 'Spurs', abbr: 'SAS' },
  '圣安东尼奥马刺': { id: 1610612759, name: 'Spurs', abbr: 'SAS' },
  '灰熊': { id: 1610612763, name: 'Grizzlies', abbr: 'MEM' },
  '孟菲斯灰熊': { id: 1610612763, name: 'Grizzlies', abbr: 'MEM' },
  '独行侠': { id: 1610612742, name: 'Mavericks', abbr: 'DAL' },
  '达拉斯独行侠': { id: 1610612742, name: 'Mavericks', abbr: 'DAL' },
  '鹈鹕': { id: 1610612740, name: 'Pelicans', abbr: 'NOP' },
  '新奥尔良鹈鹕': { id: 1610612740, name: 'Pelicans', abbr: 'NOP' },
  '湖人': { id: 1610612747, name: 'Lakers', abbr: 'LAL' },
  '洛杉矶湖人': { id: 1610612747, name: 'Lakers', abbr: 'LAL' },
  '太阳': { id: 1610612756, name: 'Suns', abbr: 'PHX' },
  '菲尼克斯太阳': { id: 1610612756, name: 'Suns', abbr: 'PHX' },
  '勇士': { id: 1610612744, name: 'Warriors', abbr: 'GSW' },
  '金州勇士': { id: 1610612744, name: 'Warriors', abbr: 'GSW' },
  '快船': { id: 1610612746, name: 'Clippers', abbr: 'LAC' },
  '洛杉矶快船': { id: 1610612746, name: 'Clippers', abbr: 'LAC' },
  '国王': { id: 1610612758, name: 'Kings', abbr: 'SAC' },
  '萨克拉门托国王': { id: 1610612758, name: 'Kings', abbr: 'SAC' },
  '雷霆': { id: 1610612760, name: 'Thunder', abbr: 'OKC' },
  '俄克拉荷马城雷霆': { id: 1610612760, name: 'Thunder', abbr: 'OKC' },
  '掘金': { id: 1610612743, name: 'Nuggets', abbr: 'DEN' },
  '丹佛掘金': { id: 1610612743, name: 'Nuggets', abbr: 'DEN' },
  '森林狼': { id: 1610612750, name: 'Timberwolves', abbr: 'MIN' },
  '明尼苏达森林狼': { id: 1610612750, name: 'Timberwolves', abbr: 'MIN' },
  '开拓者': { id: 1610612757, name: 'Trail Blazers', abbr: 'POR' },
  '波特兰开拓者': { id: 1610612757, name: 'Trail Blazers', abbr: 'POR' },
  '爵士': { id: 1610612762, name: 'Jazz', abbr: 'UTA' },
  '犹他爵士': { id: 1610612762, name: 'Jazz', abbr: 'UTA' },
  '尼克斯': { id: 1610612752, name: 'Knicks', abbr: 'NYK' },
  '纽约尼克斯': { id: 1610612752, name: 'Knicks', abbr: 'NYK' },
  '猛龙': { id: 1610612761, name: 'Raptors', abbr: 'TOR' },
  '多伦多猛龙': { id: 1610612761, name: 'Raptors', abbr: 'TOR' },
  '凯尔特人': { id: 1610612738, name: 'Celtics', abbr: 'BOS' },
  '波士顿凯尔特人': { id: 1610612738, name: 'Celtics', abbr: 'BOS' },
  '76人': { id: 1610612755, name: '76ers', abbr: 'PHI' },
  '费城76人': { id: 1610612755, name: '76ers', abbr: 'PHI' },
  '篮网': { id: 1610612751, name: 'Nets', abbr: 'BKN' },
  '布鲁克林篮网': { id: 1610612751, name: 'Nets', abbr: 'BKN' },
  '热火': { id: 1610612748, name: 'Heat', abbr: 'MIA' },
  '迈阿密热火': { id: 1610612748, name: 'Heat', abbr: 'MIA' },
  '老鹰': { id: 1610612737, name: 'Hawks', abbr: 'ATL' },
  '亚特兰大老鹰': { id: 1610612737, name: 'Hawks', abbr: 'ATL' },
  '魔术': { id: 1610612753, name: 'Magic', abbr: 'ORL' },
  '奥兰多魔术': { id: 1610612753, name: 'Magic', abbr: 'ORL' },
  '黄蜂': { id: 1610612766, name: 'Hornets', abbr: 'CHA' },
  '夏洛特黄蜂': { id: 1610612766, name: 'Hornets', abbr: 'CHA' },
  '奇才': { id: 1610612764, name: 'Wizards', abbr: 'WAS' },
  '华盛顿奇才': { id: 1610612764, name: 'Wizards', abbr: 'WAS' },
  '活塞': { id: 1610612765, name: 'Pistons', abbr: 'DET' },
  '底特律活塞': { id: 1610612765, name: 'Pistons', abbr: 'DET' },
  '骑士': { id: 1610612739, name: 'Cavaliers', abbr: 'CLE' },
  '克利夫兰骑士': { id: 1610612739, name: 'Cavaliers', abbr: 'CLE' },
  '公牛': { id: 1610612741, name: 'Bulls', abbr: 'CHI' },
  '芝加哥公牛': { id: 1610612741, name: 'Bulls', abbr: 'CHI' },
  '雄鹿': { id: 1610612749, name: 'Bucks', abbr: 'MIL' },
  '密尔沃基雄鹿': { id: 1610612749, name: 'Bucks', abbr: 'MIL' },
  '步行者': { id: 1610612754, name: 'Pacers', abbr: 'IND' },
  '印第安纳步行者': { id: 1610612754, name: 'Pacers', abbr: 'IND' },
};

// 虎扑球员ID到NBA Player ID的映射缓存
const playerIdCache = new Map<string, number>();
let playerIdCounter = 9000000; // 为虎扑独有的球员ID生成一个临时ID

// 从HTML中提取文本
const extractText = (html: string, pattern: RegExp): string | null => {
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
};

// 从HTML中提取所有匹配
const extractAllMatches = (html: string, pattern: RegExp): RegExpMatchArray[] => {
  return [...html.matchAll(pattern)];
};

// 英文slug到球队信息的映射
const SLUG_TO_TEAM: Record<string, { id: number; name: string; abbr: string }> = {
  'rockets': { id: 1610612745, name: 'Rockets', abbr: 'HOU' },
  'spurs': { id: 1610612759, name: 'Spurs', abbr: 'SAS' },
  'grizzlies': { id: 1610612763, name: 'Grizzlies', abbr: 'MEM' },
  'mavericks': { id: 1610612742, name: 'Mavericks', abbr: 'DAL' },
  'pelicans': { id: 1610612740, name: 'Pelicans', abbr: 'NOP' },
  'lakers': { id: 1610612747, name: 'Lakers', abbr: 'LAL' },
  'suns': { id: 1610612756, name: 'Suns', abbr: 'PHX' },
  'warriors': { id: 1610612744, name: 'Warriors', abbr: 'GSW' },
  'clippers': { id: 1610612746, name: 'Clippers', abbr: 'LAC' },
  'kings': { id: 1610612758, name: 'Kings', abbr: 'SAC' },
  'thunder': { id: 1610612760, name: 'Thunder', abbr: 'OKC' },
  'nuggets': { id: 1610612743, name: 'Nuggets', abbr: 'DEN' },
  'timberwolves': { id: 1610612750, name: 'Timberwolves', abbr: 'MIN' },
  'blazers': { id: 1610612757, name: 'Trail Blazers', abbr: 'POR' },
  'jazz': { id: 1610612762, name: 'Jazz', abbr: 'UTA' },
  'knicks': { id: 1610612752, name: 'Knicks', abbr: 'NYK' },
  'raptors': { id: 1610612761, name: 'Raptors', abbr: 'TOR' },
  'celtics': { id: 1610612738, name: 'Celtics', abbr: 'BOS' },
  '76ers': { id: 1610612755, name: '76ers', abbr: 'PHI' },
  'nets': { id: 1610612751, name: 'Nets', abbr: 'BKN' },
  'heat': { id: 1610612748, name: 'Heat', abbr: 'MIA' },
  'hawks': { id: 1610612737, name: 'Hawks', abbr: 'ATL' },
  'magic': { id: 1610612753, name: 'Magic', abbr: 'ORL' },
  'hornets': { id: 1610612766, name: 'Hornets', abbr: 'CHA' },
  'wizards': { id: 1610612764, name: 'Wizards', abbr: 'WAS' },
  'pistons': { id: 1610612765, name: 'Pistons', abbr: 'DET' },
  'cavaliers': { id: 1610612739, name: 'Cavaliers', abbr: 'CLE' },
  'bulls': { id: 1610612741, name: 'Bulls', abbr: 'CHI' },
  'bucks': { id: 1610612749, name: 'Bucks', abbr: 'MIL' },
  'pacers': { id: 1610612754, name: 'Pacers', abbr: 'IND' },
};

// 获取虎扑球队信息
const getTeamInfo = (teamName: string): { id: number; name: string; abbr: string } | null => {
  // 尝试直接匹配中文名
  if (HUPU_TEAM_MAP[teamName]) {
    return HUPU_TEAM_MAP[teamName];
  }
  // 尝试匹配英文slug
  const lowerName = teamName.toLowerCase();
  if (SLUG_TO_TEAM[lowerName]) {
    return SLUG_TO_TEAM[lowerName];
  }
  // 尝试部分匹配中文名
  for (const [key, value] of Object.entries(HUPU_TEAM_MAP)) {
    if (teamName.includes(key) || key.includes(teamName)) {
      return value;
    }
  }
  return null;
};

// 生成或获取球员ID
const getOrCreatePlayerId = (hupuPlayerUrl: string, playerName: string): number => {
  // 尝试从URL中提取虎扑球员ID
  const match = hupuPlayerUrl.match(/players\/([a-z]+)-(\d+)\.html/i);
  if (match) {
    const hupuId = match[2];
    if (playerIdCache.has(hupuId)) {
      return playerIdCache.get(hupuId)!;
    }
    // 虎扑ID通常是6位数字，我们可以直接使用
    const numId = parseInt(hupuId);
    if (numId > 0) {
      playerIdCache.set(hupuId, numId);
      return numId;
    }
  }
  // 如果无法提取，使用球员名称生成一个临时ID
  const nameKey = playerName.toLowerCase().replace(/[^a-z]/g, '');
  if (playerIdCache.has(nameKey)) {
    return playerIdCache.get(nameKey)!;
  }
  const newId = playerIdCounter++;
  playerIdCache.set(nameKey, newId);
  return newId;
};

// 请求虎扑页面
const fetchHupu = async (path: string): Promise<string> => {
  const url = path.startsWith('http') ? path : `https://nba.hupu.com${path}`;
  const res = await fetch(url, { headers: HUPU_HEADERS });
  if (!res.ok) {
    throw new Error(`Hupu Request Failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
};

// 解析北京时间字符串为UTC ISO格式
const parseBeijingTime = (dateStr: string, timeStr: string): string => {
  // dateStr: "12月01日", timeStr: "07:00"
  const year = new Date().getFullYear();
  const monthMatch = dateStr.match(/(\d+)月/);
  const dayMatch = dateStr.match(/(\d+)日/);
  if (!monthMatch || !dayMatch) return '';
  
  const month = parseInt(monthMatch[1]) - 1;
  const day = parseInt(dayMatch[1]);
  const [hour, minute] = timeStr.split(':').map(Number);
  
  // 创建北京时间的Date对象 (UTC+8)
  const beijingDate = new Date(Date.UTC(year, month, day, hour - 8, minute));
  return beijingDate.toISOString();
};

export interface HupuGame {
  gameId: string;
  gameDate: string;
  tipoff: string;
  status: string;
  homeTeam: {
    teamId: number;
    teamName: string;
    teamNameCn: string;
    score: number;
  };
  awayTeam: {
    teamId: number;
    teamName: string;
    teamNameCn: string;
    score: number;
  };
  boxscoreUrl?: string;
}

export interface HupuPlayer {
  playerId: number;
  playerName: string;
  playerNameCn: string;
  teamId: number;
  teamName: string;
  teamNameCn: string;
  position: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgMade: number;
  fgAttempted: number;
  threeMade: number;
  threeAttempted: number;
  ftMade: number;
  ftAttempted: number;
  plusMinus: number;
  isStarter: boolean;
}

export interface HupuBoxscore {
  gameId: string;
  status: string;
  homeTeam: {
    teamId: number;
    teamName: string;
    teamNameCn: string;
    score: number;
    players: HupuPlayer[];
  };
  awayTeam: {
    teamId: number;
    teamName: string;
    teamNameCn: string;
    score: number;
    players: HupuPlayer[];
  };
}

export interface HupuPlayerStats {
  playerId: number;
  playerName: string;
  playerNameCn: string;
  teamId: number;
  teamName: string;
  teamNameCn: string;
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame?: number;
  assistsPerGame?: number;
  fgPercent?: number;
  threePercent?: number;
  ftPercent?: number;
}

/**
 * 获取虎扑赛程数据
 * @param startDate 开始日期 YYYY-MM-DD
 * @param endDate 结束日期 YYYY-MM-DD
 */
export const getHupuSchedule = async (startDate?: string, endDate?: string): Promise<HupuGame[]> => {
  const games: HupuGame[] = [];
  
  try {
    // 获取赛程页面
    const html = await fetchHupu('/schedule');
    
    // 解析赛程表格
    // 日期行格式: <tr class="left linglei"><td colspan="3" class="left" width="135">12月01日&nbsp;&nbsp;星期一</td></tr>
    // 比赛行格式: <tr class="left"><td class="left" width="135">07:00</td><td width="360">...</td><td>...</td></tr>
    
    const datePattern = /<tr class="left linglei">\s*<td[^>]*>(\d+月\d+日)[^<]*<\/td>/g;
    const gameRowPattern = /<tr class="left">\s*<td[^>]*>(\d+:\d+)<\/td>\s*<td[^>]*>\s*<a[^>]*>([^<]+)<\/a>\s*&nbsp;vs&nbsp;\s*<a[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td>\s*(?:<a[^>]*href="([^"]*)"[^>]*>数据统计<\/a>)?/g;
    
    let currentDate = '';
    let lastIndex = 0;
    
    // 先找到所有日期
    const dateMatches = extractAllMatches(html, datePattern);
    const datePositions = dateMatches.map(m => ({
      date: m[1],
      index: m.index || 0
    }));
    
    // 然后找到所有比赛
    const gameMatches = extractAllMatches(html, gameRowPattern);
    
    for (const gameMatch of gameMatches) {
      const gameIndex = gameMatch.index || 0;
      
      // 找到这场比赛对应的日期
      for (let i = datePositions.length - 1; i >= 0; i--) {
        if (datePositions[i].index < gameIndex) {
          currentDate = datePositions[i].date;
          break;
        }
      }
      
      if (!currentDate) continue;
      
      const time = gameMatch[1];
      const awayTeamCn = gameMatch[2];
      const homeTeamCn = gameMatch[3];
      const boxscoreUrl = gameMatch[4] || '';
      
      const awayTeamInfo = getTeamInfo(awayTeamCn);
      const homeTeamInfo = getTeamInfo(homeTeamCn);
      
      if (!awayTeamInfo || !homeTeamInfo) {
        console.warn(`Unknown team: ${awayTeamCn} or ${homeTeamCn}`);
        continue;
      }
      
      // 从boxscoreUrl提取gameId
      const gameIdMatch = boxscoreUrl.match(/boxscore\/(\d+)/);
      const gameId = gameIdMatch ? gameIdMatch[1] : `hupu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      const tipoff = parseBeijingTime(currentDate, time);
      const gameDate = tipoff.split('T')[0];
      
      // 判断比赛状态
      let status = 'Scheduled';
      if (boxscoreUrl) {
        status = 'Final'; // 有数据统计链接说明比赛已结束
      }
      
      // 修复boxscoreUrl路径
      let finalBoxscoreUrl: string | undefined;
      if (boxscoreUrl) {
        if (boxscoreUrl.startsWith('http')) {
          finalBoxscoreUrl = boxscoreUrl;
        } else if (boxscoreUrl.startsWith('/')) {
          finalBoxscoreUrl = `https://nba.hupu.com${boxscoreUrl}`;
        } else {
          finalBoxscoreUrl = `https://nba.hupu.com/${boxscoreUrl}`;
        }
      }
      
      games.push({
        gameId,
        gameDate,
        tipoff,
        status,
        homeTeam: {
          teamId: homeTeamInfo.id,
          teamName: homeTeamInfo.name,
          teamNameCn: homeTeamCn,
          score: 0
        },
        awayTeam: {
          teamId: awayTeamInfo.id,
          teamName: awayTeamInfo.name,
          teamNameCn: awayTeamCn,
          score: 0
        },
        boxscoreUrl: finalBoxscoreUrl
      });
    }
    
    // 按日期筛选
    if (startDate || endDate) {
      return games.filter(g => {
        if (startDate && g.gameDate < startDate) return false;
        if (endDate && g.gameDate > endDate) return false;
        return true;
      });
    }
    
    return games;
  } catch (error) {
    console.error('Failed to fetch Hupu schedule:', error);
    return [];
  }
};

/**
 * 获取虎扑比赛详情（球员数据）
 * @param gameId 虎扑比赛ID
 */
export const getHupuBoxscore = async (gameId: string): Promise<HupuBoxscore | null> => {
  try {
    const html = await fetchHupu(`/games/boxscore/${gameId}`);
    
    // 解析比分
    // 客队: <div class="team_a">...<h2>117</h2>...<a href="...">凯尔特人</a>...
    // 主队: <div class="team_b">...<h2>115</h2>...<a href="...">骑士</a>...
    
    const awayScoreMatch = html.match(/<div class="team_a">[\s\S]*?<h2>(\d+)<\/h2>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    const homeScoreMatch = html.match(/<div class="team_b">[\s\S]*?<h2>(\d+)<\/h2>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    
    if (!awayScoreMatch || !homeScoreMatch) {
      console.error('Failed to parse team scores from Hupu boxscore');
      return null;
    }
    
    const awayScore = parseInt(awayScoreMatch[1]);
    const awayTeamCn = awayScoreMatch[2];
    const homeScore = parseInt(homeScoreMatch[1]);
    const homeTeamCn = homeScoreMatch[2];
    
    const awayTeamInfo = getTeamInfo(awayTeamCn);
    const homeTeamInfo = getTeamInfo(homeTeamCn);
    
    if (!awayTeamInfo || !homeTeamInfo) {
      console.error(`Unknown team in boxscore: ${awayTeamCn} or ${homeTeamCn}`);
      return null;
    }
    
    // 解析球员数据
    // 客队表格: <table id="J_away_content">
    // 主队表格: <table id="J_home_content">
    
    const parsePlayersTable = (tableHtml: string, teamId: number, teamName: string, teamNameCn: string): HupuPlayer[] => {
      const players: HupuPlayer[] = [];
      
      // 球员行格式:
      // <tr><td class="tdw-1 left"><a href="...">球员名</a></td><td>位置</td><td>时间</td><td>投篮</td><td>3分</td><td>罚球</td><td>前场</td><td>后场</td><td>篮板</td><td>助攻</td><td>犯规</td><td>抢断</td><td>失误</td><td>封盖</td><td>得分</td><td>+/-</td></tr>
      
      const playerRowPattern = /<tr[^>]*>\s*<td class="tdw-1 left"><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/td>\s*<td>([^<]*)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)-(\d+)<\/td>\s*<td>(\d+)-(\d+)<\/td>\s*<td>(\d+)-(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>\s*(?:<span[^>]*>)?(\d+)(?:<\/span>)?<\/td>\s*<td>\s*(?:<span[^>]*>)?(\d+)(?:<\/span>)?<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>\s*(?:<span[^>]*>)?(\d+)(?:<\/span>)?<\/td>\s*<td>\s*([+-]?\d+)/g;
      
      const matches = extractAllMatches(tableHtml, playerRowPattern);
      let isStarter = true;
      let starterCount = 0;
      
      for (const match of matches) {
        const playerUrl = match[1];
        const playerNameCn = match[2];
        const position = match[3];
        const minutes = parseInt(match[4]);
        const fgMade = parseInt(match[5]);
        const fgAttempted = parseInt(match[6]);
        const threeMade = parseInt(match[7]);
        const threeAttempted = parseInt(match[8]);
        const ftMade = parseInt(match[9]);
        const ftAttempted = parseInt(match[10]);
        const offReb = parseInt(match[11]);
        const defReb = parseInt(match[12]);
        const rebounds = parseInt(match[13]);
        const assists = parseInt(match[14]);
        const fouls = parseInt(match[15]);
        const steals = parseInt(match[16]);
        const turnovers = parseInt(match[17]);
        const blocks = parseInt(match[18]);
        const points = parseInt(match[19]);
        const plusMinus = parseInt(match[20]);
        
        starterCount++;
        if (starterCount > 5) {
          isStarter = false;
        }
        
        const playerId = getOrCreatePlayerId(playerUrl, playerNameCn);
        
        players.push({
          playerId,
          playerName: playerNameCn, // 使用中文名
          playerNameCn,
          teamId,
          teamName,
          teamNameCn,
          position,
          minutes,
          points,
          rebounds,
          assists,
          steals,
          blocks,
          turnovers,
          fouls,
          fgMade,
          fgAttempted,
          threeMade,
          threeAttempted,
          ftMade,
          ftAttempted,
          plusMinus,
          isStarter
        });
      }
      
      return players;
    };
    
    // 提取客队表格
    const awayTableMatch = html.match(/<table id="J_away_content">([\s\S]*?)<\/table>/);
    const awayPlayers = awayTableMatch ? parsePlayersTable(awayTableMatch[1], awayTeamInfo.id, awayTeamInfo.name, awayTeamCn) : [];
    
    // 提取主队表格
    const homeTableMatch = html.match(/<table id="J_home_content">([\s\S]*?)<\/table>/);
    const homePlayers = homeTableMatch ? parsePlayersTable(homeTableMatch[1], homeTeamInfo.id, homeTeamInfo.name, homeTeamCn) : [];
    
    return {
      gameId,
      status: 'Final',
      homeTeam: {
        teamId: homeTeamInfo.id,
        teamName: homeTeamInfo.name,
        teamNameCn: homeTeamCn,
        score: homeScore,
        players: homePlayers
      },
      awayTeam: {
        teamId: awayTeamInfo.id,
        teamName: awayTeamInfo.name,
        teamNameCn: awayTeamCn,
        score: awayScore,
        players: awayPlayers
      }
    };
  } catch (error) {
    console.error(`Failed to fetch Hupu boxscore for game ${gameId}:`, error);
    return null;
  }
};

/**
 * 获取虎扑球员赛季统计数据
 * @param statType 统计类型: pts(得分), reb(篮板), asts(助攻), blk(盖帽), stl(抢断)
 * @param page 页码
 */
export const getHupuPlayerStats = async (statType: string = 'pts', page: number = 1): Promise<HupuPlayerStats[]> => {
  const players: HupuPlayerStats[] = [];
  
  try {
    const path = page > 1 ? `/stats/players/${statType}/${page}` : `/stats/players/${statType}`;
    const html = await fetchHupu(path);
    
    // 简化的正则表达式，逐步提取数据
    // 匹配每一行球员数据
    const rowPattern = /<tr>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*class="left"[^>]*><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/td>\s*<td[^>]*><a href="[^"]*">([^<]+)<\/a><\/td>\s*<td[^>]*>([0-9.]+)<\/td>[\s\S]*?<td[^>]*>(\d+)<\/td>\s*<td[^>]*>([0-9.]+)<\/td>\s*<\/tr>/g;
    
    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const rank = parseInt(match[1]);
      const playerUrl = match[2];
      const playerNameCn = match[3].trim();
      const teamNameCn = match[4].trim();
      const points = parseFloat(match[5]);
      const gamesPlayed = parseInt(match[6]);
      const minutes = parseFloat(match[7]);
      
      const teamInfo = getTeamInfo(teamNameCn);
      if (!teamInfo) {
        console.warn(`Unknown team: ${teamNameCn}`);
        continue;
      }
      
      const playerId = getOrCreatePlayerId(playerUrl, playerNameCn);
      
      players.push({
        playerId,
        playerName: playerNameCn,
        playerNameCn,
        teamId: teamInfo.id,
        teamName: teamInfo.name,
        teamNameCn,
        gamesPlayed,
        minutesPerGame: minutes,
        pointsPerGame: points
      });
    }
    
    return players;
  } catch (error) {
    console.error(`Failed to fetch Hupu player stats (${statType}, page ${page}):`, error);
    return [];
  }
};

/**
 * 获取所有球员的赛季场均得分
 * 返回 playerId -> avgPoints 的映射
 */
export const getHupuSeasonAverages = async (): Promise<Record<number, { avg: number; teamId: number; teamName: string; playerName: string }>> => {
  const result: Record<number, { avg: number; teamId: number; teamName: string; playerName: string }> = {};
  
  // 获取多页数据以覆盖更多球员
  for (let page = 1; page <= 10; page++) {
    const players = await getHupuPlayerStats('pts', page);
    if (players.length === 0) break;
    
    for (const player of players) {
      result[player.playerId] = {
        avg: player.pointsPerGame,
        teamId: player.teamId,
        teamName: player.teamName,
        playerName: player.playerNameCn
      };
    }
    
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return result;
};

/**
 * 获取指定日期的比赛列表（从赛程页面）
 */
export const getHupuDailyGames = async (dateKey: string): Promise<HupuGame[]> => {
  const allGames = await getHupuSchedule();
  return allGames.filter(g => g.gameDate === dateKey);
};

/**
 * 获取球队名单（从球队球员页面）
 */
export const getHupuTeamRoster = async (teamSlug: string): Promise<HupuPlayer[]> => {
  const players: HupuPlayer[] = [];
  
  try {
    // 使用 /players/{teamSlug} 页面获取球员列表
    const html = await fetchHupu(`/players/${teamSlug}`);
    
    const teamInfo = getTeamInfo(teamSlug);
    if (!teamInfo) {
      console.warn(`Unknown team slug: ${teamSlug}`);
      return [];
    }
    
    // 解析球员表格
    // 格式: <tr>
    //   <td class="td_padding"><a href="..."><img ...></a></td>
    //   <td class="left"><b><a target="_blank" href="https://nba.hupu.com/players/xxx.html">球员名</a></b><p>(<b>English Name</b>)</p></td>
    //   <td>号码</td>
    //   <td>位置</td>
    //   ...
    // </tr>
    
    const playerRowPattern = /<tr>\s*<td class="td_padding">[\s\S]*?<\/td>\s*<td class="left">\s*<b><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/b>[\s\S]*?<\/td>\s*<td>(\d*)<\/td>\s*<td>([^<]*)<\/td>/g;
    
    let match;
    const seen = new Set<number>();
    
    while ((match = playerRowPattern.exec(html)) !== null) {
      const playerUrl = match[1];
      const playerNameCn = match[2].trim();
      const jerseyNum = match[3];
      const position = match[4].trim();
      
      const playerId = getOrCreatePlayerId(playerUrl, playerNameCn);
      if (seen.has(playerId)) continue;
      seen.add(playerId);
      
      players.push({
        playerId,
        playerName: playerNameCn,
        playerNameCn,
        teamId: teamInfo.id,
        teamName: teamInfo.name,
        teamNameCn: teamSlug,
        position,
        minutes: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0,
        fgMade: 0,
        fgAttempted: 0,
        threeMade: 0,
        threeAttempted: 0,
        ftMade: 0,
        ftAttempted: 0,
        plusMinus: 0,
        isStarter: false
      });
    }
    
    console.log(`Fetched ${players.length} players for team ${teamSlug}`);
    return players;
  } catch (error) {
    console.error(`Failed to fetch Hupu team roster for ${teamSlug}:`, error);
    return [];
  }
};

// 球队slug映射（虎扑URL使用的slug）
export const TEAM_SLUG_MAP: Record<number, string> = {
  1610612745: 'rockets',      // 火箭
  1610612759: 'spurs',        // 马刺
  1610612763: 'grizzlies',    // 灰熊
  1610612742: 'mavericks',    // 独行侠
  1610612740: 'pelicans',     // 鹈鹕
  1610612747: 'lakers',       // 湖人
  1610612756: 'suns',         // 太阳
  1610612744: 'warriors',     // 勇士
  1610612746: 'clippers',     // 快船
  1610612758: 'kings',        // 国王
  1610612760: 'thunder',      // 雷霆
  1610612743: 'nuggets',      // 掘金
  1610612750: 'timberwolves', // 森林狼
  1610612757: 'blazers',      // 开拓者
  1610612762: 'jazz',         // 爵士
  1610612752: 'knicks',       // 尼克斯
  1610612761: 'raptors',      // 猛龙
  1610612738: 'celtics',      // 凯尔特人
  1610612755: '76ers',        // 76人
  1610612751: 'nets',         // 篮网
  1610612748: 'heat',         // 热火
  1610612737: 'hawks',        // 老鹰
  1610612753: 'magic',        // 魔术
  1610612766: 'hornets',      // 黄蜂
  1610612764: 'wizards',      // 奇才
  1610612765: 'pistons',      // 活塞
  1610612739: 'cavaliers',    // 骑士
  1610612741: 'bulls',        // 公牛
  1610612749: 'bucks',        // 雄鹿
  1610612754: 'pacers',       // 步行者
};

// 中文球队名到slug的映射
export const TEAM_CN_TO_SLUG: Record<string, string> = {
  '火箭': 'rockets',
  '休斯顿火箭': 'rockets',
  '马刺': 'spurs',
  '圣安东尼奥马刺': 'spurs',
  '灰熊': 'grizzlies',
  '孟菲斯灰熊': 'grizzlies',
  '独行侠': 'mavericks',
  '达拉斯独行侠': 'mavericks',
  '鹈鹕': 'pelicans',
  '新奥尔良鹈鹕': 'pelicans',
  '湖人': 'lakers',
  '洛杉矶湖人': 'lakers',
  '太阳': 'suns',
  '菲尼克斯太阳': 'suns',
  '勇士': 'warriors',
  '金州勇士': 'warriors',
  '快船': 'clippers',
  '洛杉矶快船': 'clippers',
  '国王': 'kings',
  '萨克拉门托国王': 'kings',
  '雷霆': 'thunder',
  '俄克拉荷马城雷霆': 'thunder',
  '掘金': 'nuggets',
  '丹佛掘金': 'nuggets',
  '森林狼': 'timberwolves',
  '明尼苏达森林狼': 'timberwolves',
  '开拓者': 'blazers',
  '波特兰开拓者': 'blazers',
  '爵士': 'jazz',
  '犹他爵士': 'jazz',
  '尼克斯': 'knicks',
  '纽约尼克斯': 'knicks',
  '猛龙': 'raptors',
  '多伦多猛龙': 'raptors',
  '凯尔特人': 'celtics',
  '波士顿凯尔特人': 'celtics',
  '76人': '76ers',
  '费城76人': '76ers',
  '篮网': 'nets',
  '布鲁克林篮网': 'nets',
  '热火': 'heat',
  '迈阿密热火': 'heat',
  '老鹰': 'hawks',
  '亚特兰大老鹰': 'hawks',
  '魔术': 'magic',
  '奥兰多魔术': 'magic',
  '黄蜂': 'hornets',
  '夏洛特黄蜂': 'hornets',
  '奇才': 'wizards',
  '华盛顿奇才': 'wizards',
  '活塞': 'pistons',
  '底特律活塞': 'pistons',
  '骑士': 'cavaliers',
  '克利夫兰骑士': 'cavaliers',
  '公牛': 'bulls',
  '芝加哥公牛': 'bulls',
  '雄鹿': 'bucks',
  '密尔沃基雄鹿': 'bucks',
  '步行者': 'pacers',
  '印第安纳步行者': 'pacers',
};

