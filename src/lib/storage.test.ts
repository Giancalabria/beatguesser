import { beforeEach, describe, expect, it } from 'vitest';
import type { DailyResult } from '../types';
import { POOLS } from '../types';
import {
  getPoolStatus,
  getVisibleStreak,
  isFullClear,
  isPerfectDay,
  isPerfectWin,
  loadDailyState,
  recordDailyStreak,
  saveDailyProgress,
  saveDailyResult,
} from './storage';

const result: DailyResult = {
  pool: 'easy',
  won: true,
  attempts: 3,
  segmentsUsed: 2,
  maxSegment: 1,
  songId: 'song-1',
  songTitle: 'Test Song',
  songArtist: 'Test Artist',
};

function completeAll(dateKey: string, overrides: Partial<DailyResult> = {}) {
  for (const pool of POOLS) {
    saveDailyResult(dateKey, { ...result, pool, ...overrides });
  }
}

describe('daily storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and restores won and lost statuses', () => {
    saveDailyResult('2026-08-23', result);
    saveDailyResult('2026-08-23', { ...result, pool: 'hard', won: false });

    const state = loadDailyState('2026-08-23');
    expect(getPoolStatus(state, 'easy')).toBe('won');
    expect(getPoolStatus(state, 'hard')).toBe('lost');
    expect(getPoolStatus(state, 'medium')).toBe('pending');
  });

  it('resets results for a new date', () => {
    saveDailyResult('2026-08-23', result);
    expect(loadDailyState('2026-08-24').results).toEqual({});
    expect(loadDailyState('2026-08-24').progress).toEqual({});
  });

  it('ignores malformed stored data', () => {
    localStorage.setItem(
      'beatguesser_daily',
      JSON.stringify({ dateKey: '2026-08-23', results: { easy: { won: 'yes' } } }),
    );

    expect(loadDailyState('2026-08-23').results).toEqual({});
  });

  it('persists in-progress attempts per pool and restores them', () => {
    saveDailyProgress('2026-08-24', 'easy', { attempts: 4, segmentIndex: 2 });
    saveDailyProgress('2026-08-24', 'medium', { attempts: 1, segmentIndex: 0 });

    const state = loadDailyState('2026-08-24');
    expect(state.progress.easy).toEqual({ attempts: 4, segmentIndex: 2 });
    expect(state.progress.medium).toEqual({ attempts: 1, segmentIndex: 0 });
    expect(state.progress.hard).toBeUndefined();
  });

  it('clears a pool progress when that pool is finished', () => {
    saveDailyProgress('2026-08-24', 'easy', { attempts: 2, segmentIndex: 1 });
    saveDailyProgress('2026-08-24', 'hard', { attempts: 1, segmentIndex: 0 });
    saveDailyResult('2026-08-24', result);

    const state = loadDailyState('2026-08-24');
    expect(state.progress.easy).toBeUndefined();
    expect(state.progress.hard).toEqual({ attempts: 1, segmentIndex: 0 });
  });

  it('does not overwrite progress after a pool already has a result', () => {
    saveDailyResult('2026-08-24', result);
    saveDailyProgress('2026-08-24', 'easy', { attempts: 9, segmentIndex: 3 });

    expect(loadDailyState('2026-08-24').progress.easy).toBeUndefined();
  });

  it('detects perfect wins, full clears and perfect days', () => {
    expect(isPerfectWin({ ...result, maxSegment: 0 })).toBe(true);
    expect(isPerfectWin(result)).toBe(false);

    completeAll('2026-08-24', { won: true, maxSegment: 1 });
    expect(isFullClear(loadDailyState('2026-08-24'))).toBe(true);
    expect(isPerfectDay(loadDailyState('2026-08-24'))).toBe(false);

    completeAll('2026-08-24', { won: true, maxSegment: 0, segmentsUsed: 1 });
    expect(isPerfectDay(loadDailyState('2026-08-24'))).toBe(true);
  });
});

describe('daily streak', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts a streak when all five pools are completed', () => {
    completeAll('2026-08-24');
    expect(getVisibleStreak('2026-08-24')).toEqual({
      current: 1,
      best: 1,
      lastCompletedDate: '2026-08-24',
    });
  });

  it('increments consecutive days and keeps the best streak after a miss', () => {
    completeAll('2026-08-23');
    completeAll('2026-08-24');
    expect(getVisibleStreak('2026-08-24').current).toBe(2);

    expect(getVisibleStreak('2026-08-26')).toEqual({
      current: 0,
      best: 2,
      lastCompletedDate: '2026-08-24',
    });

    completeAll('2026-08-26');
    expect(getVisibleStreak('2026-08-26')).toEqual({
      current: 1,
      best: 2,
      lastCompletedDate: '2026-08-26',
    });
  });

  it('does not increment twice on the same day', () => {
    completeAll('2026-08-24');
    const first = recordDailyStreak('2026-08-24');
    const second = recordDailyStreak('2026-08-24');
    expect(second).toEqual(first);
    expect(first.current).toBe(1);
  });

  it('continues across a year boundary', () => {
    completeAll('2025-12-31');
    completeAll('2026-01-01');
    expect(getVisibleStreak('2026-01-01').current).toBe(2);
  });
});
