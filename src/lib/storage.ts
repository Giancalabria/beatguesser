import type { DailyProgress, DailyResult, DailyState, DailyStreak, LangMode, Pool } from '../types';
import { CLIP_MARKS, LANG_MODES, POOLS } from '../types';
import { previousDateKey } from './daily';

const DAILY_KEY = 'beatguesser_daily_v2';
const INFINITE_SCORES_KEY = 'beatguesser_infinite_scores_v2';
const STREAK_KEY = 'beatguesser_streak_v2';
const LANG_MODE_KEY = 'beatguesser_lang_mode';
const EMPTY_STREAK: DailyStreak = { current: 0, best: 0, lastCompletedDate: null };

interface BoardSlice {
  results: DailyState['results'];
  progress: DailyState['progress'];
}

interface DailyStore {
  dateKey: string;
  boards: Partial<Record<LangMode, BoardSlice>>;
}

function emptySlice(): BoardSlice {
  return { results: {}, progress: {} };
}

function isLangMode(value: unknown): value is LangMode {
  return value === 'global' || value === 'es' || value === 'en';
}

function isDailyResult(value: unknown, pool: Pool): value is DailyResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<DailyResult>;
  return (
    result.pool === pool &&
    typeof result.won === 'boolean' &&
    typeof result.segmentsUsed === 'number' &&
    typeof result.maxSegment === 'number' &&
    typeof result.songId === 'string' &&
    typeof result.songTitle === 'string' &&
    typeof result.songArtist === 'string'
  );
}

function isDailyProgress(value: unknown): value is DailyProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Partial<DailyProgress>;
  return (
    typeof progress.attempts === 'number' &&
    progress.attempts >= 0 &&
    typeof progress.segmentIndex === 'number' &&
    progress.segmentIndex >= 0 &&
    progress.segmentIndex < CLIP_MARKS.length
  );
}

function parseSlice(value: unknown): BoardSlice {
  const slice = emptySlice();
  if (!value || typeof value !== 'object') return slice;
  const raw = value as Partial<BoardSlice>;
  if (raw.results && typeof raw.results === 'object') {
    for (const pool of POOLS) {
      const result = raw.results[pool];
      if (isDailyResult(result, pool)) slice.results[pool] = result;
    }
  }
  if (raw.progress && typeof raw.progress === 'object') {
    for (const pool of POOLS) {
      const saved = raw.progress[pool];
      if (isDailyProgress(saved) && !slice.results[pool]) slice.progress[pool] = saved;
    }
  }
  return slice;
}

function readStore(dateKey: string): DailyStore {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return { dateKey, boards: {} };
    const parsed = JSON.parse(raw) as Partial<DailyStore>;
    if (parsed.dateKey !== dateKey || !parsed.boards || typeof parsed.boards !== 'object') {
      return { dateKey, boards: {} };
    }
    const boards: DailyStore['boards'] = {};
    for (const lang of LANG_MODES) {
      boards[lang] = parseSlice(parsed.boards[lang]);
    }
    return { dateKey, boards };
  } catch {
    return { dateKey, boards: {} };
  }
}

function persistStore(store: DailyStore): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(store));
  } catch {
    // Storage can be unavailable in private browsing or when quota is exhausted.
  }
}

function toState(dateKey: string, lang: LangMode, slice: BoardSlice): DailyState {
  return { dateKey, lang, results: slice.results, progress: slice.progress };
}

export function loadPreferredLangMode(): LangMode {
  try {
    const raw = localStorage.getItem(LANG_MODE_KEY);
    if (isLangMode(raw)) return raw;
  } catch {
    // ignore
  }
  return 'global';
}

export function savePreferredLangMode(lang: LangMode): void {
  try {
    localStorage.setItem(LANG_MODE_KEY, lang);
  } catch {
    // ignore
  }
}

export function loadDailyState(dateKey: string, lang: LangMode): DailyState {
  const store = readStore(dateKey);
  return toState(dateKey, lang, store.boards[lang] ?? emptySlice());
}

export function saveDailyProgress(
  dateKey: string,
  lang: LangMode,
  pool: Pool,
  progress: DailyProgress,
): DailyState {
  const store = readStore(dateKey);
  const slice = store.boards[lang] ?? emptySlice();
  if (slice.results[pool]) return toState(dateKey, lang, slice);
  if (progress.attempts <= 0 && progress.segmentIndex <= 0) {
    delete slice.progress[pool];
  } else {
    slice.progress[pool] = {
      attempts: progress.attempts,
      segmentIndex: Math.min(progress.segmentIndex, CLIP_MARKS.length - 1),
    };
  }
  store.boards[lang] = slice;
  persistStore(store);
  return toState(dateKey, lang, slice);
}

export function saveDailyResult(
  dateKey: string,
  lang: LangMode,
  result: DailyResult,
): DailyState {
  const store = readStore(dateKey);
  const slice = store.boards[lang] ?? emptySlice();
  slice.results[result.pool] = result;
  delete slice.progress[result.pool];
  store.boards[lang] = slice;
  persistStore(store);
  const state = toState(dateKey, lang, slice);
  if (isDailyComplete(state)) recordDailyStreak(dateKey, lang);
  return state;
}

export function isPoolCompleted(state: DailyState, pool: Pool): boolean {
  return state.results[pool] !== undefined;
}

export function getPoolStatus(
  state: DailyState,
  pool: Pool,
): 'pending' | 'won' | 'lost' {
  const result = state.results[pool];
  if (!result) return 'pending';
  return result.won ? 'won' : 'lost';
}

export function getInfiniteHighScore(lang: LangMode, pool: Pool): number {
  try {
    const raw = localStorage.getItem(INFINITE_SCORES_KEY);
    if (raw) {
      const scores = JSON.parse(raw) as Partial<Record<LangMode, Partial<Record<Pool, number>>>>;
      return scores[lang]?.[pool] ?? 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function saveInfiniteHighScore(lang: LangMode, pool: Pool, score: number): void {
  try {
    const raw = localStorage.getItem(INFINITE_SCORES_KEY);
    const scores: Partial<Record<LangMode, Partial<Record<Pool, number>>>> = raw
      ? JSON.parse(raw)
      : {};
    const board = scores[lang] ?? {};
    const current = board[pool] ?? 0;
    if (score > current) {
      board[pool] = score;
      scores[lang] = board;
      localStorage.setItem(INFINITE_SCORES_KEY, JSON.stringify(scores));
    }
  } catch {
    // ignore
  }
}

export function isPerfectWin(result: DailyResult | undefined): boolean {
  return result?.won === true && result.maxSegment === 0;
}

export function isDailyComplete(state: DailyState): boolean {
  return POOLS.every((pool) => state.results[pool] !== undefined);
}

export function isFullClear(state: DailyState): boolean {
  return POOLS.every((pool) => state.results[pool]?.won === true);
}

export function isPerfectDay(state: DailyState): boolean {
  return POOLS.every((pool) => isPerfectWin(state.results[pool]));
}

function loadStoredStreak(lang: LangMode): DailyStreak {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { ...EMPTY_STREAK };
    const parsed = JSON.parse(raw) as Partial<Record<LangMode, Partial<DailyStreak>>>;
    const stored = parsed[lang];
    if (!stored) return { ...EMPTY_STREAK };
    const current = typeof stored.current === 'number' && stored.current >= 0 ? stored.current : 0;
    const best = typeof stored.best === 'number' && stored.best >= 0 ? stored.best : 0;
    const lastCompletedDate =
      typeof stored.lastCompletedDate === 'string' ? stored.lastCompletedDate : null;
    return { current, best, lastCompletedDate };
  } catch {
    return { ...EMPTY_STREAK };
  }
}

function persistStreak(lang: LangMode, streak: DailyStreak): void {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const all: Partial<Record<LangMode, DailyStreak>> = raw ? JSON.parse(raw) : {};
    all[lang] = streak;
    localStorage.setItem(STREAK_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function getVisibleStreak(todayKey: string, lang: LangMode): DailyStreak {
  const stored = loadStoredStreak(lang);
  const yesterday = previousDateKey(todayKey);
  if (
    stored.lastCompletedDate === todayKey ||
    stored.lastCompletedDate === yesterday
  ) {
    return stored;
  }
  return { current: 0, best: stored.best, lastCompletedDate: stored.lastCompletedDate };
}

export function recordDailyStreak(todayKey: string, lang: LangMode): DailyStreak {
  const stored = loadStoredStreak(lang);
  if (stored.lastCompletedDate === todayKey) return stored;

  const current = stored.lastCompletedDate === previousDateKey(todayKey) ? stored.current + 1 : 1;
  const next: DailyStreak = {
    current,
    best: Math.max(stored.best, current),
    lastCompletedDate: todayKey,
  };
  persistStreak(lang, next);
  return next;
}
