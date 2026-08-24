import { useTranslation } from 'react-i18next';
import type { DailyResult, GameMode, Pool } from '../types';
import { CLIP_MARKS, POOL_COLORS, POOL_EMOJI, POOL_I18N_KEYS } from '../types';
import { getDateKey } from '../lib/daily';
import { isPerfectWin } from '../lib/storage';
import i18n from '../i18n';

interface ShareCardProps {
  mode: GameMode;
  pool: Pool;
  result?: DailyResult;
  score?: number;
  streak?: number;
  perfectDay?: boolean;
  onCopy: () => void;
  copied: boolean;
}

interface ShareExtras {
  streak?: number;
  perfectDay?: boolean;
}

export default function ShareCard({
  mode,
  pool,
  result,
  score,
  streak,
  perfectDay,
  onCopy,
  copied,
}: ShareCardProps) {
  const { t } = useTranslation();
  const shareText = buildShareText(mode, pool, result, score, undefined, { streak, perfectDay });

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

export function getShareUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URL('/', window.location.href).toString();
}

export function buildShareMessage(
  mode: GameMode,
  pool: Pool,
  result?: DailyResult,
  score?: number,
  extras: ShareExtras = {},
): string {
  const dateKey = getDateKey();
  const maxMark = result ? CLIP_MARKS[result.maxSegment] ?? CLIP_MARKS[CLIP_MARKS.length - 1] : CLIP_MARKS[0];

  if (mode === 'daily' && result) {
    const outcome = result.won
      ? isPerfectWin(result)
        ? `🌟 ${i18n.t('share.perfect')} · ${maxMark}s`
        : `✅ ${maxMark}s`
      : '❌';
    const attempts =
      result.won && result.attempts
        ? ` · ${i18n.t('share.attempt', { count: result.attempts })}`
        : '';
    const lines = [
      i18n.t('share.dailyChallenge'),
      `BeatGuesser #${dateKey}`,
      `${i18n.t(POOL_I18N_KEYS[pool])} ${POOL_EMOJI[pool]} ${outcome}${attempts}`,
    ];
    if (extras.perfectDay) lines.push(`🌟 ${i18n.t('share.perfectDay')}`);
    if (extras.streak && extras.streak > 0) lines.push(i18n.t('share.streak', { count: extras.streak }));
    return lines.join('\n');
  }
  const songCount = score ?? 0;
  return `${i18n.t('share.infiniteChallenge')}\n${i18n.t('share.infiniteTitle')}\n${i18n.t(POOL_I18N_KEYS[pool])} ${POOL_EMOJI[pool]} — ${i18n.t('share.songs', { count: songCount })}`;
}

export function buildShareText(
  mode: GameMode,
  pool: Pool,
  result?: DailyResult,
  score?: number,
  shareUrl = getShareUrl(),
  extras: ShareExtras = {},
): string {
  const message = buildShareMessage(mode, pool, result, score, extras);
  return shareUrl ? `${message}\n${shareUrl}` : message;
}
