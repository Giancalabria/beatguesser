import { afterEach, describe, expect, it } from 'vitest';
import type { DailyResult } from '../types';
import { setLanguage } from '../i18n';
import { buildShareMessage, buildShareText } from './ShareCard';

const result: DailyResult = {
  pool: 'easy',
  won: true,
  attempts: 1,
  segmentsUsed: 2,
  maxSegment: 1,
  songId: 'song-1',
  songTitle: 'Blinding Lights',
  songArtist: 'The Weeknd',
};

describe('share result', () => {
  afterEach(async () => {
    await setLanguage('es');
  });

  it('builds a predefined Spanish message with the game URL', async () => {
    await setLanguage('es');
    const text = buildShareText(
      'daily',
      'easy',
      result,
      undefined,
      'https://beatguesser.example/',
    );

    expect(text).toContain('¿Podés adivinarla con menos audio?');
    expect(text).toContain('Mundial');
    expect(text).toContain('1 intento');
    expect(text).toContain('https://beatguesser.example/');
  });

  it('builds the native-share message without duplicating the URL', async () => {
    await setLanguage('en');
    const message = buildShareMessage('daily', 'easy', result);

    expect(message).toContain('Can you guess it with less audio?');
    expect(message).not.toContain('http');
  });

  it('adds PERFECT, streak and perfect-day lines', async () => {
    await setLanguage('en');
    const perfect: DailyResult = { ...result, maxSegment: 0, segmentsUsed: 1 };
    const message = buildShareMessage('daily', 'easy', perfect, undefined, {
      streak: 3,
      perfectDay: true,
    });

    expect(message).toContain('PERFECT');
    expect(message).toContain('🔥 3');
    expect(message).toContain('Perfect day');
  });
});
