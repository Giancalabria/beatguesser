import { describe, expect, it } from 'vitest';
import { classifyBoards, LATIN_GENRE_ID, poolFromBestRank } from './charts';

describe('poolFromBestRank', () => {
  it('maps chart position to difficulty bands', () => {
    expect(poolFromBestRank(1)).toBe('easy');
    expect(poolFromBestRank(10)).toBe('easy');
    expect(poolFromBestRank(11)).toBe('medium');
    expect(poolFromBestRank(25)).toBe('medium');
    expect(poolFromBestRank(26)).toBe('hard');
    expect(poolFromBestRank(50)).toBe('hard');
    expect(poolFromBestRank(51)).toBe('expert');
    expect(poolFromBestRank(80)).toBe('expert');
    expect(poolFromBestRank(81)).toBe('impossible');
    expect(poolFromBestRank(100)).toBe('impossible');
  });
});

describe('classifyBoards', () => {
  it('puts latin hits from hispanic charts on Español and Mundial', () => {
    expect(
      classifyBoards({ markets: ['ar'], genreIds: [LATIN_GENRE_ID] }),
    ).toEqual(['global', 'es']);
  });

  it('puts hispanic-only non-latin tracks on Español', () => {
    expect(classifyBoards({ markets: ['mx', 'es'], genreIds: ['14'] })).toEqual([
      'global',
      'es',
    ]);
  });

  it('keeps Anglo pop on the Argentine chart out of Español', () => {
    expect(classifyBoards({ markets: ['ar', 'us'], genreIds: ['14'] })).toEqual([
      'global',
      'en',
    ]);
  });

  it('puts US/GB non-latin tracks on Inglés', () => {
    expect(classifyBoards({ markets: ['us', 'gb'], genreIds: ['14'] })).toEqual([
      'global',
      'en',
    ]);
  });

  it('keeps latin tracks out of Inglés even if they chart in the US', () => {
    expect(
      classifyBoards({ markets: ['us', 'ar'], genreIds: [LATIN_GENRE_ID] }),
    ).toEqual(['global', 'es']);
  });

  it('respects a manual language override', () => {
    expect(
      classifyBoards({
        markets: ['us'],
        genreIds: ['14'],
        override: 'es',
      }),
    ).toEqual(['global', 'es']);
    expect(
      classifyBoards({
        markets: ['ar'],
        genreIds: [LATIN_GENRE_ID],
        override: 'global',
      }),
    ).toEqual(['global']);
  });
});
