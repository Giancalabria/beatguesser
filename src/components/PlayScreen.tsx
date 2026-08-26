import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { analytics } from '../lib/analytics';
import type { DailyResult, DailyState, GameMode, Pool, Song } from '../types';
import {
  CLIP_MARKS,
  INFINITE_LIVES,
  POOLS,
  POOL_COLORS,
  POOL_I18N_KEYS,
} from '../types';
import { AudioClipper } from '../lib/clip';
import {
  getBackupSongs,
  getSearchCatalog,
  resolveSongMedia,
  searchSpotifyCatalog,
} from '../lib/catalog';
import { getDateKey, resolveDailySong } from '../lib/daily';
import { pickRandomSong } from '../lib/infinite';
import { isCorrectGuess, searchSongs } from '../lib/search';
import {
  getInfiniteHighScore,
  getPoolStatus,
  getVisibleStreak,
  isFullClear,
  isPerfectDay,
  isPerfectWin,
  isPoolCompleted,
  loadDailyState,
  saveDailyProgress,
  saveDailyResult,
  saveInfiniteHighScore,
} from '../lib/storage';
import ShareCard, {
  buildShareMessage,
  buildShareText,
  getShareUrl,
} from './ShareCard';
import { DailyResultDialog, SurrenderDialog } from './GameDialogs';
import LanguageSwitcher from './LanguageSwitcher';
import SongCombobox from './SongCombobox';
import SongReveal from './SongReveal';
import StreakBadge from './StreakBadge';

interface PlayScreenProps {
  mode: GameMode;
  onHome: () => void;
}

type RoundStatus = 'playing' | 'won' | 'lost';
type GuessFeedbackState = {
  kind: 'correct' | 'wrong';
  message: string;
} | null;
const MAX_CLIP_DURATION = CLIP_MARKS[CLIP_MARKS.length - 1];

function HeartIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg
      className="w-5 h-5 sm:w-6 sm:h-6"
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth="2"
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="8,5 8,19 19,12" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}

function logAudioDev(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.debug('[audio]', ...args);
  }
}

export default function PlayScreen({ mode, onHome }: PlayScreenProps) {
  const { t } = useTranslation();
  const [pool, setPool] = useState<Pool>('easy');
  const [dailyState, setDailyState] = useState<DailyState>(() => loadDailyState(getDateKey()));
  const [segmentIndex, setSegmentIndex] = useState(() =>
    mode === 'daily' ? (loadDailyState(getDateKey()).progress.easy?.segmentIndex ?? 0) : 0,
  );
  const [roundStatus, setRoundStatus] = useState<RoundStatus>('playing');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Song[]>([]);
  const [searchCatalog, setSearchCatalog] = useState<Song[]>([]);
  const [guessFeedback, setGuessFeedback] = useState<GuessFeedbackState>(null);
  const [attempts, setAttempts] = useState(() =>
    mode === 'daily' ? (loadDailyState(getDateKey()).progress.easy?.attempts ?? 0) : 0,
  );
  const [lives, setLives] = useState(INFINITE_LIVES);
  const [score, setScore] = useState(0);
  const [usedIds, setUsedIds] = useState<Set<string>>(() => new Set());
  const [infiniteOver, setInfiniteOver] = useState(false);
  const [poolLocked, setPoolLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [highScore, setHighScore] = useState(() => getInfiniteHighScore('easy'));
  const [revealSong, setRevealSong] = useState(false);
  const [showSurrenderDialog, setShowSurrenderDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [streak, setStreak] = useState(() => getVisibleStreak(getDateKey()));

  const clipperRef = useRef(new AudioClipper());
  const loadIdRef = useRef(0);
  const songRequestRef = useRef(0);
  const progressFrameRef = useRef<number | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const dailyProgressRef = useRef({ mode, pool, roundStatus, attempts, segmentIndex });
  dailyProgressRef.current = { mode, pool, roundStatus, attempts, segmentIndex };
  const sessionAnalyticsRef = useRef({
    startedAt: Date.now(),
    clipsPlayed: 0,
    guesses: 0,
    roundsCompleted: 0,
    score: 0,
    pool: 'easy' as Pool,
    ended: false,
  });

  const accent = POOL_COLORS[pool];
  const currentDuration = CLIP_MARKS[segmentIndex];
  const isAutocompletePool = mode === 'daily' || pool === 'easy' || pool === 'medium';
  const poolDone = mode === 'daily' && isPoolCompleted(dailyState, pool);
  const completedResult = dailyState.results[pool];
  const perfectDay = isPerfectDay(dailyState);
  const fullClear = isFullClear(dailyState);
  const shareExtras = { streak: streak.current, perfectDay };
  const dailyCompletedCount = POOLS.filter(
    (dailyPool) => getPoolStatus(dailyState, dailyPool) !== 'pending',
  ).length;
  const dailyWonCount = POOLS.filter(
    (dailyPool) => getPoolStatus(dailyState, dailyPool) === 'won',
  ).length;
  const feedbackId = 'guess-feedback';
  const trackSessionEnd = useCallback(
    (reason: 'home' | 'page_exit') => {
      const session = sessionAnalyticsRef.current;
      if (session.ended) return;
      session.ended = true;
      analytics.gameSessionEnded({
        mode,
        pool: session.pool,
        reason,
        duration_seconds: Math.round((Date.now() - session.startedAt) / 1000),
        clips_played: session.clipsPlayed,
        guesses: session.guesses,
        rounds_completed: session.roundsCompleted,
        score: session.score,
      });
    },
    [mode],
  );
  const persistDailyProgress = useCallback(
    (nextAttempts: number, nextSegment: number) => {
      if (mode !== 'daily') return;
      setDailyState(
        saveDailyProgress(getDateKey(), pool, {
          attempts: nextAttempts,
          segmentIndex: nextSegment,
        }),
      );
    },
    [mode, pool],
  );

  const handleHome = useCallback(() => {
    if (mode === 'daily' && roundStatus === 'playing') {
      persistDailyProgress(attempts, segmentIndex);
    }
    trackSessionEnd('home');
    onHome();
  }, [attempts, mode, onHome, persistDailyProgress, roundStatus, segmentIndex, trackSessionEnd]);
  const searchCandidates = useMemo(() => {
    const byLabel = new Map(
      searchCatalog.map((song) => [
        `${song.title}::${song.artist}`.toLocaleLowerCase(),
        song,
      ]),
    );
    if (currentSong?.pool === pool) {
      byLabel.set(
        `${currentSong.title}::${currentSong.artist}`.toLocaleLowerCase(),
        currentSong,
      );
    }
    return [...byLabel.values()];
  }, [currentSong, pool, searchCatalog]);

  const schedule = useCallback((callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delayMs);
    timersRef.current.add(timer);
  }, []);

  const stopProgressTracking = useCallback(() => {
    if (progressFrameRef.current !== null) {
      cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
    setPlaybackProgress(0);
  }, []);

  const startProgressTracking = useCallback(() => {
    if (progressFrameRef.current !== null) {
      cancelAnimationFrame(progressFrameRef.current);
    }

    const update = () => {
      const clipper = clipperRef.current;
      setPlaybackProgress(Math.min(clipper.getCurrentTime(), MAX_CLIP_DURATION));

      if (clipper.isPlaying()) {
        progressFrameRef.current = requestAnimationFrame(update);
      } else {
        progressFrameRef.current = null;
        setPlaybackProgress(0);
      }
    };

    progressFrameRef.current = requestAnimationFrame(update);
  }, []);

  const loadSong = useCallback(async (song: Song) => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setAudioReady(false);
    setCurrentSong(null);
    setGuessFeedback(null);
    clipperRef.current.stop();

    try {
      const songsToTry = [song, ...getBackupSongs(song)];
      for (const [songIndex, candidateSong] of songsToTry.entries()) {
        if (loadId !== loadIdRef.current) return;
        let previewUrls: string[] = [];
        let imageUrl = candidateSong.imageUrl;
        try {
          const media = await resolveSongMedia(candidateSong);
          previewUrls = media.previewUrls;
          imageUrl = media.imageUrl ?? imageUrl;
        } catch (error) {
          logAudioDev('preview resolve failed', candidateSong.id, error);
        }

        for (const previewUrl of previewUrls) {
          if (loadId !== loadIdRef.current) return;
          try {
            await clipperRef.current.load(previewUrl);
            if (loadId !== loadIdRef.current) return;
            setCurrentSong({ ...candidateSong, previewUrl, imageUrl });
            setAudioReady(true);
            logAudioDev(
              songIndex === 0 ? 'ready' : 'backup ready',
              candidateSong.id,
              previewUrl,
            );
            return;
          } catch (error) {
            logAudioDev('preview source failed', candidateSong.id, previewUrl, error);
          }
        }
      }

      if (loadId !== loadIdRef.current) return;
      setCurrentSong(song);
      setAudioReady(false);
      logAudioDev('all preview sources and backup songs failed', song.id);
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      setAudioReady(false);
      logAudioDev('resolve failed', err);
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const initDailySong = useCallback(
    async (p: Pool) => {
      const requestId = ++songRequestRef.current;
      setLoading(true);
      try {
        const song = await resolveDailySong(p, getDateKey());
        if (requestId !== songRequestRef.current) return;
        const saved = loadDailyState(getDateKey()).progress[p];
        setSegmentIndex(saved?.segmentIndex ?? 0);
        setRoundStatus('playing');
        setQuery('');
        setSuggestions([]);
        setAttempts(saved?.attempts ?? 0);
        setShowResultDialog(false);
        await loadSong(song);
      } catch (error) {
        if (requestId !== songRequestRef.current) return;
        setLoading(false);
        setAudioReady(false);
        logAudioDev('daily resolve failed', error);
      }
    },
    [loadSong],
  );

  const initInfiniteSong = useCallback(
    async (p: Pool, used: Set<string>) => {
      let activeUsed = used;
      let song = pickRandomSong(p, activeUsed);
      if (!song && activeUsed.size > 0) {
        activeUsed = new Set();
        setUsedIds(activeUsed);
        song = pickRandomSong(p, activeUsed);
      }
      if (!song) {
        setInfiniteOver(true);
        return;
      }
      setSegmentIndex(0);
      setRoundStatus('playing');
      setQuery('');
      setSuggestions([]);
      setAttempts(0);
      await loadSong(song);
    },
    [loadSong],
  );

  useEffect(() => {
    const handlePageHide = (event: PageTransitionEvent) => {
      const snap = dailyProgressRef.current;
      if (snap.mode === 'daily' && snap.roundStatus === 'playing') {
        saveDailyProgress(getDateKey(), snap.pool, {
          attempts: snap.attempts,
          segmentIndex: snap.segmentIndex,
        });
      }
      if (!event.persisted) trackSessionEnd('page_exit');
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [trackSessionEnd]);

  useEffect(() => {
    const clipper = clipperRef.current;
    clipper.setPlayingChangeListener((playing) => setIsPlaying(playing));
    clipper.setErrorListener((error) => {
      logAudioDev('clipper error', error);
      if (error.phase === 'play') {
        setIsPlaying(false);
      }
    });

    const dateKey = getDateKey();
    setDailyState(loadDailyState(dateKey));
    setHighScore(getInfiniteHighScore(pool));

    if (mode === 'daily') {
      if (!isPoolCompleted(loadDailyState(dateKey), pool)) {
        void initDailySong(pool);
      }
    } else {
      void initInfiniteSong(pool, new Set());
    }

    return () => {
      loadIdRef.current += 1;
      songRequestRef.current += 1;
      for (const timer of timersRef.current) clearTimeout(timer);
      timersRef.current.clear();
      if (progressFrameRef.current !== null) {
        cancelAnimationFrame(progressFrameRef.current);
        progressFrameRef.current = null;
      }
      clipper.setPlayingChangeListener(null);
      clipper.setErrorListener(null);
      clipper.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSearchCatalog([]);
    void getSearchCatalog(pool).then((songs) => {
      if (!cancelled) setSearchCatalog(songs);
    });
    return () => {
      cancelled = true;
    };
  }, [pool]);

  useEffect(() => {
    if (mode !== 'daily') return;
    let activeDate = getDateKey();
    const interval = window.setInterval(() => {
      const nextDate = getDateKey();
      if (nextDate === activeDate) return;
      activeDate = nextDate;
      const state = loadDailyState(nextDate);
      setDailyState(state);
      setStreak(getVisibleStreak(nextDate));
      setRoundStatus('playing');
      setShowResultDialog(false);
      void initDailySong(pool);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [initDailySong, mode, pool]);

  useEffect(() => {
    if (
      !isAutocompletePool ||
      query.trim().length === 0 ||
      roundStatus !== 'playing'
    ) {
      setSuggestions([]);
      return;
    }

    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const localResults = searchSongs(query, searchCandidates, 8);
    setSuggestions([]);

    let cancelled = false;
    const debounce = window.setTimeout(() => {
      void searchSpotifyCatalog(query, pool, 10).then((spotifyResults) => {
        if (cancelled) return;
        const byLabel = new Map<string, Song>();
        for (const song of [...localResults, ...spotifyResults]) {
          const key = `${song.title}::${song.artist}`.toLocaleLowerCase();
          if (!byLabel.has(key)) byLabel.set(key, song);
        }
        setSuggestions([...byLabel.values()].slice(0, 10));
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
    };
  }, [query, isAutocompletePool, roundStatus, searchCandidates, pool]);

  const handlePlay = () => {
    if (!audioReady || roundStatus !== 'playing') return;
    if (mode === 'infinite') setPoolLocked(true);
    if (isPlaying) {
      clipperRef.current.stop();
      setIsPlaying(false);
      stopProgressTracking();
    } else {
      void clipperRef.current
        .play(currentDuration)
        .then(() => {
          sessionAnalyticsRef.current.clipsPlayed += 1;
          analytics.clipPlayed({
            mode,
            pool,
            clip_seconds: currentDuration,
            segment: segmentIndex + 1,
          });
          setIsPlaying(true);
          startProgressTracking();
        })
        .catch((err) => {
          setIsPlaying(false);
          logAudioDev('play rejected', err);
          if (currentSong) void loadSong(currentSong);
        });
    }
  };

  const finishRound = useCallback(
    (
      won: boolean,
      attemptCount = attempts,
      completion: 'correct_guess' | 'surrender' = won ? 'correct_guess' : 'surrender',
    ) => {
      clipperRef.current.stop();
      setIsPlaying(false);
      setRoundStatus(won ? 'won' : 'lost');
      setSuggestions([]);

      if (mode === 'daily' && currentSong) {
        const result: DailyResult = {
          pool,
          won,
          attempts: attemptCount,
          segmentsUsed: segmentIndex + 1,
          maxSegment: segmentIndex,
          songId: currentSong.id,
          songTitle: currentSong.title,
          songArtist: currentSong.artist,
          songSpotifyId: currentSong.spotifyId,
          songImageUrl: currentSong.imageUrl,
        };
        const nextDailyState = saveDailyResult(getDateKey(), result);
        setDailyState(nextDailyState);
        setStreak(getVisibleStreak(getDateKey()));
        setShowResultDialog(true);
        sessionAnalyticsRef.current.roundsCompleted += 1;
        analytics.roundCompleted({
          mode,
          pool,
          result: won ? 'won' : 'lost',
          completion,
          attempts: attemptCount,
          clip_seconds: CLIP_MARKS[segmentIndex],
        });

        const completedPools = POOLS.filter(
          (dailyPool) => getPoolStatus(nextDailyState, dailyPool) !== 'pending',
        );
        if (completedPools.length === POOLS.length) {
          analytics.dailyChallengeCompleted(
            POOLS.filter(
              (dailyPool) => getPoolStatus(nextDailyState, dailyPool) === 'won',
            ).length,
          );
        }
      }
    },
    [mode, currentSong, pool, segmentIndex, attempts],
  );

  const handleFail = useCallback(() => {
    clipperRef.current.stop();
    songRequestRef.current += 1;
    setIsPlaying(false);

    if (mode === 'infinite') {
      const newLives = lives - 1;
      const nextUsed = new Set(usedIds);
      if (currentSong) nextUsed.add(currentSong.id);
      setUsedIds(nextUsed);
      sessionAnalyticsRef.current.roundsCompleted += 1;
      analytics.roundCompleted({
        mode,
        pool,
        result: 'lost',
        completion: 'out_of_segments',
        attempts,
        clip_seconds: CLIP_MARKS[segmentIndex],
        score,
        lives_remaining: Math.max(newLives, 0),
      });

      if (newLives <= 0) {
        setLives(0);
        setRoundStatus('lost');
        setInfiniteOver(true);
        saveInfiniteHighScore(pool, score);
        setHighScore((hs) => Math.max(hs, score));
        analytics.infiniteGameCompleted({
          pool,
          score,
          session_rounds_completed: sessionAnalyticsRef.current.roundsCompleted,
          is_new_high_score: score > highScore,
        });
      } else {
        setLives(newLives);
        setRevealSong(true);
        schedule(() => {
          setRevealSong(false);
          setSegmentIndex(0);
          setRoundStatus('playing');
          setQuery('');
          setGuessFeedback(null);
          void initInfiniteSong(pool, nextUsed);
        }, 1800);
      }
    }
  }, [
    mode,
    lives,
    currentSong,
    pool,
    score,
    highScore,
    usedIds,
    attempts,
    segmentIndex,
    initInfiniteSong,
    schedule,
  ]);

  const advanceSegment = useCallback(() => {
    const isLast = segmentIndex >= CLIP_MARKS.length - 1;
    if (isLast) {
      if (mode === 'infinite') handleFail();
      setGuessFeedback(null);
      return;
    }
    clipperRef.current.stop();
    setIsPlaying(false);
    setSegmentIndex((i) => i + 1);
    setGuessFeedback(null);
    persistDailyProgress(attempts, segmentIndex + 1);
  }, [attempts, handleFail, mode, persistDailyProgress, segmentIndex]);

  const handleSkip = () => {
    if (roundStatus !== 'playing') return;
    if (mode === 'infinite') setPoolLocked(true);
    if (mode === 'daily' && segmentIndex >= CLIP_MARKS.length - 1) {
      setShowSurrenderDialog(true);
      return;
    }
    advanceSegment();
  };

  const handleGuess = (guessText?: string, selectedSong?: Song) => {
    if (roundStatus !== 'playing' || !currentSong || guessFeedback) return;

    const text = (guessText ?? query).trim();
    if (!text) return;
    setQuery('');
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    persistDailyProgress(nextAttempts, segmentIndex);

    if (mode === 'infinite') setPoolLocked(true);
    clipperRef.current.stop();
    setIsPlaying(false);
    setSuggestions([]);

    const correct = selectedSong
      ? isCorrectGuess('', currentSong, selectedSong)
      : isCorrectGuess(text, currentSong);
    sessionAnalyticsRef.current.guesses += 1;
    analytics.guessSubmitted({
      mode,
      pool,
      correct,
      attempt: nextAttempts,
      clip_seconds: currentDuration,
      used_autocomplete: Boolean(selectedSong),
    });

    if (correct) {
      setGuessFeedback({ kind: 'correct', message: t('feedback.correct') });
      if (mode === 'infinite') {
        const nextUsed = new Set(usedIds);
        const nextScore = score + 1;
        nextUsed.add(currentSong.id);
        setScore((s) => s + 1);
        setUsedIds(nextUsed);
        sessionAnalyticsRef.current.roundsCompleted += 1;
        sessionAnalyticsRef.current.score = nextScore;
        analytics.roundCompleted({
          mode,
          pool,
          result: 'won',
          completion: 'correct_guess',
          attempts: nextAttempts,
          clip_seconds: currentDuration,
          score: nextScore,
          lives_remaining: lives,
        });
        setRevealSong(true);
        schedule(() => {
          setRevealSong(false);
          setGuessFeedback(null);
          setSegmentIndex(0);
          setQuery('');
          void initInfiniteSong(pool, nextUsed);
        }, 2200);
      } else {
        finishRound(true, nextAttempts);
      }
    } else {
      const isLast = segmentIndex >= CLIP_MARKS.length - 1;
      const message =
        mode === 'daily' && isLast
          ? t('feedback.wrongUnlimited', { seconds: MAX_CLIP_DURATION })
          : isLast
            ? t('feedback.wrong')
            : t('feedback.wrongNext', { seconds: CLIP_MARKS[segmentIndex + 1] });
      setGuessFeedback({ kind: 'wrong', message });
      schedule(() => advanceSegment(), 1600);
    }
  };

  const handlePoolChange = (p: Pool) => {
    if (mode === 'infinite' && poolLocked) return;
    if (p === pool) return;

    if (mode === 'daily' && roundStatus === 'playing') {
      persistDailyProgress(attempts, segmentIndex);
    }

    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
    clipperRef.current.stop();
    songRequestRef.current += 1;
    setIsPlaying(false);
    setPool(p);
    sessionAnalyticsRef.current.pool = p;
    sessionAnalyticsRef.current.score = 0;
    analytics.difficultySelected({
      mode,
      pool: p,
      previous_pool: pool,
    });
    const nextDailyState = mode === 'daily' ? loadDailyState(getDateKey()) : dailyState;
    const saved = mode === 'daily' ? nextDailyState.progress[p] : undefined;
    setSegmentIndex(saved?.segmentIndex ?? 0);
    setRoundStatus('playing');
    setQuery('');
    setGuessFeedback(null);
    setAttempts(saved?.attempts ?? 0);
    setCurrentSong(null);
    setAudioReady(false);
    setCopyError(false);
    setCopied(false);
    setShowSurrenderDialog(false);
    setShowResultDialog(false);
    setHighScore(getInfiniteHighScore(p));

    if (mode === 'daily') {
      setDailyState(nextDailyState);
      if (!isPoolCompleted(nextDailyState, p)) {
        void initDailySong(p);
      }
    } else {
      setUsedIds(new Set());
      setScore(0);
      setLives(INFINITE_LIVES);
      setInfiniteOver(false);
      void initInfiniteSong(p, new Set());
    }
  };

  const handleInfiniteRestart = () => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
    setLives(INFINITE_LIVES);
    setScore(0);
    setUsedIds(new Set());
    setInfiniteOver(false);
    setPoolLocked(true);
    setRoundStatus('playing');
    setSegmentIndex(0);
    sessionAnalyticsRef.current.score = 0;
    analytics.infiniteGameRestarted({
      pool,
      previous_score: score,
    });
    void initInfiniteSong(pool, new Set());
  };

  const handleCopyShare = async () => {
    const text = buildShareText(mode, pool, completedResult, score, undefined, shareExtras);
    try {
      await navigator.clipboard.writeText(text);
      analytics.resultShared({
        mode,
        pool,
        method: 'copy',
        result:
          mode === 'daily' ? (completedResult?.won ? 'won' : 'lost') : 'game_over',
        score: mode === 'infinite' ? score : undefined,
      });
      setCopyError(false);
      setCopied(true);
      schedule(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  };

  const handleShareResult = async () => {
    const message = buildShareMessage(mode, pool, completedResult, score, shareExtras);
    const url = getShareUrl();
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'BeatGuesser',
          text: message,
          url,
        });
        analytics.resultShared({
          mode,
          pool,
          method: 'native',
          result:
            mode === 'daily' ? (completedResult?.won ? 'won' : 'lost') : 'game_over',
          score: mode === 'infinite' ? score : undefined,
        });
      } else {
        await navigator.clipboard.writeText(buildShareText(mode, pool, completedResult, score, url, shareExtras));
        analytics.resultShared({
          mode,
          pool,
          method: 'copy_fallback',
          result:
            mode === 'daily' ? (completedResult?.won ? 'won' : 'lost') : 'game_over',
          score: mode === 'infinite' ? score : undefined,
        });
      }
      setCopyError(false);
      setCopied(true);
      schedule(() => setCopied(false), 2000);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setCopyError(true);
    }
  };

  const showPlayArea =
    !poolDone && !infiniteOver && roundStatus === 'playing' && !revealSong;

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="screen-shell flex-1 flex flex-col md:justify-center">
        <div className="hidden lg:flex justify-center mb-5">
          <button
            type="button"
            onClick={handleHome}
            className="group flex items-center gap-3 rounded-full px-4 py-2 text-left transition-colors hover:bg-white/5"
            aria-label={t('game.backHome')}
          >
            <img
              src="/favicon.svg"
              alt=""
              className="w-11 h-11 transition-transform group-hover:scale-105"
            />
            <span className="text-2xl font-bold tracking-tight">
              <span className="text-easy">Beat</span>
              <span className="text-white">Guesser</span>
            </span>
          </button>
        </div>
        <div className="screen-panel w-full max-w-3xl mx-auto flex flex-col flex-1 md:flex-none gap-3 sm:gap-5 md:gap-8">
          <div className="grid grid-cols-3 items-center gap-2">
            <button
              type="button"
              onClick={handleHome}
              className="justify-self-start inline-flex items-center gap-1 h-9 -ml-2 pl-2 pr-3 rounded-full text-sm text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <BackIcon />
              {t('common.home')}
            </button>
            <span className="justify-self-center text-[11px] sm:text-xs font-medium text-neutral-500 uppercase tracking-[0.18em]">
              {mode === 'daily' ? t('common.daily') : t('common.infinite')}
            </span>
            <div className="justify-self-end flex items-center gap-1.5">
              {mode === 'daily' && <StreakBadge count={streak.current} />}
              {mode === 'daily' && attempts > 0 && roundStatus === 'playing' && !poolDone && (
                <span
                  className="rounded-full border border-neutral-700 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-neutral-400"
                  aria-live="polite"
                >
                  {t('game.attempts', { count: attempts })}
                </span>
              )}
              {mode === 'infinite' && !infiniteOver && (
                <div
                  className="flex items-center gap-0.5"
                  aria-label={t('game.livesRemaining', { count: lives })}
                >
                  {Array.from({ length: INFINITE_LIVES }).map((_, i) => (
                    <span key={i} aria-hidden="true">
                      <HeartIcon filled={i < lives} color={accent} />
                    </span>
                  ))}
                </div>
              )}
              {mode === 'infinite' && infiniteOver && (
                <span className="text-sm font-mono" style={{ color: accent }}>
                  {t('game.pointsShort', { count: score })}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-end -mt-2 sm:-mt-3">
            <LanguageSwitcher />
          </div>

          <div
            className="flex rounded-full bg-black/40 p-1 border border-neutral-800"
            role="group"
            aria-label={t('common.difficulty')}
          >
            {POOLS.map((p) => {
              const status = mode === 'daily' ? getPoolStatus(dailyState, p) : 'pending';
              const locked = mode === 'infinite' && poolLocked && p !== pool;
              const active = p === pool;
              const color = POOL_COLORS[p];
              const statusColor =
                status === 'won' ? '#C8FF00' : status === 'lost' ? '#FF6B63' : undefined;

              return (
                <button
                  key={p}
                  type="button"
                  disabled={locked}
                  onClick={() => handlePoolChange(p)}
                  className="relative flex-1 min-w-0 h-8 sm:h-9 px-0.5 rounded-full text-[10px] sm:text-xs font-semibold tracking-tight leading-none whitespace-nowrap transition-all disabled:opacity-30"
                  style={{
                    backgroundColor: active ? `${color}22` : 'transparent',
                    color: active ? color : statusColor ?? '#888',
                    boxShadow: active ? `inset 0 0 0 1px ${color}` : undefined,
                  }}
                  aria-pressed={active}
                  aria-label={`${t(POOL_I18N_KEYS[p])}: ${t(`status.${status}`)}`}
                >
                  {t(POOL_I18N_KEYS[p])}
                  {mode === 'daily' && status === 'pending' && dailyState.progress[p] && (
                    <span
                      className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-current"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {mode === 'daily' && (
            <p className="text-center text-[11px] sm:text-xs text-neutral-500 -mt-1" aria-live="polite">
              {t('game.completed', {
                completed: dailyCompletedCount,
                won: dailyWonCount,
                count: dailyWonCount,
              })}
            </p>
          )}

          {mode === 'infinite' && !infiniteOver && (
            <div className="text-center -mt-1">
              <span className="font-mono text-xl sm:text-2xl font-semibold" style={{ color: accent }}>
                {score}
              </span>
              <span className="text-neutral-500 text-xs sm:text-sm ml-1.5">
                {t('game.songs', { count: score })}
              </span>
              {highScore > 0 && (
                <span className="text-neutral-600 text-[11px] sm:text-xs ml-2">
                  {t('game.record', { score: highScore })}
                </span>
              )}
            </div>
          )}

          {showPlayArea && (
            <>
              <div className="flex-1 flex flex-col items-center justify-center gap-8 sm:gap-10 min-h-32 py-2">
                <div className="flex flex-col items-center gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={handlePlay}
                    disabled={!audioReady || loading}
                    className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40"
                    style={{
                      backgroundColor: accent,
                      color: '#0E0E0E',
                      boxShadow: `0 0 28px ${accent}38`,
                    }}
                    aria-label={isPlaying ? t('common.pause') : t('common.play')}
                  >
                    {loading ? (
                      <span className="w-6 h-6 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                    ) : isPlaying ? (
                      <PauseIcon />
                    ) : (
                      <PlayIcon />
                    )}
                  </button>
                  <span
                    className="font-mono text-2xl sm:text-3xl md:text-4xl font-semibold tabular-nums leading-none"
                    style={{ color: accent }}
                  >
                    {currentDuration}s
                  </span>
                </div>
                <div className="relative w-full px-1">
                  <div
                    className="h-1.5 sm:h-2 bg-white/10 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label={t('game.audioProgress')}
                    aria-valuemin={0}
                    aria-valuemax={currentDuration}
                    aria-valuenow={Math.min(playbackProgress, currentDuration)}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(playbackProgress / MAX_CLIP_DURATION) * 100}%`,
                        backgroundColor: accent,
                      }}
                    />
                  </div>
                  <div className="absolute inset-0 pointer-events-none">
                    {CLIP_MARKS.slice(0, -1).map((mark, i) => (
                      <div
                        key={mark}
                        className="absolute top-1/2 w-px h-2.5 sm:h-3 rounded-full -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${(mark / MAX_CLIP_DURATION) * 100}%`,
                          backgroundColor: i === segmentIndex ? accent : '#555',
                          opacity: i === segmentIndex ? 1 : 0.7,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleGuess();
                }}
                className="flex flex-col gap-2 sm:gap-2.5"
              >
                <SongCombobox
                  value={query}
                  options={isAutocompletePool ? suggestions : []}
                  feedbackId={feedbackId}
                  invalid={guessFeedback?.kind === 'wrong'}
                  onChange={setQuery}
                  onSelect={(song) =>
                    handleGuess(`${song.title} ${song.artist}`, song)
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    disabled={!query.trim() || guessFeedback !== null}
                    className={`h-11 px-4 rounded-xl font-semibold text-bg text-sm transition-colors ${
                      guessFeedback ? 'disabled:opacity-100' : 'disabled:opacity-40'
                    }`}
                    style={{
                      backgroundColor:
                        guessFeedback?.kind === 'wrong'
                          ? '#FF453A'
                          : guessFeedback?.kind === 'correct'
                            ? '#C8FF00'
                            : accent,
                      color: guessFeedback?.kind === 'wrong' ? '#FFFFFF' : '#0E0E0E',
                    }}
                  >
                    {guessFeedback?.kind === 'correct'
                      ? `✓ ${t('feedback.correct')}`
                      : guessFeedback?.kind === 'wrong'
                        ? `✕ ${t('feedback.wrong')}`
                        : t('game.guess')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={guessFeedback !== null}
                    className="h-11 px-4 rounded-xl bg-white/15 border border-white/40 text-white text-sm font-semibold hover:bg-white/25 hover:border-white/60 transition-colors disabled:opacity-40"
                  >
                    {mode === 'daily' && segmentIndex >= CLIP_MARKS.length - 1
                      ? t('game.surrender')
                      : t('game.skip')}
                  </button>
                </div>
              </form>
              <span
                id={feedbackId}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
              >
                {guessFeedback?.message ?? ''}
              </span>
            </>
          )}

          {revealSong && currentSong && mode === 'infinite' && (
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <SongReveal
                title={currentSong.title}
                artist={currentSong.artist}
                imageUrl={currentSong.imageUrl}
                spotifyId={currentSong.spotifyId}
                caption={t('game.was')}
                size="sm"
              />
            </div>
          )}

          {mode === 'daily' && (poolDone || roundStatus !== 'playing') && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-3 sm:py-6">
              {(currentSong || completedResult) && (
                <SongReveal
                  title={currentSong?.title ?? completedResult?.songTitle ?? ''}
                  artist={currentSong?.artist ?? completedResult?.songArtist ?? ''}
                  imageUrl={currentSong?.imageUrl ?? completedResult?.songImageUrl}
                  spotifyId={currentSong?.spotifyId ?? completedResult?.songSpotifyId}
                />
              )}
              <p
                className="text-base sm:text-xl font-semibold"
                style={{
                  color: (completedResult?.won ?? roundStatus === 'won') ? accent : '#FF453A',
                }}
              >
                {(completedResult?.won ?? roundStatus === 'won')
                  ? t('game.dailyWon', { pool: t(POOL_I18N_KEYS[pool]) })
                  : t('game.dailyLost', { pool: t(POOL_I18N_KEYS[pool]) })}
              </p>
              {isPerfectWin(completedResult) && (
                <p className="text-sm font-black tracking-[0.14em] text-[#FFD60A]">{t('dialogs.perfect')}</p>
              )}
              {perfectDay && (
                <p className="text-sm font-semibold text-easy">{t('game.perfectDay')}</p>
              )}
              {fullClear && !perfectDay && (
                <p className="text-sm font-semibold text-easy">{t('game.fullClear')}</p>
              )}
              <ShareCard
                mode={mode}
                pool={pool}
                streak={streak.current}
                perfectDay={perfectDay}
                result={
                  completedResult ??
                  (currentSong
                    ? {
                        pool,
                        won: roundStatus === 'won',
                        attempts,
                        segmentsUsed: segmentIndex + 1,
                        maxSegment: segmentIndex,
                        songId: currentSong.id,
                        songTitle: currentSong.title,
                        songArtist: currentSong.artist,
                        songSpotifyId: currentSong.spotifyId,
                        songImageUrl: currentSong.imageUrl,
                      }
                    : undefined)
                }
                onCopy={() => void handleCopyShare()}
                copied={copied}
              />
              {copyError && (
                <p role="alert" className="text-expert text-xs sm:text-sm text-center">
                  {t('share.copyError')}
                </p>
              )}
              <p className="text-neutral-500 text-xs sm:text-sm text-center">
                {t('game.chooseAnother')}
              </p>
            </div>
          )}

          {infiniteOver && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-3 sm:py-6">
              {currentSong && roundStatus === 'lost' && (
                <SongReveal
                  title={currentSong.title}
                  artist={currentSong.artist}
                  imageUrl={currentSong.imageUrl}
                  spotifyId={currentSong.spotifyId}
                  size="sm"
                />
              )}
              <p className="text-xl sm:text-2xl font-bold" style={{ color: accent }}>
                {t('game.gameOver')}
              </p>
              <p className="font-mono text-3xl sm:text-4xl font-bold leading-none" style={{ color: accent }}>
                {score}
              </p>
              <p className="text-neutral-400 text-sm">
                {t('game.songsGuessed', { count: score })}
              </p>
              {score >= highScore && score > 0 && (
                <p className="text-easy text-xs sm:text-sm">{t('game.newRecord')}</p>
              )}
              <ShareCard
                mode={mode}
                pool={pool}
                score={score}
                onCopy={() => void handleCopyShare()}
                copied={copied}
              />
              {copyError && (
                <p role="alert" className="text-expert text-xs sm:text-sm text-center">
                  {t('share.copyError')}
                </p>
              )}
              <button
                type="button"
                onClick={handleInfiniteRestart}
                className="w-full h-11 rounded-xl font-semibold text-bg text-sm sm:text-base transition-colors mt-1"
                style={{ backgroundColor: accent }}
              >
                {t('game.playAgain')}
              </button>
            </div>
          )}
        </div>
      </div>
      <SurrenderDialog
        open={showSurrenderDialog}
        onCancel={() => setShowSurrenderDialog(false)}
        onConfirm={() => {
          setShowSurrenderDialog(false);
          finishRound(false);
        }}
      />
      <DailyResultDialog
        open={showResultDialog}
        song={currentSong}
        result={completedResult}
        shared={copied}
        shareError={copyError}
        streak={streak.current}
        perfectDay={perfectDay}
        fullClear={fullClear}
        onShare={() => void handleShareResult()}
        onClose={() => setShowResultDialog(false)}
      />
    </div>
  );
}
