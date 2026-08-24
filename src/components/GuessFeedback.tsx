interface GuessFeedbackProps {
  id: string;
  kind: 'correct' | 'wrong' | null;
  message: string;
}

export default function GuessFeedback({ id, kind, message }: GuessFeedbackProps) {
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="min-h-12 flex items-center justify-center"
    >
      {kind && (
        <div
          className={`guess-feedback w-full rounded-2xl border px-4 py-3 text-center text-sm sm:text-base font-medium ${
            kind === 'correct'
              ? 'border-easy/40 bg-easy/10 text-easy'
              : 'border-expert/40 bg-expert/10 text-red-300'
          }`}
        >
          <span aria-hidden="true" className="mr-2">
            {kind === 'correct' ? '✓' : '✕'}
          </span>
          {message}
        </div>
      )}
    </div>
  );
}
