import { useEffect, useRef } from 'react';
import type { DailyResult, Song } from '../types';

interface SurrenderDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SurrenderDialog({ open, onCancel, onConfirm }: SurrenderDialogProps) {
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
            ¿Rendirse en esta diaria?
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            Se revelará la canción y esta dificultad quedará marcada como fallada hoy.
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-neutral-600 px-4 py-3 text-neutral-200"
          >
            Seguir intentando
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full bg-expert px-4 py-3 font-semibold text-white"
          >
            Rendirme
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
            {won ? '¡Canción acertada!' : 'Canción fallada'}
          </h2>
          <p className="mt-3 text-lg font-semibold text-white">
            {song?.title ?? result?.songTitle}
          </p>
          <p className="text-neutral-400">{song?.artist ?? result?.songArtist}</p>
          {won && result?.attempts && (
            <p className="mt-2 text-sm text-neutral-500">
              {result.attempts} {result.attempts === 1 ? 'intento' : 'intentos'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full bg-white px-4 py-3 font-semibold text-bg"
        >
          Ver resultado
        </button>
      </div>
    </dialog>
  );
}
