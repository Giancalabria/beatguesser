import { beforeEach, describe, expect, it } from 'vitest';
import type { DailyResult } from '../types';
import { getPoolStatus, loadDailyState, saveDailyResult } from './storage';

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
  });

  it('ignores malformed stored data', () => {
    localStorage.setItem(
      'beatguesser_daily',
      JSON.stringify({ dateKey: '2026-08-23', results: { easy: { won: 'yes' } } }),
    );

    expect(loadDailyState('2026-08-23').results).toEqual({});
  });
});
