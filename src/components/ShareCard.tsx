import type { GameMode, Pool, DailyResult } from '../types';
import { POOL_LABELS, POOL_EMOJI, POOL_COLORS, CLIP_MARKS } from '../types';
import { getDateKey } from '../lib/daily';

interface ShareCardProps {
  mode: GameMode;
  pool: Pool;
  result?: DailyResult;
  score?: number;
  onCopy: () => void;
  copied: boolean;
}

export default function ShareCard({ mode, pool, result, score, onCopy, copied }: ShareCardProps) {
  const shareText = buildShareText(mode, pool, result, score);

  return (
    <div className="w-full bg-surface rounded-2xl p-4 sm:p-5 border border-neutral-800">
      <pre className="font-mono text-sm sm:text-base text-neutral-300 whitespace-pre-wrap mb-3">
        {shareText}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="w-full py-2.5 sm:py-3 rounded-full text-sm sm:text-base font-semibold transition-colors"
        style={{
          backgroundColor: `${POOL_COLORS[pool]}20`,
          color: POOL_COLORS[pool],
          border: `1px solid ${POOL_COLORS[pool]}40`,
        }}
      >
        {copied ? '¡Copiado!' : 'Copiar resultado'}
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
        ? ` · ${result.attempts} ${result.attempts === 1 ? 'intento' : 'intentos'}`
        : '';
    return `BeatGuesser #${dateKey}\n${POOL_LABELS[pool]} ${POOL_EMOJI[pool]} ${outcome}${attempts}`;
  }
  return `BeatGuesser Infinito\n${POOL_LABELS[pool]} ${POOL_EMOJI[pool]} — ${score ?? 0} canciones`;
}
