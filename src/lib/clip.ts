import i18n from '../i18n';

export type ClipLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ClipError {
  phase: 'load' | 'play';
  message: string;
  code?: number;
}

export type PlayingChangeListener = (playing: boolean) => void;
export type ErrorListener = (error: ClipError) => void;

const LOAD_TIMEOUT_MS = 15_000;

function audioErrorMessage(audio: HTMLAudioElement | null): string {
  const code = audio?.error?.code;
  // MediaError constants: 1 aborted, 2 network, 3 decode, 4 src not supported
  switch (code) {
    case 1:
      return i18n.t('audio.loadAborted');
    case 2:
      return i18n.t('audio.networkError');
    case 3:
      return i18n.t('audio.decodeError');
    case 4:
      return i18n.t('audio.unsupportedFormat');
    default:
      return i18n.t('audio.loadError');
  }
}

export class AudioClipper {
  private audio: HTMLAudioElement | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;
  private _isPlaying = false;
  private _loadState: ClipLoadState = 'idle';
  private loadGeneration = 0;
  private onPlayingChange: PlayingChangeListener | null = null;
  private onError: ErrorListener | null = null;
  private boundPlay = () => this.setPlaying(true);
  private boundPause = () => this.setPlaying(false);
  private boundEnded = () => this.setPlaying(false);
  private boundError = () => {
    this.setPlaying(false);
    this.emitError({
      phase: 'play',
      message: audioErrorMessage(this.audio),
      code: this.audio?.error?.code,
    });
  };

  get loadState(): ClipLoadState {
    return this._loadState;
  }

  setPlayingChangeListener(listener: PlayingChangeListener | null): void {
    this.onPlayingChange = listener;
  }

  setErrorListener(listener: ErrorListener | null): void {
    this.onError = listener;
  }

  async load(url: string): Promise<void> {
    this.stop();
    this.detachAudioListeners();
    this.clearLoadTimeout();

    const generation = ++this.loadGeneration;
    this._loadState = 'loading';
    this.audio = new Audio(url);
    this.audio.preload = 'auto';
    this.attachAudioListeners(this.audio);

    await new Promise<void>((resolve, reject) => {
      if (!this.audio || generation !== this.loadGeneration) {
        return reject(new Error(i18n.t('audio.notInitialized')));
      }

      const audio = this.audio;
      let settled = false;

      const finish = (ok: boolean, err?: Error) => {
        if (settled || generation !== this.loadGeneration) return;
        settled = true;
        cleanup();
        this.clearLoadTimeout();
        if (ok) {
          this._loadState = 'ready';
          resolve();
        } else {
          this._loadState = 'error';
          const error = err ?? new Error(audioErrorMessage(audio));
          this.emitError({
            phase: 'load',
            message: error.message,
            code: audio.error?.code,
          });
          reject(error);
        }
      };

      const onReady = () => finish(true);
      const onError = () => finish(false, new Error(audioErrorMessage(audio)));
      const cleanup = () => {
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('loadeddata', onReady);
        audio.removeEventListener('error', onError);
      };

      const tryReady = () => {
        if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          finish(true);
        }
      };

      audio.addEventListener('canplaythrough', onReady, { once: true });
      audio.addEventListener('canplay', onReady, { once: true });
      audio.addEventListener('loadeddata', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });

      this.loadTimeout = setTimeout(() => {
        finish(false, new Error(i18n.t('audio.loadTimeout')));
      }, LOAD_TIMEOUT_MS);

      audio.load();
      tryReady();
    });
  }

  async play(durationSec: number): Promise<void> {
    if (!this.audio) {
      throw new Error(i18n.t('audio.notLoaded'));
    }

    this.clearStopTimer();
    this.audio.currentTime = 0;

    try {
      await this.audio.play();
      this.setPlaying(true);
    } catch (err) {
      this.setPlaying(false);
      const message = err instanceof Error ? err.message : i18n.t('audio.playFailed');
      this.emitError({ phase: 'play', message });
      throw err instanceof Error ? err : new Error(message);
    }

    this.stopTimer = setTimeout(() => {
      this.stop();
    }, durationSec * 1000);
  }

  stop(): void {
    this.clearStopTimer();
    if (this.audio) {
      this.audio.pause();
      try {
        this.audio.currentTime = 0;
      } catch {
        // ignore seek errors on unloaded media
      }
    }
    this.setPlaying(false);
  }

  isPlaying(): boolean {
    return this._isPlaying && !!this.audio && !this.audio.paused;
  }

  getCurrentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  destroy(): void {
    this.loadGeneration += 1;
    this.clearLoadTimeout();
    this.stop();
    this.detachAudioListeners();
    this.audio = null;
    this._loadState = 'idle';
    this.onPlayingChange = null;
    this.onError = null;
  }

  private attachAudioListeners(audio: HTMLAudioElement): void {
    audio.addEventListener('play', this.boundPlay);
    audio.addEventListener('pause', this.boundPause);
    audio.addEventListener('ended', this.boundEnded);
    audio.addEventListener('error', this.boundError);
  }

  private detachAudioListeners(): void {
    if (!this.audio) return;
    this.audio.removeEventListener('play', this.boundPlay);
    this.audio.removeEventListener('pause', this.boundPause);
    this.audio.removeEventListener('ended', this.boundEnded);
    this.audio.removeEventListener('error', this.boundError);
  }

  private clearStopTimer(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }

  private clearLoadTimeout(): void {
    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
      this.loadTimeout = null;
    }
  }

  private setPlaying(playing: boolean): void {
    if (this._isPlaying === playing) return;
    this._isPlaying = playing;
    this.onPlayingChange?.(playing);
  }

  private emitError(error: ClipError): void {
    this.onError?.(error);
  }
}
