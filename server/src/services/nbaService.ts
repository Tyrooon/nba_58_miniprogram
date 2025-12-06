import { config } from '../config';
import { toNBAGameDate, toStatsDate } from '../utils/date';

interface NBA_Scoreboard {
  scoreboard: {
    gameDate: string;
    games: NBA_Game[];
  };
}

interface NBA_Game {
  gameId: string;
  gameCode: string;
  gameStatus: number;
  gameStatusText: string;
  period: number;
  gameClock: string;
  gameTimeUTC: string;
  gameEt: string;
  homeTeam: NBA_Team;
  awayTeam: NBA_Team;
}

interface NBA_Team {
  teamId: number;
  teamName: string;
  teamCity: string;
  teamTricode: string;
  score: number;
  wins?: number;
  losses?: number;
  players?: NBA_Player[]; // From boxscore
}

interface NBA_Boxscore {
  game: {
    gameId: string;
    gameStatusText: string;
    homeTeam: NBA_Team;
    awayTeam: NBA_Team;
  };
}

interface NBA_Player {
  personId: number;
  firstName: string;
  familyName: string;
  name: string; // Full name
  jerseyNum: string;
  position: string;
  status: string; // "ACTIVE", "INACTIVE"
  statistics?: {
    points: number;
    pointsFastBreak?: number;
    pointsInThePaint?: number;
    pointsSecondChance?: number;
    reboundsTotal: number;
    assists: number;
    minutes: string;
    // ... other stats
  };
}

interface NBA_Schedule {
  leagueSchedule: {
    seasonYear: string;
    gameDates: NBA_Schedule_Date[];
  };
}

interface NBA_Schedule_Date {
  gameDate: string; 
  games: NBA_Schedule_Game[];
}

interface NBA_Schedule_Game {
  gameId: string;
  gameCode: string;
  gameStatus: number;
  gameStatusText: string;
  gameDateTimeUTC: string; 
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

const fetchNBA = async <T>(path: string): Promise<T> => {
  const url = `https://cdn.nba.com/static/json/liveData/${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NBA CDN Request Failed: ${res.status} ${res.statusText}`);
  }
  return await res.json() as T;
};

const STATIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
  'Connection': 'keep-alive'
};

const fetchStatic = async <T>(path: string): Promise<T> => {
  const url = `https://cdn.nba.com/static/json/staticData/${path}`;
  const res = await fetch(url, { headers: STATIC_HEADERS });
  if (!res.ok) {
    throw new Error(`NBA Static Request Failed: ${res.status} ${res.statusText}`);
  }
  return await res.json() as T;
};

// New: Stats API fetcher
const fetchStats = async (url: string) => {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.nba.com/',
        'Origin': 'https://www.nba.com',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
    };
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Stats API Error: ${res.status}`);
    return await res.json();
};

export const getDailyGames = async (dateKey: string) => {
  const nbaDate = toNBAGameDate(dateKey);
  
  // Optimization: Try todaysScoreboard_00.json first as it is most up-to-date for "today"
  // Check if the date inside matches our target date.
  try {
      const todaysData = await fetchNBA<NBA_Scoreboard>('scoreboard/todaysScoreboard_00.json');
      if (todaysData.scoreboard.gameDate === nbaDate) {
          console.log(`Using todaysScoreboard_00.json for ${nbaDate}`);
          return todaysData.scoreboard.games;
      }
  } catch (e) {
      // Ignore error, fallback to specific date
  }

  try {
      const path = `scoreboard/scoreboard_${nbaDate}.json`;
      const data = await fetchNBA<NBA_Scoreboard>(path);
      return data.scoreboard.games;
  } catch (e) {
      // Fallback: try fetch stats scoreboard if CDN fails (sometimes CDN is slow)
      // But CDN is usually best.
      return [];
  }
};

export const getGameBoxscore = async (gameId: string) => {
  try {
    // Try Live Data Boxscore first
    const data = await fetchNBA<NBA_Boxscore>(`boxscore/boxscore_${gameId}.json`);
    return data.game;
  } catch (error) {
    console.log(`CDN Boxscore failed for ${gameId}, trying stats.nba.com...`);
    try {
        return await getBoxscoreFromStatsApi(gameId);
    } catch (statsError) {
        console.error(`Stats API Boxscore failed for ${gameId}:`, statsError);
        return null;
    }
  }
};

const getBoxscoreFromStatsApi = async (gameId: string) => {
    const url = `https://stats.nba.com/stats/boxscoretraditionalv2?EndPeriod=10&EndRange=28800&GameID=${gameId}&RangeType=0&StartPeriod=1&StartRange=0`;
    const data = await fetchStats(url);
    
    const headers = data.resultSets[0].headers;
    const rowSet = data.resultSets[0].rowSet;
    
    // Indices
    const TEAM_ID = headers.indexOf('TEAM_ID');
    const TEAM_ABBREVIATION = headers.indexOf('TEAM_ABBREVIATION');
    const TEAM_CITY = headers.indexOf('TEAM_CITY');
    const PLAYER_ID = headers.indexOf('PLAYER_ID');
    const PLAYER_NAME = headers.indexOf('PLAYER_NAME');
    const START_POSITION = headers.indexOf('START_POSITION');
    const MIN = headers.indexOf('MIN');
    const PTS = headers.indexOf('PTS');
    const REB = headers.indexOf('REB');
    const AST = headers.indexOf('AST');
    
    const homeTeam: NBA_Team = { teamId: 0, teamName: '', teamCity: '', teamTricode: '', score: 0, players: [] };
    const awayTeam: NBA_Team = { teamId: 0, teamName: '', teamCity: '', teamTricode: '', score: 0, players: [] };
    
    // We need to identify which ID is home/away.
    // Usually boxscoretraditionalv2 doesn't explicitly say "Home" or "Visitor" in rowset rows easily without comparing.
    // But we can group by Team ID.
    
    const teams: Record<number, NBA_Team> = {};
    
    rowSet.forEach((row: any[]) => {
        const tId = row[TEAM_ID];
        if (!teams[tId]) {
            teams[tId] = {
                teamId: tId,
                teamName: row[TEAM_CITY] || row[TEAM_ABBREVIATION], // City usually
                teamCity: row[TEAM_CITY],
                teamTricode: row[TEAM_ABBREVIATION],
                score: 0, // Total score not in player rows, need TeamStats resultSet?
                players: []
            };
        }
        
        const player: NBA_Player = {
            personId: row[PLAYER_ID],
            firstName: row[PLAYER_NAME].split(' ')[0],
            familyName: row[PLAYER_NAME].split(' ').slice(1).join(' '),
            name: row[PLAYER_NAME],
            jerseyNum: '',
            position: row[START_POSITION] || '',
            status: row[MIN] ? 'ACTIVE' : 'INACTIVE',
            statistics: {
                points: row[PTS] || 0,
                reboundsTotal: row[REB] || 0,
                assists: row[AST] || 0,
                minutes: row[MIN] || '0:00'
            }
        };
        
        if (player.status === 'ACTIVE') {
             teams[tId].players?.push(player);
        }
    });
    
    // Try to get scores from TeamStats (ResultSet 1)
    if (data.resultSets[1]) {
         const teamStatsHeaders = data.resultSets[1].headers;
         const teamStatsRows = data.resultSets[1].rowSet;
         const TS_TEAM_ID = teamStatsHeaders.indexOf('TEAM_ID');
         const TS_PTS = teamStatsHeaders.indexOf('PTS');
         
         teamStatsRows.forEach((row: any[]) => {
             const tId = row[TS_TEAM_ID];
             if (teams[tId]) {
                 teams[tId].score = row[TS_PTS];
             }
         });
    }
    
    const teamIds = Object.keys(teams);
    if (teamIds.length >= 2) {
        // NBA Stats API usually lists Away team first? Or Home?
        // Let's assume first found is Away, second is Home?
        // Or just assign arbitrarily if we don't check schedule.
        // For rendering players it doesn't strictly matter which is home/away inside the boxscore object 
        // as long as we assign them to the right game record later (which matches by ID).
        // GameService uses home_team_id from Game Record to match.
        
        // But wait, getGameBoxscore returns { homeTeam: ..., awayTeam: ... }
        // We should try to match with something?
        // Since we don't know which is home/away here easily without extra call,
        // we can return them. The syncDailyData uses `boxscore.homeTeam.teamId` to UPDATE the game record.
        // If we swap them, we might swap home/away in DB.
        
        // We can assume valid game record exists in DB with correct home/away IDs.
        // But here we are returning the data.
        
        // Let's just map to [away, home] based on order in result set if consistent?
        // Usually Visitor is first in NBA boxscores.
        
        awayTeam.teamId = teams[parseInt(teamIds[0])].teamId;
        Object.assign(awayTeam, teams[parseInt(teamIds[0])]);
        
        homeTeam.teamId = teams[parseInt(teamIds[1])].teamId;
        Object.assign(homeTeam, teams[parseInt(teamIds[1])]);
    }
    
    return {
        gameId: gameId,
        gameStatusText: 'Final', // Stats API implies played if we get stats? Or check status.
        homeTeam,
        awayTeam
    };
};

export const getSeasonSchedule = async () => {
  try {
    const data = await fetchStatic<NBA_Schedule>('scheduleLeagueV2.json');
    return data.leagueSchedule.gameDates; 
  } catch (error) {
    console.error('Error fetching season schedule:', error);
    return [];
  }
};

interface SeasonPlayerMeta {
  avg: number;
  teamId?: number;
  teamName?: string;
  playerName?: string;
  position?: string;
}

export const getSeasonAverages = async (): Promise<Record<number, SeasonPlayerMeta>> => {
    const year = config.currentSeason;
    const nextYear = (year + 1).toString().slice(-2);
    const seasonParam = `${year}-${nextYear}`;
    
    const url = `https://stats.nba.com/stats/leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${seasonParam}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`;
    
    try {
        const data = await fetchStats(url);
        const result: Record<number, SeasonPlayerMeta> = {};
        
        const headers = data.resultSets[0].headers;
        const rowSet = data.resultSets[0].rowSet;
        
        const idIndex = headers.indexOf('PLAYER_ID');
        const ptsIndex = headers.indexOf('PTS');
        const teamIdIndex = headers.indexOf('TEAM_ID');
        const teamNameIndex = headers.indexOf('TEAM_NAME');
        const teamAbbrIndex = headers.indexOf('TEAM_ABBREVIATION');
        const nameIndex = headers.indexOf('PLAYER_NAME');
        const posIndex = headers.indexOf('POSITION');
        
        rowSet.forEach((row: any[]) => {
            const id = row[idIndex];
            const pts = row[ptsIndex];
            result[id] = {
              avg: pts,
              teamId: row[teamIdIndex],
              teamName: row[teamNameIndex] || row[teamAbbrIndex],
              playerName: row[nameIndex],
              position: row[posIndex]
            };
        });
        return result;
    } catch (error) {
        console.error('Failed to fetch season averages:', error);
        return {};
    }
};

interface StaticRosterPlayer {
  personId: number;
  firstName?: string;
  lastName?: string;
  temporaryDisplayName?: string;
  jersey?: string;
  pos?: string;
  position?: string;
}

interface StaticRosterResponse {
  league: {
    standard: Array<{
      teamId: string;
      teamName?: string;
      players: StaticRosterPlayer[];
    }>;
  };
}

let teamRosterCache: {
  fetchedAt: number;
  teams: Record<number, StaticRosterPlayer[]>;
  playerTeamMap: Record<number, number>;
} | null = null;

const buildStaticRosterCache = async () => {
  const now = Date.now();
  if (teamRosterCache && now - teamRosterCache.fetchedAt < 1000 * 60 * 60) {
    return teamRosterCache;
  }
  try {
    const data = await fetchStatic<StaticRosterResponse>('teamRosters/teamRosters.json');
    const teams: Record<number, StaticRosterPlayer[]> = {};
    const playerTeamMap: Record<number, number> = {};
    (data.league?.standard || []).forEach((team) => {
      const tId = Number(team.teamId);
      if (!tId) return;
      teams[tId] = team.players || [];
      (team.players || []).forEach((player) => {
        if (player?.personId) {
          playerTeamMap[player.personId] = tId;
        }
      });
    });
    teamRosterCache = {
      fetchedAt: now,
      teams,
      playerTeamMap
    };
    return teamRosterCache;
  } catch (error) {
    console.error('Failed to fetch static team rosters:', error);
    return {
      fetchedAt: now,
      teams: {},
      playerTeamMap: {}
    };
  }
};

export const getLatestTeamRoster = async (teamId: number) => {
  const cache = await buildStaticRosterCache();
  return cache.teams[teamId] || [];
};

export const getLatestPlayerTeamId = async (playerId: number) => {
  const cache = await buildStaticRosterCache();
  return cache.playerTeamMap[playerId];
};

export const getTeamRoster = async (teamId: number) => {
    const year = config.currentSeason;
    const nextYear = (year + 1).toString().slice(-2);
    const seasonParam = `${year}-${nextYear}`;
    
    const url = `https://stats.nba.com/stats/commonteamroster?LeagueID=00&Season=${seasonParam}&TeamID=${teamId}`;
    
    try {
        const data = await fetchStats(url);
        const players: any[] = [];
        
        const headers = data.resultSets[0].headers;
        const rowSet = data.resultSets[0].rowSet;
        
        const idIndex = headers.indexOf('PLAYER_ID');
        const nameIndex = headers.indexOf('PLAYER');
        const numIndex = headers.indexOf('NUM');
        const posIndex = headers.indexOf('POSITION');
        
        rowSet.forEach((row: any[]) => {
            players.push({
                personId: row[idIndex],
                name: row[nameIndex],
                jerseyNum: row[numIndex],
                position: row[posIndex],
                status: 'ACTIVE' // Assume active if on roster
            });
        });
        
        return players;
    } catch (error) {
        console.error(`Failed to fetch roster for team ${teamId}:`, error);
        return [];
    }
};

interface PlayerTeamInfo {
  teamId: number;
  teamName: string;
}

const playerTeamInfoCache = new Map<number, { teamId: number; teamName: string; fetchedAt: number }>();

export const getLatestPlayerTeamInfo = async (playerId: number): Promise<PlayerTeamInfo | null> => {
  const cacheEntry = playerTeamInfoCache.get(playerId);
  const now = Date.now();
  if (cacheEntry && now - cacheEntry.fetchedAt < 1000 * 60 * 10) {
    return cacheEntry;
  }
  const url = `https://stats.nba.com/stats/commonplayerinfo?PlayerID=${playerId}`;
  try {
    const data = await fetchStats(url);
    const resultSet = data.resultSets?.find((set: any) => set.name === 'CommonPlayerInfo');
    if (!resultSet || !resultSet.rowSet?.length) return cacheEntry || null;
    const teamIdIndex = resultSet.headers.indexOf('TEAM_ID');
    const teamNameIndex = resultSet.headers.indexOf('TEAM_NAME');
    const row = resultSet.rowSet[0];
    const info = {
      teamId: Number(row[teamIdIndex]),
      teamName: row[teamNameIndex]
    };
    playerTeamInfoCache.set(playerId, { ...info, fetchedAt: now });
    return info;
  } catch (error) {
    console.error(`Failed to fetch player team info for ${playerId}:`, error);
    return cacheEntry || null;
  }
};
