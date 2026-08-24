export type Pool = 'easy' | 'medium' | 'hard' | 'expert' | 'impossible';

export type GameMode = 'daily' | 'infinite';

export interface Song {
  id: string;
  spotifyId?: string;
  title: string;
  artist: string;
  pool: Pool;
  itunesSearchTerm: string;
  previewUrl?: string;
  imageUrl?: string;
}

export interface DailyResult {
  pool: Pool;
  won: boolean;
  attempts?: number;
  segmentsUsed: number;
  maxSegment: number;
  songId: string;
  songTitle: string;
  songArtist: string;
  songSpotifyId?: string;
  songImageUrl?: string;
}

export interface DailyState {
  dateKey: string;
  results: Partial<Record<Pool, DailyResult>>;
}

export const POOLS: Pool[] = ['easy', 'medium', 'hard', 'expert', 'impossible'];

export const CLIP_MARKS = [0.5, 1, 3, 7, 15] as const;

export const POOL_COLORS: Record<Pool, string> = {
  easy: '#C8FF00',
  medium: '#FFD60A',
  hard: '#FF9F0A',
  expert: '#FF453A',
  impossible: '#BF5AF2',
};

export const POOL_I18N_KEYS: Record<Pool, `pools.${Pool}`> = {
  easy: 'pools.easy',
  medium: 'pools.medium',
  hard: 'pools.hard',
  expert: 'pools.expert',
  impossible: 'pools.impossible',
};

export const POOL_EMOJI: Record<Pool, string> = {
  easy: '🟩',
  medium: '🟨',
  hard: '🟧',
  expert: '🟥',
  impossible: '🟪',
};

export const INFINITE_LIVES = 3;
