import { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import type { GameMode, LangMode } from './types';
import { analytics } from './lib/analytics';
import { loadPreferredLangMode, savePreferredLangMode } from './lib/storage';
import Home from './components/Home';
import PlayScreen from './components/PlayScreen';
import ErrorBoundary from './components/ErrorBoundary';

type Screen = 'home' | 'play';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('daily');
  const [lang, setLang] = useState<LangMode>(() => loadPreferredLangMode());

  return (
    <>
      <ErrorBoundary>
        {screen === 'play' ? (
          <PlayScreen
            mode={mode}
            initialLang={lang}
            onHome={() => setScreen('home')}
          />
        ) : (
          <Home
            onSelect={(selectedMode, selectedLang) => {
              savePreferredLangMode(selectedLang);
              analytics.setContext({
                mode: selectedMode,
                lang: selectedLang,
                pool: 'easy',
              });
              analytics.gameStarted({
                mode: selectedMode,
                lang: selectedLang,
                pool: 'easy',
              });
              setLang(selectedLang);
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
