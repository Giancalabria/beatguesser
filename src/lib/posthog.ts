import posthog from 'posthog-js';

const projectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const apiHost = import.meta.env.VITE_POSTHOG_HOST;

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return true;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function isPostHogConfigured(): boolean {
  return Boolean(projectToken && apiHost);
}

export function shouldEnablePostHog(): boolean {
  return isPostHogConfigured() && !isLocalhost();
}

let initialized = false;

export function initPostHog(): typeof posthog | null {
  if (!shouldEnablePostHog() || initialized) {
    return shouldEnablePostHog() ? posthog : null;
  }

  posthog.init(projectToken!, {
    api_host: apiHost,
    defaults: '2026-05-30',
    disable_session_recording: true,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    person_profiles: 'identified_only',
  });

  initialized = true;
  return posthog;
}

export { posthog };
