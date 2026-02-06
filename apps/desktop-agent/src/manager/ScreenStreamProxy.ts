/**
 * ScreenStreamProxy - Proxies minicap frames from workers to UI
 * 
 * Handles:
 * - Forwarding screen streaming events from workers to UI clients
 * - Buffer management for multiple viewers
 * - Quality adjustment based on viewer count and bandwidth
 */

import { EventEmitter } from 'events';
import type { Socket } from 'socket.io';
import type {
  MinicapFrame,
  StreamConfig,
  StreamStartInfo,
  StreamStopInfo,
  StreamStats,
  StreamError,
  QualityChangeInfo,
} from '@doai/worker-types';
import type { WorkerRegistry } from './WorkerRegistry';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Viewer information
 */
export interface StreamViewer {
  /** Viewer socket */
  socket: Socket;
  /** Device being viewed */
  deviceId: string;
  /** Viewer joined timestamp */
  joinedAt: number;
  /** Last frame sent timestamp */
  lastFrameSent: number;
  /** Total frames sent to this viewer */
  framesSent: number;
}

/**
 * Active stream information
 */
export interface ActiveStream {
  /** Device ID being streamed */
  deviceId: string;
  /** Worker ID providing the stream */
  workerId: string;
  /** Stream session ID */
  sessionId: string;
  /** Stream configuration */
  config: StreamConfig;
  /** Stream start info */
  startInfo?: StreamStartInfo;
  /** Viewers watching this stream */
  viewers: Map<string, StreamViewer>;
  /** Frame buffer (latest N frames) */
  frameBuffer: MinicapFrame[];
  /** Stream statistics */
  stats?: StreamStats;
  /** Started timestamp */
  startedAt: number;
}

/**
 * Configuration for ScreenStreamProxy
 */
export interface ScreenStreamProxyConfig {
  /** Maximum frames to buffer per stream */
  maxBufferSize: number;
  /** Maximum viewers per stream */
  maxViewersPerStream: number;
  /** Frame rate limit for forwarding */
  maxFrameRate: number;
  /** Quality reduction threshold (number of viewers) */
  qualityReductionThreshold: number;
}

/**
 * Events emitted by ScreenStreamProxy
 */
export interface ScreenStreamProxyEvents {
  'stream:started': (deviceId: string, info: StreamStartInfo) => void;
  'stream:stopped': (deviceId: string, info: StreamStopInfo) => void;
  'stream:error': (deviceId: string, error: StreamError) => void;
  'stream:viewer_joined': (deviceId: string, viewerId: string) => void;
  'stream:viewer_left': (deviceId: string, viewerId: string) => void;
}

// Default configuration
const DEFAULT_CONFIG: ScreenStreamProxyConfig = {
  maxBufferSize: 3,
  maxViewersPerStream: 10,
  maxFrameRate: 30,
  qualityReductionThreshold: 5,
};

// ============================================================================
// ScreenStreamProxy Class
// ============================================================================

export class ScreenStreamProxy extends EventEmitter {
  /** Map of device ID to active stream */
  private streams: Map<string, ActiveStream> = new Map();
  
  /** Worker registry reference */
  private registry: WorkerRegistry;
  
  /** Configuration */
  private config: ScreenStreamProxyConfig;

  /** Frame rate limiters per stream */
  private lastFrameTime: Map<string, number> = new Map();

  constructor(registry: WorkerRegistry, config: Partial<ScreenStreamProxyConfig> = {}) {
    super();
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Stream Management
  // ==========================================================================

  /**
   * Handle stream start from worker
   */
  handleStreamStart(workerId: string, info: StreamStartInfo): void {
    const { deviceId, sessionId, config, minicapInfo } = info;

    // Check if stream already exists
    if (this.streams.has(deviceId)) {
      logger.warn('[ScreenStreamProxy] Stream already active for device', { deviceId });
      return;
    }

    const stream: ActiveStream = {
      deviceId,
      workerId,
      sessionId,
      config,
      startInfo: info,
      viewers: new Map(),
      frameBuffer: [],
      startedAt: Date.now(),
    };

    this.streams.set(deviceId, stream);

    logger.info('[ScreenStreamProxy] Stream started', {
      deviceId,
      workerId,
      sessionId,
      resolution: `${minicapInfo.virtualWidth}x${minicapInfo.virtualHeight}`,
    });

    this.emit('stream:started', deviceId, info);
  }

  /**
   * Handle stream stop from worker
   */
  handleStreamStop(workerId: string, info: StreamStopInfo): void {
    const { deviceId, sessionId, reason, totalFrames, durationMs } = info;

    const stream = this.streams.get(deviceId);
    if (!stream || stream.sessionId !== sessionId) {
      logger.warn('[ScreenStreamProxy] Stream stop for unknown session', {
        deviceId,
        sessionId,
      });
      return;
    }

    // Notify all viewers
    for (const [viewerId, viewer] of stream.viewers) {
      viewer.socket.emit('screen:stopped', {
        deviceId,
        reason,
      });
    }

    // Clear stream
    this.streams.delete(deviceId);
    this.lastFrameTime.delete(deviceId);

    logger.info('[ScreenStreamProxy] Stream stopped', {
      deviceId,
      sessionId,
      reason,
      totalFrames,
      durationMs,
    });

    this.emit('stream:stopped', deviceId, info);
  }

  /**
   * Handle stream error from worker
   */
  handleStreamError(workerId: string, error: StreamError): void {
    const { deviceId, sessionId, code, message, recoverable } = error;

    const stream = this.streams.get(deviceId);
    if (stream && sessionId && stream.sessionId !== sessionId) {
      return;  // Error for a different session
    }

    logger.error('[ScreenStreamProxy] Stream error', {
      deviceId,
      code,
      message,
      recoverable,
    });

    // Notify all viewers
    if (stream) {
      for (const [_viewerId, viewer] of stream.viewers) {
        viewer.socket.emit('screen:error', {
          deviceId,
          code,
          message,
        });
      }

      // If not recoverable, clean up stream
      if (!recoverable) {
        this.streams.delete(deviceId);
        this.lastFrameTime.delete(deviceId);
      }
    }

    this.emit('stream:error', deviceId, error);
  }

  // ==========================================================================
  // Frame Forwarding
  // ==========================================================================

  /**
   * Handle incoming frame from worker
   */
  handleFrame(workerId: string, deviceId: string, frame: MinicapFrame): void {
    const stream = this.streams.get(deviceId);
    
    if (!stream || stream.workerId !== workerId) {
      return;  // Unknown stream or wrong worker
    }

    // Frame rate limiting
    const now = Date.now();
    const lastFrame = this.lastFrameTime.get(deviceId) || 0;
    const minInterval = 1000 / this.config.maxFrameRate;
    
    if (now - lastFrame < minInterval) {
      return;  // Skip frame to maintain frame rate limit
    }
    
    this.lastFrameTime.set(deviceId, now);

    // Update frame buffer (ring buffer)
    stream.frameBuffer.push(frame);
    if (stream.frameBuffer.length > this.config.maxBufferSize) {
      stream.frameBuffer.shift();
    }

    // Forward to all viewers
    for (const [_viewerId, viewer] of stream.viewers) {
      this.sendFrameToViewer(viewer, frame);
    }
  }

  /**
   * Send frame to a specific viewer
   */
  private sendFrameToViewer(viewer: StreamViewer, frame: MinicapFrame): void {
    try {
      // Send as binary data
      viewer.socket.emit('screen:frame', {
        deviceId: viewer.deviceId,
        frameNumber: frame.frameNumber,
        timestamp: frame.timestamp,
        width: frame.width,
        height: frame.height,
        format: frame.format,
        data: Buffer.from(frame.data).toString('base64'),
        size: frame.size,
      });

      viewer.lastFrameSent = Date.now();
      viewer.framesSent++;
    } catch (error) {
      logger.error('[ScreenStreamProxy] Failed to send frame to viewer', {
        deviceId: viewer.deviceId,
        error: (error as Error).message,
      });
    }
  }

  // ==========================================================================
  // Viewer Management
  // ==========================================================================

  /**
   * Add a viewer to a stream
   */
  addViewer(deviceId: string, viewerSocket: Socket): boolean {
    const stream = this.streams.get(deviceId);
    
    if (!stream) {
      // Stream not active - try to start it
      logger.warn('[ScreenStreamProxy] Cannot add viewer - stream not active', { deviceId });
      return false;
    }

    if (stream.viewers.size >= this.config.maxViewersPerStream) {
      logger.warn('[ScreenStreamProxy] Maximum viewers reached for stream', {
        deviceId,
        maxViewers: this.config.maxViewersPerStream,
      });
      return false;
    }

    const viewerId = viewerSocket.id;
    
    if (stream.viewers.has(viewerId)) {
      logger.debug('[ScreenStreamProxy] Viewer already watching stream', {
        deviceId,
        viewerId,
      });
      return true;
    }

    const viewer: StreamViewer = {
      socket: viewerSocket,
      deviceId,
      joinedAt: Date.now(),
      lastFrameSent: 0,
      framesSent: 0,
    };

    stream.viewers.set(viewerId, viewer);

    logger.info('[ScreenStreamProxy] Viewer joined stream', {
      deviceId,
      viewerId,
      totalViewers: stream.viewers.size,
    });

    // Send current stream info to new viewer
    if (stream.startInfo) {
      viewerSocket.emit('screen:info', {
        deviceId,
        sessionId: stream.sessionId,
        config: stream.config,
        minicapInfo: stream.startInfo.minicapInfo,
      });
    }

    // Send latest buffered frame if available
    if (stream.frameBuffer.length > 0) {
      const latestFrame = stream.frameBuffer[stream.frameBuffer.length - 1];
      this.sendFrameToViewer(viewer, latestFrame);
    }

    // Check if we need to reduce quality
    this.checkQualityAdjustment(stream);

    this.emit('stream:viewer_joined', deviceId, viewerId);

    return true;
  }

  /**
   * Remove a viewer from a stream
   */
  removeViewer(deviceId: string, viewerSocket: Socket): boolean {
    const stream = this.streams.get(deviceId);
    
    if (!stream) {
      return false;
    }

    const viewerId = viewerSocket.id;
    const removed = stream.viewers.delete(viewerId);

    if (removed) {
      logger.info('[ScreenStreamProxy] Viewer left stream', {
        deviceId,
        viewerId,
        remainingViewers: stream.viewers.size,
      });

      // Check if we can increase quality
      this.checkQualityAdjustment(stream);

      this.emit('stream:viewer_left', deviceId, viewerId);
    }

    return removed;
  }

  /**
   * Remove a viewer from all streams (on disconnect)
   */
  removeViewerFromAll(viewerSocket: Socket): void {
    const viewerId = viewerSocket.id;

    for (const [deviceId, stream] of this.streams) {
      if (stream.viewers.has(viewerId)) {
        this.removeViewer(deviceId, viewerSocket);
      }
    }
  }

  /**
   * Check and adjust quality based on viewer count
   */
  private checkQualityAdjustment(stream: ActiveStream): void {
    const viewerCount = stream.viewers.size;
    const threshold = this.config.qualityReductionThreshold;

    // This is a placeholder for actual quality adjustment logic
    // In a real implementation, this would send a command to the worker
    // to adjust the streaming quality
    
    if (viewerCount >= threshold) {
      logger.debug('[ScreenStreamProxy] Consider reducing quality', {
        deviceId: stream.deviceId,
        viewerCount,
        threshold,
      });
    }
  }

  // ==========================================================================
  // Stream Requests
  // ==========================================================================

  /**
   * Request to start streaming a device
   */
  requestStreamStart(deviceId: string, config?: Partial<StreamConfig>): boolean {
    const worker = this.registry.findWorkerByDevice(deviceId);
    
    if (!worker) {
      logger.warn('[ScreenStreamProxy] Cannot start stream - device not found', { deviceId });
      return false;
    }

    logger.info('[ScreenStreamProxy] Requesting stream start', {
      deviceId,
      workerId: worker.worker_id,
    });

    worker.socket.emit('cmd:start_stream', {
      deviceId,
      config,
    });

    return true;
  }

  /**
   * Request to stop streaming a device
   */
  requestStreamStop(deviceId: string): boolean {
    const stream = this.streams.get(deviceId);
    
    if (!stream) {
      logger.warn('[ScreenStreamProxy] Cannot stop stream - not active', { deviceId });
      return false;
    }

    const worker = this.registry.getWorker(stream.workerId);
    
    if (!worker) {
      logger.warn('[ScreenStreamProxy] Cannot stop stream - worker not found', {
        deviceId,
        workerId: stream.workerId,
      });
      return false;
    }

    logger.info('[ScreenStreamProxy] Requesting stream stop', {
      deviceId,
      workerId: stream.workerId,
    });

    worker.socket.emit('cmd:stop_stream', {
      deviceId,
      sessionId: stream.sessionId,
    });

    return true;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Handle stream statistics from worker
   */
  handleStreamStats(workerId: string, stats: StreamStats): void {
    const { deviceId, sessionId } = stats;
    const stream = this.streams.get(deviceId);

    if (!stream || stream.sessionId !== sessionId) {
      return;
    }

    stream.stats = stats;
  }

  /**
   * Handle quality change notification from worker
   */
  handleQualityChange(workerId: string, info: QualityChangeInfo): void {
    const stream = this.streams.get(info.deviceId);
    
    if (!stream || stream.workerId !== workerId) {
      return;
    }

    logger.info('[ScreenStreamProxy] Stream quality changed', {
      deviceId: info.deviceId,
      previousQuality: info.previousQuality,
      newQuality: info.newQuality,
      reason: info.reason,
    });

    // Notify viewers
    for (const [_viewerId, viewer] of stream.viewers) {
      viewer.socket.emit('screen:quality_changed', {
        deviceId: info.deviceId,
        quality: info.newQuality,
        reason: info.reason,
      });
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get active stream for a device
   */
  getStream(deviceId: string): ActiveStream | undefined {
    return this.streams.get(deviceId);
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): ActiveStream[] {
    return Array.from(this.streams.values());
  }

  /**
   * Get viewer count for a stream
   */
  getViewerCount(deviceId: string): number {
    const stream = this.streams.get(deviceId);
    return stream ? stream.viewers.size : 0;
  }

  /**
   * Check if a stream is active
   */
  isStreaming(deviceId: string): boolean {
    return this.streams.has(deviceId);
  }

  /**
   * Get total viewer count across all streams
   */
  getTotalViewerCount(): number {
    let count = 0;
    for (const stream of this.streams.values()) {
      count += stream.viewers.size;
    }
    return count;
  }

  /**
   * Clear all streams (for testing or shutdown)
   */
  clear(): void {
    this.streams.clear();
    this.lastFrameTime.clear();
    logger.info('[ScreenStreamProxy] Cleared all streams');
  }
}

// Type augmentation for EventEmitter
export interface ScreenStreamProxy {
  on<E extends keyof ScreenStreamProxyEvents>(
    event: E,
    listener: ScreenStreamProxyEvents[E]
  ): this;
  
  off<E extends keyof ScreenStreamProxyEvents>(
    event: E,
    listener: ScreenStreamProxyEvents[E]
  ): this;
  
  emit<E extends keyof ScreenStreamProxyEvents>(
    event: E,
    ...args: Parameters<ScreenStreamProxyEvents[E]>
  ): boolean;
  
  once<E extends keyof ScreenStreamProxyEvents>(
    event: E,
    listener: ScreenStreamProxyEvents[E]
  ): this;
}

export default ScreenStreamProxy;
