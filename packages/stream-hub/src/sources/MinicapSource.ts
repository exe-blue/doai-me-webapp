import { FrameSource } from './FrameSource';
import type { FrameData } from '../types';

export interface MinicapSourceOptions {
  deviceId: string;
  adbSerial: string;
  width: number;
  height: number;
  frameRate: number;
  quality: number;
  port: number;
}

export class MinicapSource extends FrameSource {
  readonly type = 'minicap';
  readonly deviceId: string;

  private adbSerial: string;
  private width: number;
  private height: number;
  private frameRate: number;
  private quality: number;
  private port: number;
  private running = false;

  constructor(options: MinicapSourceOptions) {
    super();
    this.deviceId = options.deviceId;
    this.adbSerial = options.adbSerial;
    this.width = options.width;
    this.height = options.height;
    this.frameRate = options.frameRate;
    this.quality = options.quality;
    this.port = options.port;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.emit('stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  setQuality(quality: number): void {
    this.quality = quality;
  }

  setFrameRate(fps: number): void {
    this.frameRate = fps;
  }

  setResolution(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  pushFrame(data: Uint8Array): void {
    if (!this.running) return;

    const frame: FrameData = {
      deviceId: this.deviceId,
      data,
      width: this.width,
      height: this.height,
      timestamp: Date.now(),
      format: 'jpeg',
      quality: 'high',
    };

    this.emit('frame', frame);
  }

  getPort(): number {
    return this.port;
  }

  getAdbSerial(): string {
    return this.adbSerial;
  }
}
