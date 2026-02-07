// ============================================
// Stream Hub Types
// ============================================

export type StreamQuality = 'thumbnail' | 'low' | 'medium' | 'high';

export type StreamSourceType = 'scrcpy' | 'minicap';

export interface StreamSession {
  id: string;
  deviceId: string;
  source: StreamSourceType;
  quality: StreamQuality;
  width: number;
  height: number;
  frameRate: number;
  port: number;
  startedAt: number;
  lastFrameAt: number;
}

export interface FrameData {
  deviceId: string;
  data: Uint8Array;
  width: number;
  height: number;
  timestamp: number;
  format: 'jpeg' | 'png';
  quality: StreamQuality;
}

export interface ThumbnailFrame {
  deviceId: string;
  data: Uint8Array;
  timestamp: number;
  width: number;
  height: number;
}

export interface StreamHubConfig {
  maxSessions: number;
  thumbnailWidth: number;
  thumbnailFps: number;
  fullResWidth: number;
  fullResFps: number;
  thumbnailQuality: number;
  fullResQuality: number;
  portStart: number;
  portEnd: number;
}

export interface StreamSubscription {
  subscriberId: string;
  deviceId: string;
  quality: StreamQuality;
  transport: 'websocket';
}

export interface StreamHubStats {
  activeSessions: number;
  totalSubscribers: number;
  totalBytesPerSecond: number;
  sessionsPerDevice: Record<string, number>;
}

export interface AdaptiveQualityConfig {
  maxBandwidthMbps: number;
  minQuality: number;
  maxQuality: number;
  scaleDownThreshold: number;
  scaleUpThreshold: number;
}
