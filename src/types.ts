export type Pool = 'easy' | 'medium' | 'hard' | 'expert' | 'impossible';

export type GameMode = 'daily' | 'infinite';

export type LangMode = 'global' | 'es' | 'en';

export interface Song {
  id: string;
  spotifyId?: string;
  appleId?: string;
  title: string;
  artist: string;
  pool: Pool;
  lang?: LangMode;
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

export interface DailyProgress {
  attempts: number;
  segmentIndex: number;
}

export interface DailyState {
  dateKey: string;
  lang: LangMode;
  results: Partial<Record<Pool, DailyResult>>;
  progress: Partial<Record<Pool, DailyProgress>>;
}

export interface DailyStreak {
  current: number;
  best: number;
  lastCompletedDate: string | null;
}

export const POOLS: Pool[] = ['easy', 'medium', 'hard', 'expert', 'impossible'];

export const LANG_MODES: LangMode[] = ['global', 'es', 'en'];

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

export const LANG_I18N_KEYS: Record<LangMode, `boards.${LangMode}`> = {
  global: 'boards.global',
  es: 'boards.es',
  en: 'boards.en',
};

export const LANG_EMOJI: Record<LangMode, string> = {
  global: '🌍',
  es: '🇪🇸',
  en: '🇬🇧',
};

export const INFINITE_LIVES = 3;
