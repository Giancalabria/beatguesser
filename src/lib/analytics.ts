import posthog from 'posthog-js';
import type { GameMode, LangMode, Pool } from '../types';
import { shouldEnablePostHog } from './posthog';

export interface GameContext {
  mode: GameMode;
  lang: LangMode;
  pool: Pool;
}

function capture(event: string, properties?: object): void {
  if (!shouldEnablePostHog()) return;
  posthog.capture(event, properties);
}

export const analytics = {
  setContext(props: Partial<GameContext> & { ui_language?: string }): void {
    if (!shouldEnablePostHog()) return;
    posthog.register(props);
  },

  gameStarted(props: GameContext): void {
    capture('game_started', props);
  },

  gameSessionEnded(
    props: GameContext & {
      reason: 'home' | 'page_exit';
      duration_seconds: number;
      clips_played: number;
      guesses: number;
      rounds_completed: number;
      score: number;
    },
  ): void {
    capture('game_session_ended', props);
  },

  clipPlayed(
    props: GameContext & {
      clip_seconds: number;
      segment: number;
    },
  ): void {
    capture('clip_played', props);
  },

  clipSkipped(
    props: GameContext & {
      clip_seconds: number;
      segment: number;
      next_clip_seconds?: number;
    },
  ): void {
    capture('clip_skipped', props);
  },

  guessSubmitted(
    props: GameContext & {
      correct: boolean;
      attempt: number;
      clip_seconds: number;
      used_autocomplete: boolean;
    },
  ): void {
    capture('guess_submitted', props);
  },

  roundCompleted(
    props: GameContext & {
      result: 'won' | 'lost';
      completion: 'correct_guess' | 'surrender' | 'out_of_segments';
      attempts: number;
      clip_seconds: number;
      score?: number;
      lives_remaining?: number;
      perfect?: boolean;
    },
  ): void {
    capture('round_completed', props);
  },

  dailyChallengeCompleted(
    props: GameContext & {
      pools_won: number;
      full_clear: boolean;
      perfect_day: boolean;
      streak: number;
    },
  ): void {
    capture('daily_challenge_completed', props);
  },

  infiniteGameCompleted(
    props: GameContext & {
      score: number;
      session_rounds_completed: number;
      is_new_high_score: boolean;
    },
  ): void {
    capture('infinite_game_completed', props);
  },

  difficultySelected(
    props: GameContext & {
      previous_pool: Pool;
    },
  ): void {
    capture('difficulty_selected', props);
  },

  boardSelected(
    props: GameContext & {
      previous_lang: LangMode;
    },
  ): void {
    capture('board_selected', props);
  },

  infiniteGameRestarted(
    props: GameContext & {
      previous_score: number;
    },
  ): void {
    capture('infinite_game_restarted', props);
  },

  resultShared(
    props: GameContext & {
      method: 'copy' | 'native' | 'copy_fallback';
      result: 'won' | 'lost' | 'game_over';
      score?: number;
    },
  ): void {
    capture('result_shared', props);
  },

  surrenderPrompted(
    props: GameContext & {
      attempts: number;
      clip_seconds: number;
    },
  ): void {
    capture('surrender_prompted', props);
  },

  uiLanguageChanged(props: { from: string; to: string }): void {
    capture('ui_language_changed', props);
  },
};
