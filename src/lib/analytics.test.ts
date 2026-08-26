import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMock, shouldEnableMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  shouldEnableMock: vi.fn(() => true),
}));

vi.mock('posthog-js', () => ({
  default: {
    capture: captureMock,
  },
}));

vi.mock('./posthog', () => ({
  shouldEnablePostHog: shouldEnableMock,
}));

import { analytics } from './analytics';

describe('analytics', () => {
  beforeEach(() => {
    captureMock.mockClear();
    shouldEnableMock.mockReturnValue(true);
  });

  afterEach(() => {
    shouldEnableMock.mockReturnValue(true);
  });

  it('does not capture when PostHog is disabled', () => {
    shouldEnableMock.mockReturnValue(false);
    analytics.gameStarted('daily');
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('captures game_started with mode and pool', () => {
    analytics.gameStarted('infinite', 'hard');
    expect(captureMock).toHaveBeenCalledWith('game_started', {
      mode: 'infinite',
      pool: 'hard',
    });
  });

  it('captures guess_submitted without free-text payloads', () => {
    analytics.guessSubmitted({
      mode: 'daily',
      pool: 'easy',
      correct: false,
      attempt: 2,
      clip_seconds: 3,
      used_autocomplete: true,
    });

    expect(captureMock).toHaveBeenCalledWith('guess_submitted', {
      mode: 'daily',
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
      pool: 'medium',
      reason: 'home',
      duration_seconds: 120,
      clips_played: 8,
      guesses: 5,
      rounds_completed: 3,
      score: 2,
    });
  });
});
