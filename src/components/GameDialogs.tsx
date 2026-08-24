import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { DailyResult, Song } from '../types';

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
            className="flex-1 h-11 rounded-xl border border-neutral-600 px-4 text-sm text-neutral-200"
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
  onClose: () => void;
}

export function DailyResultDialog({
  open,
  song,
  result,
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

  return (
    <dialog
      ref={dialogRef}
      className="game-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby="daily-result-title"
    >
      <div className="text-center space-y-5">
        <div
          aria-hidden="true"
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl font-bold ${
            won ? 'bg-easy/15 text-easy' : 'bg-expert/15 text-expert'
          }`}
        >
          {won ? '✓' : '✕'}
        </div>
        <div>
          <h2
            id="daily-result-title"
            className={`text-2xl font-bold ${won ? 'text-easy' : 'text-expert'}`}
          >
            {won ? t('dialogs.songWon') : t('dialogs.songLost')}
          </h2>
          <p className="mt-3 text-lg font-semibold text-white">
            {song?.title ?? result?.songTitle}
          </p>
          <p className="text-neutral-400">{song?.artist ?? result?.songArtist}</p>
          {won && result?.attempts && (
            <p className="mt-2 text-sm text-neutral-500">
              {t('share.attempt', { count: result.attempts })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-white px-4 text-sm font-semibold text-bg"
        >
          {t('dialogs.viewResult')}
        </button>
      </div>
    </dialog>
  );
}
