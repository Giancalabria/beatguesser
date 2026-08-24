import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyResult, DailyState, GameMode, Pool, Song } from '../types';
import {
  CLIP_MARKS,
  INFINITE_LIVES,
  POOLS,
  POOL_COLORS,
  POOL_LABELS,
} from '../types';
import { AudioClipper } from '../lib/clip';
import {
  getSearchCatalog,
  resolveSongPreview,
  searchSpotifyCatalog,
} from '../lib/catalog';
import { getDateKey, resolveDailySong } from '../lib/daily';
import { pickRandomSong } from '../lib/infinite';
import { isCorrectGuess, searchSongs } from '../lib/search';
import {
  getInfiniteHighScore,
  getPoolStatus,
  isPoolCompleted,
  loadDailyState,
  saveDailyResult,
  saveInfiniteHighScore,
} from '../lib/storage';
import ShareCard, { buildShareText } from './ShareCard';
import GuessFeedback from './GuessFeedback';
import { DailyResultDialog, SurrenderDialog } from './GameDialogs';
import SongCombobox from './SongCombobox';

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
      className="w-6 h-6 sm:w-7 sm:h-7"
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth="2"
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="8,5 8,19 19,12" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10" viewBox="0 0 24 24" fill="currentColor">
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
  const [pool, setPool] = useState<Pool>('easy');
  const [dailyState, setDailyState] = useState<DailyState>(() => loadDailyState(getDateKey()));
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [roundStatus, setRoundStatus] = useState<RoundStatus>('playing');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Song[]>([]);
  const [searchCatalog, setSearchCatalog] = useState<Song[]>([]);
  const [guessFeedback, setGuessFeedback] = useState<GuessFeedbackState>(null);
  const [attempts, setAttempts] = useState(0);
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

  const clipperRef = useRef(new AudioClipper());
  const loadIdRef = useRef(0);
  const songRequestRef = useRef(0);
  const progressFrameRef = useRef<number | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const accent = POOL_COLORS[pool];
  const currentDuration = CLIP_MARKS[segmentIndex];
  const isAutocompletePool = mode === 'daily' || pool === 'easy' || pool === 'medium';
  const poolDone = mode === 'daily' && isPoolCompleted(dailyState, pool);
  const completedResult = dailyState.results[pool];
  const dailyCompletedCount = POOLS.filter(
    (dailyPool) => getPoolStatus(dailyState, dailyPool) !== 'pending',
  ).length;
  const dailyWonCount = POOLS.filter(
    (dailyPool) => getPoolStatus(dailyState, dailyPool) === 'won',
  ).length;
  const feedbackId = 'guess-feedback';
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
    setAudioError(null);
    setGuessFeedback(null);
    clipperRef.current.stop();

    try {
      const resolved = await resolveSongPreview(song);
      if (loadId !== loadIdRef.current) return;

      setCurrentSong(resolved);

      if (resolved.previewUrl) {
        try {
          await clipperRef.current.load(resolved.previewUrl);
          if (loadId !== loadIdRef.current) return;
          setAudioReady(true);
          setAudioError(null);
          logAudioDev('ready', resolved.id);
        } catch (err) {
          if (loadId !== loadIdRef.current) return;
          setAudioReady(false);
          setAudioError('No se pudo cargar el preview. Probá otra dificultad o recargá.');
          logAudioDev('load failed', resolved.id, err);
        }
      } else {
        setAudioReady(false);
        setAudioError('Preview no disponible para esta canción.');
        logAudioDev('no preview url', resolved.id);
      }
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      setAudioReady(false);
      setAudioError('Error al preparar la canción.');
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
      setAudioError(null);
      try {
        const song = await resolveDailySong(p, getDateKey());
        if (requestId !== songRequestRef.current) return;
        setSegmentIndex(0);
        setRoundStatus('playing');
        setQuery('');
        setSuggestions([]);
        setAttempts(0);
        setShowResultDialog(false);
        await loadSong(song);
      } catch (error) {
        if (requestId !== songRequestRef.current) return;
        setLoading(false);
        setAudioReady(false);
        setAudioError('No se pudo cargar la canción diaria. Probá de nuevo.');
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
    const clipper = clipperRef.current;
    clipper.setPlayingChangeListener((playing) => setIsPlaying(playing));
    clipper.setErrorListener((error) => {
      logAudioDev('clipper error', error);
      if (error.phase === 'play') {
        setAudioError('No se pudo reproducir. Revisá el volumen o probá de nuevo.');
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
        for (const song of [...spotifyResults, ...localResults]) {
          const key = `${song.title}::${song.artist}`.toLocaleLowerCase();
          if (!byLabel.has(key)) byLabel.set(key, song);
        }
        setSuggestions(searchSongs(query, [...byLabel.values()], 10));
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
      setAudioError(null);
      void clipperRef.current
        .play(currentDuration)
        .then(() => {
          setIsPlaying(true);
          startProgressTracking();
        })
        .catch((err) => {
          setIsPlaying(false);
          setAudioError('No se pudo reproducir. Revisá el volumen o probá de nuevo.');
          logAudioDev('play rejected', err);
        });
    }
  };

  const handleRetryAudio = () => {
    setAudioError(null);
    if (currentSong) {
      void loadSong(currentSong);
    } else if (mode === 'daily') {
      void initDailySong(pool);
    } else {
      void initInfiniteSong(pool, usedIds);
    }
  };

  const finishRound = useCallback(
    (won: boolean, attemptCount = attempts) => {
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
        };
        setDailyState(saveDailyResult(getDateKey(), result));
        setShowResultDialog(true);
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

      if (newLives <= 0) {
        setLives(0);
        setRoundStatus('lost');
        setInfiniteOver(true);
        saveInfiniteHighScore(pool, score);
        setHighScore((hs) => Math.max(hs, score));
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
    usedIds,
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
  }, [segmentIndex, mode, handleFail]);

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
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (mode === 'infinite') setPoolLocked(true);
    clipperRef.current.stop();
    setIsPlaying(false);
    setSuggestions([]);

    if (isCorrectGuess(text, currentSong, selectedSong)) {
      setGuessFeedback({ kind: 'correct', message: '¡Correcto!' });
      if (mode === 'infinite') {
        const nextUsed = new Set(usedIds);
        nextUsed.add(currentSong.id);
        setScore((s) => s + 1);
        setUsedIds(nextUsed);
        schedule(() => {
          setGuessFeedback(null);
          setSegmentIndex(0);
          setQuery('');
          void initInfiniteSong(pool, nextUsed);
        }, 1400);
      } else {
        finishRound(true, nextAttempts);
      }
    } else {
      const isLast = segmentIndex >= CLIP_MARKS.length - 1;
      const message =
        mode === 'daily' && isLast
          ? `No es esa. Tenés intentos ilimitados con el clip de ${MAX_CLIP_DURATION} s.`
          : isLast
            ? 'No es esa.'
            : `No es esa. Ahora podés escuchar ${CLIP_MARKS[segmentIndex + 1]} s.`;
      setGuessFeedback({ kind: 'wrong', message });
      schedule(() => advanceSegment(), 1600);
    }
  };

  const handlePoolChange = (p: Pool) => {
    if (mode === 'infinite' && poolLocked) return;
    if (p === pool) return;

    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
    clipperRef.current.stop();
    songRequestRef.current += 1;
    setIsPlaying(false);
    setPool(p);
    setSegmentIndex(0);
    setRoundStatus('playing');
    setQuery('');
    setGuessFeedback(null);
    setAttempts(0);
    setAudioError(null);
    setCurrentSong(null);
    setAudioReady(false);
    setCopyError(false);
    setCopied(false);
    setShowSurrenderDialog(false);
    setShowResultDialog(false);
    setHighScore(getInfiniteHighScore(p));

    if (mode === 'daily') {
      const state = loadDailyState(getDateKey());
      setDailyState(state);
      if (!isPoolCompleted(state, p)) {
        void initDailySong(p);
      } else {
        setCurrentSong(null);
        setAudioReady(false);
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
    void initInfiniteSong(pool, new Set());
  };

  const handleCopyShare = async () => {
    const text = buildShareText(mode, pool, completedResult, score);
    try {
      await navigator.clipboard.writeText(text);
      setCopyError(false);
      setCopied(true);
      schedule(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  };

  const showPlayArea =
    !poolDone && !infiniteOver && roundStatus === 'playing' && !revealSong;

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="screen-shell flex-1 flex flex-col justify-start md:justify-center">
        <div className="hidden lg:flex justify-center mb-5">
          <button
            type="button"
            onClick={onHome}
            className="group flex items-center gap-3 rounded-full px-4 py-2 text-left transition-colors hover:bg-white/5"
            aria-label="Volver al menú principal"
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
        <div className="screen-panel w-full max-w-3xl mx-auto flex flex-col gap-5 sm:gap-6 md:gap-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onHome}
              className="text-neutral-400 hover:text-white text-sm sm:text-base transition-colors"
            >
              ← Inicio
            </button>
            <span className="text-xs sm:text-sm text-neutral-500 uppercase tracking-wider">
              {mode === 'daily' ? 'Diario' : 'Infinito'}
            </span>
            {mode === 'infinite' && !infiniteOver && (
              <div
                className="flex items-center gap-1"
                aria-label={`${lives} ${lives === 1 ? 'vida restante' : 'vidas restantes'}`}
              >
                {Array.from({ length: INFINITE_LIVES }).map((_, i) => (
                  <span key={i} aria-hidden="true">
                    <HeartIcon filled={i < lives} color={accent} />
                  </span>
                ))}
              </div>
            )}
            {mode === 'infinite' && infiniteOver && (
              <span className="text-sm sm:text-base font-mono" style={{ color: accent }}>
                {score} pts
              </span>
            )}
            {mode === 'daily' && <div className="w-14 sm:w-16" />}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-2.5">
            {POOLS.map((p) => {
              const status = mode === 'daily' ? getPoolStatus(dailyState, p) : 'pending';
              const done = status !== 'pending';
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
                  className="min-h-14 px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all disabled:opacity-30"
                  style={{
                    backgroundColor: active ? `${color}25` : '#1A1A1A',
                    color: active ? color : statusColor ?? '#888',
                    border: `2px solid ${active ? color : statusColor ?? '#333'}`,
                  }}
                  aria-pressed={active}
                  aria-label={`${POOL_LABELS[p]}: ${
                    status === 'won' ? 'acertada' : status === 'lost' ? 'fallada' : 'pendiente'
                  }`}
                >
                  <span className="block">{POOL_LABELS[p]}</span>
                  {done && (
                    <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide">
                      {status === 'won' ? '✓ Acertada' : '✕ Fallada'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {mode === 'daily' && (
            <p className="text-center text-xs sm:text-sm text-neutral-500" aria-live="polite">
              {dailyCompletedCount}/5 completadas · {dailyWonCount}{' '}
              {dailyWonCount === 1 ? 'acertada' : 'acertadas'}
            </p>
          )}

          {mode === 'infinite' && !infiniteOver && (
            <div className="text-center">
              <span className="font-mono text-2xl sm:text-3xl font-semibold" style={{ color: accent }}>
                {score}
              </span>
              <span className="text-neutral-500 text-sm sm:text-base ml-2">canciones</span>
              {highScore > 0 && (
                <span className="text-neutral-600 text-xs sm:text-sm ml-3">récord: {highScore}</span>
              )}
            </div>
          )}

          {showPlayArea && (
            <div className="relative px-1">
              <div
                className="h-2.5 sm:h-3 bg-black/60 border border-neutral-800 rounded-full overflow-hidden shadow-inner"
                role="progressbar"
                aria-label="Progreso del fragmento de audio"
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
                    className="absolute top-1/2 w-0.5 h-4 sm:h-5 rounded-full -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${(mark / MAX_CLIP_DURATION) * 100}%`,
                      backgroundColor: i === segmentIndex ? accent : '#444',
                      opacity: i === segmentIndex ? 1 : 0.5,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {showPlayArea && (
            <>
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-4 sm:gap-6">
                  <button
                    type="button"
                    onClick={handlePlay}
                    disabled={!audioReady || loading}
                    className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                    style={{
                      backgroundColor: accent,
                      color: '#0E0E0E',
                      boxShadow: `0 0 40px ${accent}40`,
                    }}
                    aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                  >
                    {loading ? (
                      <span className="w-8 h-8 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                    ) : isPlaying ? (
                      <PauseIcon />
                    ) : (
                      <PlayIcon />
                    )}
                  </button>
                  <span
                    className="font-mono text-3xl sm:text-4xl md:text-5xl font-semibold tabular-nums"
                    style={{ color: accent }}
                  >
                    {currentDuration}s
                  </span>
                </div>
                {audioError && !loading && (
                  <div
                    role="alert"
                    className="flex max-w-md flex-col items-center gap-2 text-center"
                  >
                    <p className="text-neutral-400 text-xs sm:text-sm">{audioError}</p>
                    <button
                      type="button"
                      onClick={handleRetryAudio}
                      className="rounded-full border border-neutral-600 px-4 py-2 text-xs font-medium text-white hover:border-neutral-400"
                    >
                      Reintentar
                    </button>
                  </div>
                )}
                {!audioReady && !loading && !audioError && (
                  <p className="text-neutral-500 text-xs sm:text-sm">Preview no disponible</p>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleGuess();
                }}
                className="flex flex-col gap-2 sm:gap-3"
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
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="submit"
                    disabled={!query.trim() || guessFeedback !== null}
                    className="px-5 sm:px-6 py-3 sm:py-3.5 rounded-full font-semibold text-bg text-sm sm:text-base transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: accent }}
                  >
                    Adivinar
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={guessFeedback !== null}
                    className="px-5 sm:px-6 py-3 sm:py-3.5 rounded-full bg-surface border border-neutral-700 text-neutral-300 text-sm sm:text-base font-medium hover:border-neutral-500 transition-colors disabled:opacity-40"
                  >
                    {mode === 'daily' && segmentIndex >= CLIP_MARKS.length - 1
                      ? 'Rendirse'
                      : 'Saltar'}
                  </button>
                </div>
              </form>

              <GuessFeedback
                id={feedbackId}
                kind={guessFeedback?.kind ?? null}
                message={guessFeedback?.message ?? ''}
              />
              {mode === 'daily' && attempts > 0 && (
                <p className="text-center text-xs text-neutral-500">
                  {attempts} {attempts === 1 ? 'intento' : 'intentos'} · sin límite
                </p>
              )}
            </>
          )}

          {revealSong && currentSong && mode === 'infinite' && (
            <div className="flex flex-col items-center gap-2 py-8 sm:py-12">
              <p className="text-neutral-400 text-sm sm:text-base">Era...</p>
              <p className="text-lg sm:text-xl font-semibold text-white">{currentSong.title}</p>
              <p className="text-neutral-400 sm:text-lg">{currentSong.artist}</p>
            </div>
          )}

          {mode === 'daily' && (poolDone || roundStatus !== 'playing') && (
            <div className="flex flex-col items-center gap-4 py-4 sm:py-6">
              {(currentSong || completedResult) && (
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-semibold text-white">
                    {currentSong?.title ?? completedResult?.songTitle}
                  </p>
                  <p className="text-neutral-400 sm:text-lg">
                    {currentSong?.artist ?? completedResult?.songArtist}
                  </p>
                </div>
              )}
              <p
                className="text-xl sm:text-2xl font-bold"
                style={{
                  color: (completedResult?.won ?? roundStatus === 'won') ? accent : '#FF453A',
                }}
              >
                {(completedResult?.won ?? roundStatus === 'won')
                  ? `✓ Diaria ${POOL_LABELS[pool]} acertada`
                  : `✕ Diaria ${POOL_LABELS[pool]} fallada`}
              </p>
              <ShareCard
                mode={mode}
                pool={pool}
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
                      }
                    : undefined)
                }
                onCopy={() => void handleCopyShare()}
                copied={copied}
              />
              {copyError && (
                <p role="alert" className="text-expert text-xs sm:text-sm text-center">
                  No se pudo copiar. Revisá los permisos del navegador.
                </p>
              )}
              <p className="text-neutral-500 text-xs sm:text-sm text-center">
                Elegí otra dificultad para seguir jugando hoy.
              </p>
            </div>
          )}

          {infiniteOver && (
            <div className="flex flex-col items-center gap-4 py-4 sm:py-6">
              {currentSong && roundStatus === 'lost' && (
                <div className="text-center mb-2">
                  <p className="text-lg sm:text-xl font-semibold text-white">{currentSong.title}</p>
                  <p className="text-neutral-400 sm:text-lg">{currentSong.artist}</p>
                </div>
              )}
              <p className="text-2xl sm:text-3xl font-bold" style={{ color: accent }}>
                Game Over
              </p>
              <p className="font-mono text-4xl sm:text-5xl font-bold" style={{ color: accent }}>
                {score}
              </p>
              <p className="text-neutral-400 text-sm sm:text-base">canciones adivinadas</p>
              {score >= highScore && score > 0 && (
                <p className="text-easy text-xs sm:text-sm">¡Nuevo récord!</p>
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
                  No se pudo copiar. Revisá los permisos del navegador.
                </p>
              )}
              <button
                type="button"
                onClick={handleInfiniteRestart}
                className="w-full py-4 sm:py-5 rounded-full font-semibold text-bg text-base sm:text-lg transition-colors mt-2"
                style={{ backgroundColor: accent }}
              >
                Jugar de nuevo
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
        onClose={() => setShowResultDialog(false)}
      />
    </div>
  );
}
