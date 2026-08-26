import posthog from 'posthog-js';
import type { GameMode, Pool } from '../types';
import { shouldEnablePostHog } from './posthog';

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProps = Record<string, AnalyticsValue>;

function capture(event: string, properties?: AnalyticsProps): void {
  if (!shouldEnablePostHog()) return;
  posthog.capture(event, properties);
}

export const analytics = {
  gameStarted(mode: GameMode, pool: Pool = 'easy'): void {
    capture('game_started', { mode, pool });
  },

  gameSessionEnded(props: {
    mode: GameMode;
    pool: Pool;
    reason: 'home' | 'page_exit';
    duration_seconds: number;
    clips_played: number;
    guesses: number;
    rounds_completed: number;
    score: number;
  }): void {
    capture('game_session_ended', props);
  },

  clipPlayed(props: {
    mode: GameMode;
    pool: Pool;
    clip_seconds: number;
    segment: number;
  }): void {
    capture('clip_played', props);
  },

  guessSubmitted(props: {
    mode: GameMode;
    pool: Pool;
    correct: boolean;
    attempt: number;
    clip_seconds: number;
    used_autocomplete: boolean;
  }): void {
    capture('guess_submitted', props);
  },

  roundCompleted(props: {
    mode: GameMode;
    pool: Pool;
    result: 'won' | 'lost';
    completion: 'correct_guess' | 'surrender' | 'out_of_segments';
    attempts: number;
    clip_seconds: number;
    score?: number;
    lives_remaining?: number;
  }): void {
    capture('round_completed', props);
  },

  dailyChallengeCompleted(pools_won: number): void {
    capture('daily_challenge_completed', { pools_won });
  },

  infiniteGameCompleted(props: {
    pool: Pool;
    score: number;
    session_rounds_completed: number;
    is_new_high_score: boolean;
  }): void {
    capture('infinite_game_completed', props);
  },

  difficultySelected(props: {
    mode: GameMode;
    pool: Pool;
    previous_pool: Pool;
  }): void {
    capture('difficulty_selected', props);
  },

  infiniteGameRestarted(props: { pool: Pool; previous_score: number }): void {
    capture('infinite_game_restarted', props);
  },

  resultShared(props: {
    mode: GameMode;
    pool: Pool;
    method: 'copy' | 'native' | 'copy_fallback';
    result: 'won' | 'lost' | 'game_over';
    score?: number;
  }): void {
    capture('result_shared', props);
  },
};
