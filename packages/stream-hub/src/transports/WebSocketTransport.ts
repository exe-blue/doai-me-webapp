import type { StreamTransport } from './StreamTransport';
import type { FrameData, ThumbnailFrame } from '../types';

export class WebSocketTransport implements StreamTransport {
  readonly type = 'websocket';

  // subscriberId -> { deviceId, sendFn }
  private subscribers: Map<string, { deviceId: string; send: (data: Uint8Array) => void }> = new Map();
  // deviceId -> Set<subscriberId>
  private deviceSubscribers: Map<string, Set<string>> = new Map();

  async send(subscriberId: string, frame: FrameData | ThumbnailFrame): Promise<void> {
    const sub = this.subscribers.get(subscriberId);
    if (sub) {
      sub.send(frame.data);
    }
  }

  async broadcast(deviceId: string, frame: FrameData | ThumbnailFrame): Promise<void> {
    const subs = this.deviceSubscribers.get(deviceId);
    if (!subs) return;

    for (const subId of subs) {
      const sub = this.subscribers.get(subId);
      if (sub) {
        sub.send(frame.data);
      }
    }
  }

  addSubscriber(subscriberId: string, deviceId: string): void {
    this.subscribers.set(subscriberId, {
      deviceId,
      send: () => {}, // Will be set by the caller
    });

    let deviceSubs = this.deviceSubscribers.get(deviceId);
    if (!deviceSubs) {
      deviceSubs = new Set();
      this.deviceSubscribers.set(deviceId, deviceSubs);
    }
    deviceSubs.add(subscriberId);
  }

  removeSubscriber(subscriberId: string): void {
    const sub = this.subscribers.get(subscriberId);
    if (sub) {
      const deviceSubs = this.deviceSubscribers.get(sub.deviceId);
      if (deviceSubs) {
        deviceSubs.delete(subscriberId);
        if (deviceSubs.size === 0) {
          this.deviceSubscribers.delete(sub.deviceId);
        }
      }
    }
    this.subscribers.delete(subscriberId);
  }

  getSubscriberCount(deviceId: string): number {
    return this.deviceSubscribers.get(deviceId)?.size ?? 0;
  }

  registerSendFunction(subscriberId: string, sendFn: (data: Uint8Array) => void): void {
    const sub = this.subscribers.get(subscriberId);
    if (sub) {
      sub.send = sendFn;
    }
  }
}
