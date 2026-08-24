import { useState } from 'react';
import { Analytics, track } from '@vercel/analytics/react';
import type { GameMode } from './types';
import Home from './components/Home';
import PlayScreen from './components/PlayScreen';
import ErrorBoundary from './components/ErrorBoundary';

type Screen = 'home' | 'play';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('daily');

  return (
    <>
      <ErrorBoundary>
        {screen === 'play' ? (
          <PlayScreen
            mode={mode}
            onHome={() => setScreen('home')}
          />
        ) : (
          <Home
            onSelect={(selectedMode) => {
              track('Game Started', {
                mode: selectedMode,
                pool: 'easy',
              });
              setMode(selectedMode);
              setScreen('play');
            }}
          />
        )}
      </ErrorBoundary>
      <Analytics />
    </>
  );
}
