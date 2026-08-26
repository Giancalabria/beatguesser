import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMock, registerMock, shouldEnableMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  registerMock: vi.fn(),
  shouldEnableMock: vi.fn(() => true),
}));

vi.mock('posthog-js', () => ({
  default: {
    capture: captureMock,
    register: registerMock,
  },
}));

vi.mock('./posthog', () => ({
  shouldEnablePostHog: shouldEnableMock,
}));

import { analytics } from './analytics';

describe('analytics', () => {
  beforeEach(() => {
    captureMock.mockClear();
    registerMock.mockClear();
    shouldEnableMock.mockReturnValue(true);
  });

  afterEach(() => {
    shouldEnableMock.mockReturnValue(true);
  });

  it('does not capture when PostHog is disabled', () => {
    shouldEnableMock.mockReturnValue(false);
    analytics.gameStarted({ mode: 'daily', lang: 'global', pool: 'easy' });
    analytics.setContext({ lang: 'es' });
    expect(captureMock).not.toHaveBeenCalled();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('captures game_started with mode, lang and pool', () => {
    analytics.gameStarted({ mode: 'infinite', lang: 'es', pool: 'hard' });
    expect(captureMock).toHaveBeenCalledWith('game_started', {
      mode: 'infinite',
      lang: 'es',
      pool: 'hard',
    });
  });

  it('registers session context for autocapture', () => {
    analytics.setContext({ mode: 'daily', lang: 'en', pool: 'medium', ui_language: 'es' });
    expect(registerMock).toHaveBeenCalledWith({
      mode: 'daily',
      lang: 'en',
      pool: 'medium',
      ui_language: 'es',
    });
  });

  it('captures guess_submitted without free-text payloads', () => {
    analytics.guessSubmitted({
      mode: 'daily',
      lang: 'global',
      pool: 'easy',
      correct: false,
      attempt: 2,
      clip_seconds: 3,
      used_autocomplete: true,
    });

    expect(captureMock).toHaveBeenCalledWith('guess_submitted', {
      mode: 'daily',
      lang: 'global',
      pool: 'easy',
      correct: false,
      attempt: 2,
      clip_seconds: 3,
      used_autocomplete: true,
    });
    expect(captureMock.mock.calls[0]?.[1]).not.toHaveProperty('guess');
    expect(captureMock.mock.calls[0]?.[1]).not.toHaveProperty('song_title');
  });

  it('captures game_session_ended summary metrics', () => {
    analytics.gameSessionEnded({
      mode: 'infinite',
      lang: 'en',
      pool: 'medium',
      reason: 'home',
      duration_seconds: 120,
      clips_played: 8,
      guesses: 5,
      rounds_completed: 3,
      score: 2,
    });

    expect(captureMock).toHaveBeenCalledWith('game_session_ended', {
      mode: 'infinite',
      lang: 'en',
      pool: 'medium',
      reason: 'home',
      duration_seconds: 120,
      clips_played: 8,
      guesses: 5,
      rounds_completed: 3,
      score: 2,
    });
  });

  it('captures board and daily-board completion', () => {
    analytics.boardSelected({
      mode: 'daily',
      lang: 'es',
      pool: 'easy',
      previous_lang: 'global',
    });
    analytics.dailyChallengeCompleted({
      mode: 'daily',
      lang: 'es',
      pool: 'impossible',
      pools_won: 5,
      full_clear: true,
      perfect_day: false,
      streak: 3,
    });

    expect(captureMock).toHaveBeenCalledWith('board_selected', {
      mode: 'daily',
      lang: 'es',
      pool: 'easy',
      previous_lang: 'global',
    });
    expect(captureMock).toHaveBeenCalledWith('daily_challenge_completed', {
      mode: 'daily',
      lang: 'es',
      pool: 'impossible',
      pools_won: 5,
      full_clear: true,
      perfect_day: false,
      streak: 3,
    });
  });
});
