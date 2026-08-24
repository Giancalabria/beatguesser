import type { DailyProgress, DailyResult, DailyState, DailyStreak, Pool } from '../types';
import { CLIP_MARKS, POOLS } from '../types';
import { previousDateKey } from './daily';

const DAILY_KEY = 'beatguesser_daily';
const INFINITE_SCORES_KEY = 'beatguesser_infinite_scores';
const STREAK_KEY = 'beatguesser_streak';
const EMPTY_STREAK: DailyStreak = { current: 0, best: 0, lastCompletedDate: null };

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

function persistDailyState(state: DailyState): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private browsing or when quota is exhausted.
  }
}

export function loadDailyState(dateKey: string): DailyState {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyState>;
      if (
        parsed.dateKey === dateKey &&
        parsed.results &&
        typeof parsed.results === 'object'
      ) {
        const results: DailyState['results'] = {};
        for (const pool of POOLS) {
          const result = parsed.results[pool];
          if (isDailyResult(result, pool)) results[pool] = result;
        }
        const progress: DailyState['progress'] = {};
        if (parsed.progress && typeof parsed.progress === 'object') {
          for (const pool of POOLS) {
            const saved = parsed.progress[pool];
            if (isDailyProgress(saved) && !results[pool]) progress[pool] = saved;
          }
        }
        return { dateKey, results, progress };
      }
    }
  } catch {
    // corrupted storage
  }
  return { dateKey, results: {}, progress: {} };
}

export function saveDailyProgress(
  dateKey: string,
  pool: Pool,
  progress: DailyProgress,
): DailyState {
  const state = loadDailyState(dateKey);
  if (state.results[pool]) return state;
  if (progress.attempts <= 0 && progress.segmentIndex <= 0) {
    delete state.progress[pool];
  } else {
    state.progress[pool] = {
      attempts: progress.attempts,
      segmentIndex: Math.min(progress.segmentIndex, CLIP_MARKS.length - 1),
    };
  }
  persistDailyState(state);
  return state;
}

export function saveDailyResult(dateKey: string, result: DailyResult): DailyState {
  const state = loadDailyState(dateKey);
  state.results[result.pool] = result;
  delete state.progress[result.pool];
  persistDailyState(state);
  if (isDailyComplete(state)) recordDailyStreak(dateKey);
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

export function getInfiniteHighScore(pool: Pool): number {
  try {
    const raw = localStorage.getItem(INFINITE_SCORES_KEY);
    if (raw) {
      const scores = JSON.parse(raw) as Partial<Record<Pool, number>>;
      return scores[pool] ?? 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function saveInfiniteHighScore(pool: Pool, score: number): void {
  try {
    const raw = localStorage.getItem(INFINITE_SCORES_KEY);
    const scores: Partial<Record<Pool, number>> = raw ? JSON.parse(raw) : {};
    const current = scores[pool] ?? 0;
    if (score > current) {
      scores[pool] = score;
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

function loadStoredStreak(): DailyStreak {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { ...EMPTY_STREAK };
    const parsed = JSON.parse(raw) as Partial<DailyStreak>;
    const current = typeof parsed.current === 'number' && parsed.current >= 0 ? parsed.current : 0;
    const best = typeof parsed.best === 'number' && parsed.best >= 0 ? parsed.best : 0;
    const lastCompletedDate =
      typeof parsed.lastCompletedDate === 'string' ? parsed.lastCompletedDate : null;
    return { current, best, lastCompletedDate };
  } catch {
    return { ...EMPTY_STREAK };
  }
}

function persistStreak(streak: DailyStreak): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  } catch {
    // ignore
  }
}

export function getVisibleStreak(todayKey: string): DailyStreak {
  const stored = loadStoredStreak();
  const yesterday = previousDateKey(todayKey);
  if (
    stored.lastCompletedDate === todayKey ||
    stored.lastCompletedDate === yesterday
  ) {
    return stored;
  }
  return { current: 0, best: stored.best, lastCompletedDate: stored.lastCompletedDate };
}

export function recordDailyStreak(todayKey: string): DailyStreak {
  const stored = loadStoredStreak();
  if (stored.lastCompletedDate === todayKey) return stored;

  const current = stored.lastCompletedDate === previousDateKey(todayKey) ? stored.current + 1 : 1;
  const next: DailyStreak = {
    current,
    best: Math.max(stored.best, current),
    lastCompletedDate: todayKey,
  };
  persistStreak(next);
  return next;
}
