import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PostHogProvider } from '@posthog/react';
import App from './App';
import { initPostHog } from './lib/posthog';
import './i18n';
import './index.css';

const posthogClient = initPostHog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {posthogClient ? (
      <PostHogProvider client={posthogClient}>
        <App />
      </PostHogProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
