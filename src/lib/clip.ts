export class AudioClipper {
  private audio: HTMLAudioElement | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private _isPlaying = false;

  async load(url: string): Promise<void> {
    this.stop();
    this.audio = new Audio(url);
    this.audio.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      if (!this.audio) return reject(new Error('Audio not initialized'));

      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to load audio'));
      };
      const cleanup = () => {
        this.audio?.removeEventListener('canplaythrough', onReady);
        this.audio?.removeEventListener('error', onError);
      };

      this.audio.addEventListener('canplaythrough', onReady, { once: true });
      this.audio.addEventListener('error', onError, { once: true });
      this.audio.load();
    });
  }

  play(durationSec: number): void {
    if (!this.audio) return;

    this.stop();

    this.audio.currentTime = 0;
    void this.audio.play().then(() => {
      this._isPlaying = true;
    }).catch(() => {
      this._isPlaying = false;
    });

    this.stopTimer = setTimeout(() => {
      this.stop();
    }, durationSec * 1000);
  }

  stop(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this._isPlaying = false;
  }

  isPlaying(): boolean {
    return this._isPlaying && !!this.audio && !this.audio.paused;
  }

  destroy(): void {
    this.stop();
    this.audio = null;
  }
}
