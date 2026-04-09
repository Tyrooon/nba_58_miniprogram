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

// Playoff Types
export type PlayoffRoundType = 'play_in' | 'round1' | 'round2' | 'conference_finals';
export type PlayoffStatus = 'upcoming' | 'active' | 'completed';

export interface PlayoffRound {
  id: number;
  season: number;
  round_type: PlayoffRoundType;
  status: PlayoffStatus;
  start_date: string | null;
  end_date: string | null;
  config: string | null; // JSON with game_dates array etc.
}

export interface PlayoffMatchup {
  id: number;
  round_id: number;
  round_type: PlayoffRoundType;
  high_seed_user_id: string;
  low_seed_user_id: string;
  high_seed_rank: number;
  low_seed_rank: number;
  winner_id: string | null;
  status: PlayoffStatus;
  priority_user_id: string | null;
}

export interface PlayoffSelection {
  id: number;
  matchup_id: number;
  user_id: string;
  player_id: string;
  player_name: string | null;
  game_date: string;
  season_avg: number;
  actual_points: number;
  plus58_score: number;
  created_at: string;
}

export interface PlayoffScore {
  id: number;
  matchup_id: number;
  game_date: string;
  high_seed_score: number;
  low_seed_score: number;
  winner_user_id: string | null;
}

export interface PlayoffFrozenPlayer {
  id: number;
  user_id: string;
  player_id: string;
  player_name: string | null;
  round_id: number;
  frozen_date: string;
}









