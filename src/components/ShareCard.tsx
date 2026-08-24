import { useTranslation } from 'react-i18next';
import type { GameMode, Pool, DailyResult } from '../types';
import { POOL_I18N_KEYS, POOL_EMOJI, POOL_COLORS, CLIP_MARKS } from '../types';
import { getDateKey } from '../lib/daily';
import i18n from '../i18n';

interface ShareCardProps {
  mode: GameMode;
  pool: Pool;
  result?: DailyResult;
  score?: number;
  onCopy: () => void;
  copied: boolean;
}

export default function ShareCard({ mode, pool, result, score, onCopy, copied }: ShareCardProps) {
  const { t } = useTranslation();
  const shareText = buildShareText(mode, pool, result, score);

  return (
    <div className="w-full bg-white/5 rounded-2xl p-4 border border-neutral-800">
      <pre className="font-mono text-sm text-neutral-300 whitespace-pre-wrap mb-3">
        {shareText}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="w-full h-10 rounded-xl text-sm font-semibold transition-colors"
        style={{
          backgroundColor: `${POOL_COLORS[pool]}20`,
          color: POOL_COLORS[pool],
          border: `1px solid ${POOL_COLORS[pool]}40`,
        }}
      >
        {copied ? t('share.copied') : t('share.copyResult')}
      </button>
    </div>
  );
}

export function buildShareText(mode: GameMode, pool: Pool, result?: DailyResult, score?: number): string {
  const dateKey = getDateKey();
  const maxMark = result ? CLIP_MARKS[result.maxSegment] ?? CLIP_MARKS[CLIP_MARKS.length - 1] : CLIP_MARKS[0];

  if (mode === 'daily' && result) {
    const outcome = result.won ? `✅ ${maxMark}s` : '❌';
    const attempts =
      result.won && result.attempts
        ? ` · ${i18n.t('share.attempt', { count: result.attempts })}`
        : '';
    return `BeatGuesser #${dateKey}\n${i18n.t(POOL_I18N_KEYS[pool])} ${POOL_EMOJI[pool]} ${outcome}${attempts}`;
  }
  const songCount = score ?? 0;
  return `${i18n.t('share.infiniteTitle')}\n${i18n.t(POOL_I18N_KEYS[pool])} ${POOL_EMOJI[pool]} — ${i18n.t('share.songs', { count: songCount })}`;
}
