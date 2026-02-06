// ============================================
// DoAi.Me YouTube Bot - YouTube Worker
// BaseWorker 기반 YouTube 자동화 워커
// ============================================

import {
  WorkerType,
  WorkerCapability,
  WorkerConfig,
} from '@doai/worker-types';
import {
  BaseWorker,
  AdbController,
  DeviceManager,
  Logger,
} from '@doai/worker-core';
import { WatchHandler } from './handlers';

/**
 * YouTube Worker configuration (simplified)
 */
export interface YouTubeWorkerConfig {
  /** Unique worker ID */
  workerId: string;
  /** Manager server URL */
  managerUrl: string;
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatIntervalMs?: number;
  /** Connection timeout in milliseconds (default: 10000) */
  connectionTimeoutMs?: number;
  /** Maximum concurrent jobs (default: 5) */
  maxConcurrentJobs?: number;
  /** ADB server host (default: localhost) */
  adbHost?: string;
  /** ADB server port (default: 5037) */
  adbPort?: number;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Convert simplified config to full WorkerConfig
 */
function toWorkerConfig(config: YouTubeWorkerConfig): WorkerConfig {
  return {
    workerId: config.workerId,
    type: 'youtube',
    managerUrl: config.managerUrl,
    heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000,
    connectionTimeoutMs: config.connectionTimeoutMs ?? 10000,
    maxConcurrentJobs: config.maxConcurrentJobs ?? 5,
    defaultJobTimeoutMs: 600000, // 10 min for YouTube watch
    reconnect: {
      maxAttempts: 10,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
    capabilities: [],
  };
}

/**
 * YouTube Worker
 * Worker implementation for YouTube automation tasks
 */
export class YouTubeWorker extends BaseWorker {
  get type(): WorkerType {
    return 'youtube';
  }

  get capabilities(): WorkerCapability[] {
    return [
      {
        name: 'youtube_watch',
        version: '1.0.0',
        enabled: true,
        config: {
          maxWatchDuration: 3600,
          supportLike: true,
          supportComment: true,
          supportSubscribe: true,
        },
        requiredFeatures: ['screen', 'youtube_app'],
      },
    ];
  }

  constructor(config: YouTubeWorkerConfig) {
    super(toWorkerConfig(config));

    // Register YouTube watch handler
    const watchHandler = new WatchHandler(this.adb, this.logger);
    this.registerJobHandler(watchHandler);
  }

  /**
   * Get device manager instance (for index.ts compatibility)
   */
  getDeviceManager(): DeviceManager {
    return this.deviceManager;
  }

  /**
   * Get ADB controller instance
   */
  getAdbController(): AdbController {
    return this.adb;
  }

  /**
   * Dispose worker and clean up resources
   */
  dispose(): void {
    this.disconnect();
    this.deviceManager.dispose();
    this.removeAllListeners();
    this.logger.info('YouTubeWorker disposed');
  }
}

export default YouTubeWorker;
