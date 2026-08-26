import { useTranslation } from 'react-i18next';
import { setLanguage, type AppLanguage } from '../i18n';
import { analytics } from '../lib/analytics';

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const activeLanguage: AppLanguage = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'es';

  return (
    <div
      className="inline-flex rounded-full border border-neutral-700 bg-black/30 p-1"
      role="group"
      aria-label={t('language.label')}
    >
      {(['es', 'en'] as const).map((language) => (
        <button
          key={language}
          type="button"
          onClick={() => {
            if (language === activeLanguage) return;
            analytics.uiLanguageChanged({ from: activeLanguage, to: language });
            analytics.setContext({ ui_language: language });
            void setLanguage(language);
          }}
          aria-pressed={activeLanguage === language}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            activeLanguage === language
              ? 'bg-white text-bg'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {language.toUpperCase()}
          <span className="sr-only">
            {' '}
            {language === 'es' ? t('language.spanish') : t('language.english')}
          </span>
        </button>
      ))}
    </div>
  );
}
