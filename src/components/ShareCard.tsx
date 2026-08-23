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
  const dateKey = getDateKey();
  const maxMark = result ? CLIP_MARKS[result.maxSegment] ?? CLIP_MARKS[CLIP_MARKS.length - 1] : CLIP_MARKS[0];

  const shareText =
    mode === 'daily' && result
      ? `BeatGuesser #${dateKey}\n${POOL_LABELS[pool]} ${POOL_EMOJI[pool]} ${maxMark}s`
      : `BeatGuesser Infinito\n${POOL_LABELS[pool]} ${POOL_EMOJI[pool]} — ${score ?? 0} canciones`;

  return (
    <div className="w-full bg-surface rounded-2xl p-4 border border-neutral-800">
      <pre className="font-mono text-sm text-neutral-300 whitespace-pre-wrap mb-3">{shareText}</pre>
      <button
        type="button"
        onClick={onCopy}
        className="w-full py-2.5 rounded-full text-sm font-semibold transition-colors"
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
    return `BeatGuesser #${dateKey}\n${POOL_LABELS[pool]} ${POOL_EMOJI[pool]} ${maxMark}s`;
  }
  return `BeatGuesser Infinito\n${POOL_LABELS[pool]} ${POOL_EMOJI[pool]} — ${score ?? 0} canciones`;
}
