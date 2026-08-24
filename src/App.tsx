import { useState } from 'react';
import type { GameMode } from './types';
import Home from './components/Home';
import PlayScreen from './components/PlayScreen';
import ErrorBoundary from './components/ErrorBoundary';

type Screen = 'home' | 'play';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('daily');

  if (screen === 'play') {
    return (
      <ErrorBoundary>
        <PlayScreen
          mode={mode}
          onHome={() => setScreen('home')}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Home
        onSelect={(selectedMode) => {
          setMode(selectedMode);
          setScreen('play');
        }}
      />
    </ErrorBoundary>
  );
}
