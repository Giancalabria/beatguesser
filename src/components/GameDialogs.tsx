import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { DailyResult, Song } from '../types';
import { CLIP_MARKS, POOL_COLORS, POOL_I18N_KEYS } from '../types';
import SongReveal from './SongReveal';

interface SurrenderDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SurrenderDialog({ open, onCancel, onConfirm }: SurrenderDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="game-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      aria-labelledby="surrender-title"
    >
      <div className="space-y-5">
        <div>
          <h2 id="surrender-title" className="text-xl font-bold text-white">
            {t('dialogs.surrenderTitle')}
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            {t('dialogs.surrenderDescription')}
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl bg-white/15 border border-white/40 px-4 text-sm font-semibold text-white hover:bg-white/25 hover:border-white/60 transition-colors"
          >
            {t('dialogs.keepTrying')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 h-11 rounded-xl bg-expert px-4 text-sm font-semibold text-white"
          >
            {t('dialogs.surrenderConfirm')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

interface DailyResultDialogProps {
  open: boolean;
  song: Song | null;
  result: DailyResult | undefined;
  shared: boolean;
  shareError: boolean;
  onShare: () => void;
  onClose: () => void;
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="m8.2 10.8 7.5-4.4M8.2 13.2l7.5 4.4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function DailyResultDialog({
  open,
  song,
  result,
  shared,
  shareError,
  onShare,
  onClose,
}: DailyResultDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const won = result?.won === true;
  const accent = result ? POOL_COLORS[result.pool] : '#C8FF00';
  const seconds = result
    ? CLIP_MARKS[result.maxSegment] ?? CLIP_MARKS[CLIP_MARKS.length - 1]
    : CLIP_MARKS[0];

  return (
    <dialog
      ref={dialogRef}
      className={`game-dialog ${won ? 'victory-dialog' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby="daily-result-title"
    >
      {won ? (
        <div className="victory-content text-center">
          <div className="victory-confetti" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
          <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            {t('common.daily')} · {result ? t(POOL_I18N_KEYS[result.pool]) : ''}
          </p>
          <h2 id="daily-result-title" className="relative mt-5 text-3xl font-black text-white">
            {t('dialogs.victoryTitle')}
          </h2>
          <div className="relative mt-5">
            <SongReveal
              title={song?.title ?? result?.songTitle ?? ''}
              artist={song?.artist ?? result?.songArtist ?? ''}
              imageUrl={song?.imageUrl ?? result?.songImageUrl}
              spotifyId={song?.spotifyId ?? result?.songSpotifyId}
            />
          </div>
          <div
            className="victory-stamp relative mx-auto mt-5 w-fit rounded-full border-2 px-4 py-2 text-sm font-black uppercase"
            style={{ borderColor: accent, color: accent }}
          >
            {t('dialogs.guessedIn', { seconds })}
          </div>
          {result?.attempts && (
            <p className="relative mt-3 text-xs text-neutral-500">
              {t('share.attempt', { count: result.attempts })}
            </p>
          )}
          <div className="relative mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onShare}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors"
              style={{
                borderColor: `${accent}66`,
                backgroundColor: `${accent}12`,
                color: accent,
              }}
            >
              <ShareIcon />
              {shared ? t('share.shared') : t('share.shareResult')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl bg-white px-4 text-sm font-semibold text-bg"
            >
              {t('dialogs.continue')}
            </button>
          </div>
          {shareError && (
            <p role="alert" className="relative mt-3 text-xs text-expert">
              {t('share.copyError')}
            </p>
          )}
        </div>
      ) : (
        <div className="text-center space-y-5">
          <div
            aria-hidden="true"
            className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-expert/15 text-3xl font-bold text-expert"
          >
            ✕
          </div>
          <div>
            <h2 id="daily-result-title" className="text-2xl font-bold text-expert">
              {t('dialogs.songLost')}
            </h2>
            <div className="mt-4">
              <SongReveal
                title={song?.title ?? result?.songTitle ?? ''}
                artist={song?.artist ?? result?.songArtist ?? ''}
                imageUrl={song?.imageUrl ?? result?.songImageUrl}
                spotifyId={song?.spotifyId ?? result?.songSpotifyId}
                size="sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-white px-4 text-sm font-semibold text-bg"
          >
            {t('dialogs.viewResult')}
          </button>
        </div>
      )}
    </dialog>
  );
}
