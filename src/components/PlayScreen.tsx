import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyResult, DailyState, GameMode, Pool, Song } from '../types';
import {
  CLIP_MARKS,
  INFINITE_LIVES,
  POOLS,
  POOL_COLORS,
  POOL_LABELS,
} from '../types';
import { AudioClipper } from '../lib/clip';
import { resolveSongPreview } from '../lib/catalog';
import { getDateKey, resolveDailySong } from '../lib/daily';
import { pickRandomSong } from '../lib/infinite';
import { isCorrectGuess, searchSongs } from '../lib/search';
import {
  getInfiniteHighScore,
  isPoolCompleted,
  loadDailyState,
  saveDailyResult,
  saveInfiniteHighScore,
} from '../lib/storage';
import ShareCard, { buildShareText } from './ShareCard';

interface PlayScreenProps {
  mode: GameMode;
  onHome: () => void;
}

type RoundStatus = 'playing' | 'won' | 'lost';

function HeartIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="2">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="8,5 8,19 19,12" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}

export default function PlayScreen({ mode, onHome }: PlayScreenProps) {
  const [pool, setPool] = useState<Pool>('easy');
  const [dailyState, setDailyState] = useState<DailyState>(() => loadDailyState(getDateKey()));
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [roundStatus, setRoundStatus] = useState<RoundStatus>('playing');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Song[]>([]);
  const [guessFeedback, setGuessFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [lives, setLives] = useState(INFINITE_LIVES);
  const [score, setScore] = useState(0);
  const [usedIds, setUsedIds] = useState<Set<string>>(() => new Set());
  const [infiniteOver, setInfiniteOver] = useState(false);
  const [poolLocked, setPoolLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highScore, setHighScore] = useState(() => getInfiniteHighScore('easy'));
  const [revealSong, setRevealSong] = useState(false);

  const clipperRef = useRef<AudioClipper>(new AudioClipper());
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accent = POOL_COLORS[pool];
  const currentDuration = CLIP_MARKS[segmentIndex];
  const isAutocompletePool = pool === 'easy' || pool === 'medium';
  const poolDone = mode === 'daily' && isPoolCompleted(dailyState, pool);
  const completedResult = dailyState.results[pool];

  const stopPlaybackPoll = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  const pollPlaying = useCallback(() => {
    stopPlaybackPoll();
    playIntervalRef.current = setInterval(() => {
      const playing = clipperRef.current.isPlaying();
      setIsPlaying(playing);
      if (!playing) stopPlaybackPoll();
    }, 100);
  }, [stopPlaybackPoll]);

  const loadSong = useCallback(async (song: Song) => {
    setLoading(true);
    setAudioReady(false);
    setGuessFeedback(null);
    clipperRef.current.stop();

    const resolved = await resolveSongPreview(song);
    setCurrentSong(resolved);

    if (resolved.previewUrl) {
      try {
        await clipperRef.current.load(resolved.previewUrl);
        setAudioReady(true);
      } catch {
        setAudioReady(false);
      }
    } else {
      setAudioReady(false);
    }
    setLoading(false);
  }, []);

  const initDailySong = useCallback(
    async (p: Pool) => {
      const song = await resolveDailySong(p, getDateKey());
      setSegmentIndex(0);
      setRoundStatus('playing');
      setQuery('');
      setSuggestions([]);
      await loadSong(song);
    },
    [loadSong],
  );

  const initInfiniteSong = useCallback(
    async (p: Pool, used: Set<string>) => {
      const song = pickRandomSong(p, used);
      if (!song) {
        setInfiniteOver(true);
        return;
      }
      setSegmentIndex(0);
      setRoundStatus('playing');
      setQuery('');
      setSuggestions([]);
      await loadSong(song);
    },
    [loadSong],
  );

  useEffect(() => {
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

    const clipper = clipperRef.current;
    return () => {
      clipper.destroy();
      stopPlaybackPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAutocompletePool && query.trim().length > 0 && roundStatus === 'playing') {
      setSuggestions(searchSongs(query, 6));
    } else {
      setSuggestions([]);
    }
  }, [query, isAutocompletePool, roundStatus]);

  const handlePlay = () => {
    if (!audioReady || roundStatus !== 'playing') return;
    if (mode === 'infinite') setPoolLocked(true);
    if (isPlaying) {
      clipperRef.current.stop();
      setIsPlaying(false);
      stopPlaybackPoll();
    } else {
      clipperRef.current.play(currentDuration);
      setIsPlaying(true);
      pollPlaying();
    }
  };

  const finishRound = useCallback(
    (won: boolean) => {
      clipperRef.current.stop();
      setIsPlaying(false);
      stopPlaybackPoll();
      setRoundStatus(won ? 'won' : 'lost');
      setSuggestions([]);

      if (mode === 'daily' && currentSong) {
        const result: DailyResult = {
          pool,
          won,
          segmentsUsed: segmentIndex + 1,
          maxSegment: segmentIndex,
          songId: currentSong.id,
          songTitle: currentSong.title,
          songArtist: currentSong.artist,
        };
        setDailyState(saveDailyResult(getDateKey(), result));
      }
    },
    [mode, currentSong, pool, segmentIndex, stopPlaybackPoll],
  );

  const handleFail = useCallback(() => {
    clipperRef.current.stop();
    setIsPlaying(false);
    stopPlaybackPoll();

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
        setTimeout(() => {
          setRevealSong(false);
          setSegmentIndex(0);
          setRoundStatus('playing');
          setQuery('');
          setGuessFeedback(null);
          void initInfiniteSong(pool, nextUsed);
        }, 1800);
      }
    } else {
      finishRound(false);
    }
  }, [mode, lives, currentSong, finishRound, pool, score, usedIds, initInfiniteSong, stopPlaybackPoll]);

  const advanceSegment = useCallback(() => {
    const isLast = segmentIndex >= CLIP_MARKS.length - 1;
    if (isLast) {
      handleFail();
      return;
    }
    clipperRef.current.stop();
    setIsPlaying(false);
    stopPlaybackPoll();
    setSegmentIndex((i) => i + 1);
    setGuessFeedback(null);
  }, [segmentIndex, handleFail, stopPlaybackPoll]);

  const handleSkip = () => {
    if (roundStatus !== 'playing') return;
    if (mode === 'infinite') setPoolLocked(true);
    advanceSegment();
  };

  const handleGuess = (guessText?: string) => {
    if (roundStatus !== 'playing' || !currentSong) return;

    const text = (guessText ?? query).trim();
    if (!text) return;

    if (mode === 'infinite') setPoolLocked(true);
    clipperRef.current.stop();
    setIsPlaying(false);
    stopPlaybackPoll();
    setSuggestions([]);

    if (isCorrectGuess(text, currentSong)) {
      setGuessFeedback('correct');
      if (mode === 'infinite') {
        const nextUsed = new Set(usedIds);
        nextUsed.add(currentSong.id);
        setScore((s) => s + 1);
        setUsedIds(nextUsed);
        setTimeout(() => {
          setGuessFeedback(null);
          setSegmentIndex(0);
          setQuery('');
          void initInfiniteSong(pool, nextUsed);
        }, 1200);
      } else {
        finishRound(true);
      }
    } else {
      setGuessFeedback('wrong');
      setTimeout(() => advanceSegment(), 600);
    }
  };

  const handlePoolChange = (p: Pool) => {
    if (mode === 'infinite' && poolLocked) return;
    if (p === pool) return;

    clipperRef.current.stop();
    setIsPlaying(false);
    stopPlaybackPoll();
    setPool(p);
    setSegmentIndex(0);
    setRoundStatus('playing');
    setQuery('');
    setGuessFeedback(null);
    setHighScore(getInfiniteHighScore(p));

    if (mode === 'daily') {
      const state = loadDailyState(getDateKey());
      setDailyState(state);
      if (!isPoolCompleted(state, p)) {
        void initDailySong(p);
      } else {
        setCurrentSong(null);
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const showPlayArea =
    !poolDone && !infiniteOver && roundStatus === 'playing' && !revealSong;

  return (
    <div className="min-h-full flex flex-col max-w-[430px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={onHome}
          className="text-neutral-400 hover:text-white text-sm transition-colors"
        >
          ← Inicio
        </button>
        <span className="text-xs text-neutral-500 uppercase tracking-wider">
          {mode === 'daily' ? 'Diario' : 'Infinito'}
        </span>
        {mode === 'infinite' && !infiniteOver && (
          <div className="flex items-center gap-1">
            {Array.from({ length: INFINITE_LIVES }).map((_, i) => (
              <HeartIcon key={i} filled={i < lives} color={accent} />
            ))}
          </div>
        )}
        {mode === 'infinite' && infiniteOver && (
          <span className="text-sm font-mono" style={{ color: accent }}>
            {score} pts
          </span>
        )}
        {mode === 'daily' && <div className="w-16" />}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {POOLS.map((p) => {
          const done = mode === 'daily' && isPoolCompleted(dailyState, p);
          const locked = mode === 'infinite' && poolLocked && p !== pool;
          const active = p === pool;
          const color = POOL_COLORS[p];

          return (
            <button
              key={p}
              type="button"
              disabled={locked}
              onClick={() => handlePoolChange(p)}
              className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all disabled:opacity-30"
              style={{
                backgroundColor: active ? `${color}25` : '#1A1A1A',
                color: done ? '#666' : active ? color : '#888',
                border: `2px solid ${active ? color : '#333'}`,
                textDecoration: done ? 'line-through' : 'none',
              }}
            >
              {POOL_LABELS[p]}
              {done ? ' ✓' : ''}
            </button>
          );
        })}
      </div>

      {mode === 'infinite' && !infiniteOver && (
        <div className="text-center mb-4">
          <span className="font-mono text-2xl font-semibold" style={{ color: accent }}>
            {score}
          </span>
          <span className="text-neutral-500 text-sm ml-2">canciones</span>
          {highScore > 0 && (
            <span className="text-neutral-600 text-xs ml-3">récord: {highScore}</span>
          )}
        </div>
      )}

      {showPlayArea && (
        <div className="relative mb-8 px-1">
          <div className="h-2 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${((segmentIndex + 1) / CLIP_MARKS.length) * 100}%`,
                backgroundColor: accent,
              }}
            />
          </div>
          <div className="absolute inset-0 flex justify-between items-center pointer-events-none">
            {CLIP_MARKS.map((mark, i) => (
              <div
                key={mark}
                className="w-0.5 h-4 rounded-full"
                style={{
                  backgroundColor: i <= segmentIndex ? accent : '#444',
                  opacity: i <= segmentIndex ? 1 : 0.5,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showPlayArea && (
        <>
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handlePlay}
                disabled={!audioReady || loading}
                className="w-24 h-24 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
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
              <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color: accent }}>
                {currentDuration}s
              </span>
            </div>
            {!audioReady && !loading && (
              <p className="text-neutral-500 text-xs mt-3">Preview no disponible</p>
            )}
          </div>

          <div className="relative mb-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleGuess();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="¿Qué canción es?"
                className="flex-1 bg-surface border border-neutral-700 rounded-full px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleSkip}
                className="shrink-0 px-5 py-3 rounded-full bg-surface border border-neutral-700 text-neutral-300 text-sm font-medium hover:border-neutral-500 transition-colors"
              >
                Saltar
              </button>
            </form>

            {isAutocompletePool && suggestions.length > 0 && roundStatus === 'playing' && (
              <ul className="absolute z-10 top-full left-0 right-14 mt-1 bg-surface border border-neutral-700 rounded-2xl overflow-hidden shadow-xl">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-800 transition-colors"
                      onClick={() => handleGuess(`${s.title} ${s.artist}`)}
                    >
                      <span className="text-white">{s.title}</span>
                      <span className="text-neutral-500 ml-2">{s.artist}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {guessFeedback === 'wrong' && (
            <p className="text-center text-expert text-sm font-medium">Incorrecto</p>
          )}
          {guessFeedback === 'correct' && (
            <p className="text-center text-easy text-sm font-medium">¡Correcto!</p>
          )}
        </>
      )}

      {revealSong && currentSong && mode === 'infinite' && (
        <div className="flex flex-col items-center gap-2 py-12">
          <p className="text-neutral-400 text-sm">Era...</p>
          <p className="text-lg font-semibold text-white">{currentSong.title}</p>
          <p className="text-neutral-400">{currentSong.artist}</p>
        </div>
      )}

      {mode === 'daily' && (poolDone || roundStatus !== 'playing') && (
        <div className="flex flex-col items-center gap-4 py-8">
          {(currentSong || completedResult) && (
            <div className="text-center">
              <p className="text-lg font-semibold text-white">
                {currentSong?.title ?? completedResult?.songTitle}
              </p>
              <p className="text-neutral-400">
                {currentSong?.artist ?? completedResult?.songArtist}
              </p>
            </div>
          )}
          <p
            className="text-xl font-bold"
            style={{
              color: (completedResult?.won ?? roundStatus === 'won') ? accent : '#FF453A',
            }}
          >
            {(completedResult?.won ?? roundStatus === 'won') ? '¡Ganaste!' : 'Perdiste'}
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
          <p className="text-neutral-500 text-xs text-center">
            Elegí otra dificultad para seguir jugando hoy.
          </p>
        </div>
      )}

      {infiniteOver && (
        <div className="flex flex-col items-center gap-4 py-8">
          {currentSong && roundStatus === 'lost' && (
            <div className="text-center mb-2">
              <p className="text-lg font-semibold text-white">{currentSong.title}</p>
              <p className="text-neutral-400">{currentSong.artist}</p>
            </div>
          )}
          <p className="text-2xl font-bold" style={{ color: accent }}>
            Game Over
          </p>
          <p className="font-mono text-4xl font-bold" style={{ color: accent }}>
            {score}
          </p>
          <p className="text-neutral-400 text-sm">canciones adivinadas</p>
          {score >= highScore && score > 0 && (
            <p className="text-easy text-xs">¡Nuevo récord!</p>
          )}
          <ShareCard
            mode={mode}
            pool={pool}
            score={score}
            onCopy={() => void handleCopyShare()}
            copied={copied}
          />
          <button
            type="button"
            onClick={handleInfiniteRestart}
            className="w-full py-4 rounded-full font-semibold text-bg transition-colors mt-2"
            style={{ backgroundColor: accent }}
          >
            Jugar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
