import { EventEmitter } from 'events';
import type { FrameData } from './types';
import type { FrameSource } from './sources/FrameSource';

export class FrameAggregator extends EventEmitter {
  private sources: Map<string, FrameSource> = new Map();
  private lastFrameTimes: Map<string, number> = new Map();
  private minFrameInterval: number;
  private sourceListeners: Map<string, { frame: (...args: unknown[]) => void; error: (...args: unknown[]) => void }> = new Map();

  constructor(maxFps = 30) {
    super();
    if (maxFps <= 0) maxFps = 1;
    this.minFrameInterval = 1000 / maxFps;
  }

  addSource(source: FrameSource): void {
    // Remove old listeners if source is being replaced
    this.removeSource(source.deviceId);

    this.sources.set(source.deviceId, source);

    const frameListener = (frame: FrameData) => {
      const now = Date.now();
      const lastTime = this.lastFrameTimes.get(frame.deviceId) ?? 0;

      if (now - lastTime >= this.minFrameInterval) {
        this.lastFrameTimes.set(frame.deviceId, now);
        this.emit('frame', frame);
      }
    };

    const errorListener = (error: Error) => {
      this.emit('source_error', { deviceId: source.deviceId, error });
    };

    source.on('frame', frameListener);
    source.on('error', errorListener);
    this.sourceListeners.set(source.deviceId, { frame: frameListener, error: errorListener });
  }

  removeSource(deviceId: string): void {
    const source = this.sources.get(deviceId);
    if (source) {
      const listeners = this.sourceListeners.get(deviceId);
      if (listeners) {
        source.removeListener('frame', listeners.frame);
        source.removeListener('error', listeners.error);
        this.sourceListeners.delete(deviceId);
      }
      this.sources.delete(deviceId);
      this.lastFrameTimes.delete(deviceId);
    }
  }

  getSourceCount(): number {
    return this.sources.size;
  }

  setMaxFps(fps: number): void {
    if (fps <= 0) fps = 1;
    this.minFrameInterval = 1000 / fps;
  }
}
