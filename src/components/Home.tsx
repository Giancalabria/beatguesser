import type { GameMode } from '../types';

interface HomeProps {
  onSelect: (mode: GameMode) => void;
}

export default function Home({ onSelect }: HomeProps) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-12 max-w-[430px] mx-auto">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          <span className="text-easy">Beat</span>
          <span className="text-white">Guesser</span>
        </h1>
        <p className="text-neutral-400 text-sm">¿Cuánto necesitás escuchar?</p>
      </div>

      <div className="w-full flex flex-col gap-4">
        <button
          type="button"
          onClick={() => onSelect('daily')}
          className="w-full py-5 px-6 rounded-full bg-surface border-2 border-easy text-easy font-semibold text-lg hover:bg-easy/10 transition-colors active:scale-[0.98]"
        >
          Diario
        </button>
        <button
          type="button"
          onClick={() => onSelect('infinite')}
          className="w-full py-5 px-6 rounded-full bg-surface border-2 border-impossible text-impossible font-semibold text-lg hover:bg-impossible/10 transition-colors active:scale-[0.98]"
        >
          Infinito
        </button>
      </div>

      <p className="mt-12 text-neutral-500 text-xs text-center leading-relaxed">
        Escuchá fragmentos cada vez más largos e intentá adivinar la canción antes de que se acabe el tiempo.
      </p>
    </div>
  );
}
