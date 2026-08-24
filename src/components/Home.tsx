import { useEffect, useState } from 'react';
import type { GameMode } from '../types';
import { POOLS, POOL_LABELS } from '../types';
import { getDateKey } from '../lib/daily';
import { getPoolStatus, loadDailyState } from '../lib/storage';

interface HomeProps {
  onSelect: (mode: GameMode) => void;
}

export default function Home({ onSelect }: HomeProps) {
  const [dateKey, setDateKey] = useState(getDateKey);
  useEffect(() => {
    const interval = window.setInterval(() => setDateKey(getDateKey()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const dailyState = loadDailyState(dateKey);
  const dailyCompleted = POOLS.filter(
    (pool) => getPoolStatus(dailyState, pool) !== 'pending',
  ).length;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center">
      <div className="screen-shell flex flex-col items-center justify-center">
        <div className="screen-panel w-full max-w-md mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-2">
              <span className="text-easy">Beat</span>
              <span className="text-white">Guesser</span>
            </h1>
            <p className="text-neutral-400 text-sm sm:text-base">
              ¿Cuánto necesitás escuchar?
            </p>
          </div>

          <div className="w-full flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => onSelect('daily')}
              className="w-full py-3.5 px-5 rounded-2xl bg-white/5 border border-easy/80 text-easy font-semibold text-base hover:bg-easy/10 transition-colors active:scale-[0.98]"
            >
              <span className="block">Diario</span>
              <span className="mt-1.5 flex items-center justify-center gap-1.5" aria-hidden="true">
                {POOLS.map((pool) => {
                  const status = getPoolStatus(dailyState, pool);
                  return (
                    <span
                      key={pool}
                      title={`${POOL_LABELS[pool]}: ${
                        status === 'won' ? 'acertada' : status === 'lost' ? 'fallada' : 'pendiente'
                      }`}
                      className={`grid h-4 w-4 place-items-center rounded-full border text-[9px] ${
                        status === 'won'
                          ? 'border-easy/60 bg-easy/15 text-easy'
                          : status === 'lost'
                            ? 'border-expert/60 bg-expert/15 text-expert'
                            : 'border-neutral-600 text-neutral-500'
                      }`}
                    >
                      {status === 'won' ? '✓' : status === 'lost' ? '✕' : '·'}
                    </span>
                  );
                })}
              </span>
              <span className="sr-only">{dailyCompleted} de 5 dificultades completadas hoy.</span>
            </button>
            <button
              type="button"
              onClick={() => onSelect('infinite')}
              className="w-full h-12 px-5 rounded-2xl bg-white/5 border border-impossible/80 text-impossible font-semibold text-base hover:bg-impossible/10 transition-colors active:scale-[0.98]"
            >
              Infinito
            </button>
          </div>

          <p className="mt-8 md:mt-10 text-neutral-500 text-xs sm:text-sm text-center leading-relaxed max-w-sm mx-auto">
            Escuchá fragmentos cada vez más largos e intentá adivinar la canción antes de que se
            acabe el tiempo.
          </p>
        </div>
      </div>
    </div>
  );
}
