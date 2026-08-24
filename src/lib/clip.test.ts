import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioClipper } from './clip';

type Handler = EventListenerOrEventListenerObject;

class FakeAudio {
  src = '';
  preload = 'auto';
  currentTime = 0;
  paused = true;
  readyState = 0;
  error: MediaError | null = null;

  private listeners = new Map<string, Set<Handler>>();
  playImpl: () => Promise<void> = async () => {
    this.paused = false;
    this.dispatch('play');
  };

  addEventListener(type: string, listener: Handler): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Handler): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener(new Event(type));
      } else {
        listener.handleEvent(new Event(type));
      }
    }
  }

  load(): void {
    // tests trigger ready/error manually
  }

  play(): Promise<void> {
    return this.playImpl();
  }

  pause(): void {
    this.paused = true;
    this.dispatch('pause');
  }
}

describe('AudioClipper', () => {
  let fake: FakeAudio;
  let clipper: AudioClipper;

  beforeEach(() => {
    vi.useFakeTimers();
    fake = new FakeAudio();
    vi.stubGlobal(
      'Audio',
      class {
        constructor() {
          return fake;
        }
      },
    );
    clipper = new AudioClipper();
  });

  afterEach(() => {
    clipper.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads when canplay fires', async () => {
    const pending = clipper.load('https://example.com/a.mp3');
    fake.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
    fake.dispatch('canplay');
    await pending;
    expect(clipper.loadState).toBe('ready');
  });

  it('rejects load on error', async () => {
    const pending = clipper.load('https://example.com/broken.mp3');
    fake.dispatch('error');
    await expect(pending).rejects.toThrow();
    expect(clipper.loadState).toBe('error');
  });

  it('starts the clip timer only after play resolves', async () => {
    const pendingLoad = clipper.load('https://example.com/a.mp3');
    fake.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
    fake.dispatch('canplay');
    await pendingLoad;

    let resolvePlay!: () => void;
    fake.playImpl = () =>
      new Promise<void>((resolve) => {
        resolvePlay = () => {
          fake.paused = false;
          fake.dispatch('play');
          resolve();
        };
      });

    const playPromise = clipper.play(0.1);
    expect(clipper.isPlaying()).toBe(false);

    resolvePlay();
    await playPromise;
    expect(clipper.isPlaying()).toBe(true);

    vi.advanceTimersByTime(99);
    expect(clipper.isPlaying()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(clipper.isPlaying()).toBe(false);
  });

  it('propagates play rejection', async () => {
    const pendingLoad = clipper.load('https://example.com/a.mp3');
    fake.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
    fake.dispatch('canplay');
    await pendingLoad;

    fake.playImpl = async () => {
      throw new Error('NotAllowedError');
    };

    await expect(clipper.play(1)).rejects.toThrow('NotAllowedError');
    expect(clipper.isPlaying()).toBe(false);
  });

  it('stop clears playback and timers', async () => {
    const pendingLoad = clipper.load('https://example.com/a.mp3');
    fake.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
    fake.dispatch('canplay');
    await pendingLoad;

    await clipper.play(5);
    expect(clipper.isPlaying()).toBe(true);

    clipper.stop();
    expect(clipper.isPlaying()).toBe(false);
    expect(fake.paused).toBe(true);
  });
});
