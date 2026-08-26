import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameMode, LangMode } from '../types';
import { LANG_EMOJI, LANG_I18N_KEYS, LANG_MODES, POOLS } from '../types';
import { getDateKey } from '../lib/daily';
import { analytics } from '../lib/analytics';
import {
  getPoolStatus,
  getVisibleStreak,
  loadDailyState,
  loadPreferredLangMode,
} from '../lib/storage';
import LanguageSwitcher from './LanguageSwitcher';
import StreakBadge from './StreakBadge';

interface HomeProps {
  onSelect: (mode: GameMode, lang: LangMode) => void;
}

export default function Home({ onSelect }: HomeProps) {
  const { t, i18n } = useTranslation();
  const [dateKey, setDateKey] = useState(getDateKey);
  const preferredLang = loadPreferredLangMode();
  useEffect(() => {
    const interval = window.setInterval(() => setDateKey(getDateKey()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    analytics.setContext({
      lang: preferredLang,
      ui_language: i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'es',
    });
  }, [i18n.resolvedLanguage, preferredLang]);

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
            <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 font-medium px-1">
              {t('common.daily')}
            </p>
            {LANG_MODES.map((lang) => {
              const dailyState = loadDailyState(dateKey, lang);
              const dailyCompleted = POOLS.filter(
                (pool) => getPoolStatus(dailyState, pool) !== 'pending',
              ).length;
              const streak = getVisibleStreak(dateKey, lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onSelect('daily', lang)}
                  className="w-full py-3.5 px-5 rounded-2xl bg-white/5 border border-easy/80 text-left hover:bg-easy/10 transition-colors active:scale-[0.98]"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-easy font-semibold text-base">
                      <span aria-hidden="true">{LANG_EMOJI[lang]} </span>
                      {t(LANG_I18N_KEYS[lang])}
                    </span>
                    {streak.current > 0 && <StreakBadge count={streak.current} />}
                  </span>
                  <span className="mt-1 block text-xs font-medium text-neutral-400">
                    {t('home.boardProgress', { count: dailyCompleted })}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onSelect('infinite', preferredLang)}
              className="w-full py-3.5 px-5 rounded-2xl bg-white/5 border border-impossible/80 text-impossible font-semibold text-base hover:bg-impossible/10 transition-colors active:scale-[0.98] mt-1"
            >
              <span className="block">{t('common.infinite')}</span>
              <span className="mt-1 block text-xs font-medium text-neutral-400">
                {t('home.infiniteBoard', { board: t(LANG_I18N_KEYS[preferredLang]) })}
              </span>
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
