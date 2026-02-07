import type { FrameData, ThumbnailFrame } from '../types';

export interface StreamTransport {
  readonly type: string;

  send(subscriberId: string, frame: FrameData | ThumbnailFrame): Promise<void>;
  broadcast(deviceId: string, frame: FrameData | ThumbnailFrame): Promise<void>;
  addSubscriber(subscriberId: string, deviceId: string): void;
  removeSubscriber(subscriberId: string): void;
  getSubscriberCount(deviceId: string): number;
}
