import { EventEmitter } from 'events';
import type { FrameData } from './types';
import type { FrameSource } from './sources/FrameSource';

export class FrameAggregator extends EventEmitter {
  private sources: Map<string, FrameSource> = new Map();
  private lastFrameTimes: Map<string, number> = new Map();
  private minFrameInterval: number;

  constructor(maxFps = 30) {
    super();
    this.minFrameInterval = 1000 / maxFps;
  }

  addSource(source: FrameSource): void {
    this.sources.set(source.deviceId, source);

    source.on('frame', (frame: FrameData) => {
      const now = Date.now();
      const lastTime = this.lastFrameTimes.get(frame.deviceId) ?? 0;

      if (now - lastTime >= this.minFrameInterval) {
        this.lastFrameTimes.set(frame.deviceId, now);
        this.emit('frame', frame);
      }
    });

    source.on('error', (error: Error) => {
      this.emit('source_error', { deviceId: source.deviceId, error });
    });
  }

  removeSource(deviceId: string): void {
    const source = this.sources.get(deviceId);
    if (source) {
      source.removeAllListeners();
      this.sources.delete(deviceId);
      this.lastFrameTimes.delete(deviceId);
    }
  }

  getSourceCount(): number {
    return this.sources.size;
  }

  setMaxFps(fps: number): void {
    this.minFrameInterval = 1000 / fps;
  }
}
