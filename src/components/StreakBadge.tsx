import { useTranslation } from 'react-i18next';

interface StreakBadgeProps {
  count: number;
  className?: string;
}

export default function StreakBadge({ count, className = '' }: StreakBadgeProps) {
  const { t } = useTranslation();
  if (count <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-400/15 px-2.5 py-1 text-[11px] font-semibold text-orange-300 ${className}`}
      aria-label={t('game.streakLabel', { count })}
    >
      <span aria-hidden="true">🔥</span>
      {count}
    </span>
  );
}
