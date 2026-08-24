import type { DailyResult, DailyState, Pool } from '../types';
import { POOLS } from '../types';

const DAILY_KEY = 'beatguesser_daily';
const INFINITE_SCORES_KEY = 'beatguesser_infinite_scores';

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
        return { dateKey, results };
      }
    }
  } catch {
    // corrupted storage
  }
  return { dateKey, results: {} };
}

export function saveDailyResult(dateKey: string, result: DailyResult): DailyState {
  const state = loadDailyState(dateKey);
  state.results[result.pool] = result;
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private browsing or when quota is exhausted.
  }
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
