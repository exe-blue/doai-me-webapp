import { EventEmitter } from 'events';
import type { FrameData } from '../types';

export interface FrameSourceEvents {
  frame: (frame: FrameData) => void;
  error: (error: Error) => void;
  started: () => void;
  stopped: () => void;
}

export abstract class FrameSource extends EventEmitter {
  abstract readonly type: string;
  abstract readonly deviceId: string;

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract isRunning(): boolean;

  abstract setQuality(quality: number): void;
  abstract setFrameRate(fps: number): void;
  abstract setResolution(width: number, height: number): void;
}
