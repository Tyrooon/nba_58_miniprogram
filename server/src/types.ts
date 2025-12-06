export type PlayMode = 1 | 2 | 3;

export interface LeaderboardEntry {
  userId: number;
  nickname: string;
  avatarUrl?: string;
  score: number;
}

export interface PlayerSnapshot {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  seasonAvg: number;
  position?: string;
}

export interface SelectionPayload {
  userId: number;
  playerId: number;
  playMode: PlayMode;
  gameDate: string;
}









