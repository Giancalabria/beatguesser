import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameMode } from '../types';
import { POOLS } from '../types';
import { getDateKey } from '../lib/daily';
import { getPoolStatus, loadDailyState } from '../lib/storage';
import LanguageSwitcher from './LanguageSwitcher';

interface HomeProps {
  onSelect: (mode: GameMode) => void;
}

export default function Home({ onSelect }: HomeProps) {
  const { t } = useTranslation();
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
    <div className="relative min-h-dvh flex flex-col items-center justify-center">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LanguageSwitcher />
      </div>
      <div className="screen-shell flex flex-col items-center justify-center">
        <div className="screen-panel w-full max-w-md mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-2">
              <span className="text-easy">Beat</span>
              <span className="text-white">Guesser</span>
            </h1>
            <p className="text-neutral-400 text-sm sm:text-base">
              {t('home.tagline')}
            </p>
          </div>

          <div className="w-full flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => onSelect('daily')}
              className="w-full py-3.5 px-5 rounded-2xl bg-white/5 border border-easy/80 text-easy font-semibold text-base hover:bg-easy/10 transition-colors active:scale-[0.98]"
            >
              <span className="block">{t('common.daily')}</span>
              <span className="mt-1 block text-xs font-medium text-neutral-400">
                {t('home.dailyProgress', { count: dailyCompleted })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onSelect('infinite')}
              className="w-full h-12 px-5 rounded-2xl bg-white/5 border border-impossible/80 text-impossible font-semibold text-base hover:bg-impossible/10 transition-colors active:scale-[0.98]"
            >
              {t('common.infinite')}
            </button>
          </div>

          <p className="mt-8 md:mt-10 text-neutral-500 text-xs sm:text-sm text-center leading-relaxed max-w-sm mx-auto">
            {t('home.instructions')}
          </p>
        </div>
      </div>
    </div>
  );
}
