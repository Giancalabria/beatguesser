import type { DailyResult, DailyState, Pool } from '../types';

const DAILY_KEY = 'beatguesser_daily';
const INFINITE_SCORES_KEY = 'beatguesser_infinite_scores';

export function loadDailyState(dateKey: string): DailyState {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyState;
      if (parsed.dateKey === dateKey) {
        return parsed;
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
  localStorage.setItem(DAILY_KEY, JSON.stringify(state));
  return state;
}

export function isPoolCompleted(state: DailyState, pool: Pool): boolean {
  return pool in state.results;
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
