// ============================================
// DoAi.Me Health Bot - Health Worker
// BaseWorker 기반 디바이스 헬스체크 워커
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
import { HealthCheckHandler, ResetHandler } from './handlers';

/**
 * Health Worker configuration (simplified)
 */
export interface HealthWorkerConfig {
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
function toWorkerConfig(config: HealthWorkerConfig): WorkerConfig {
  return {
    workerId: config.workerId,
    type: 'health',
    managerUrl: config.managerUrl,
    heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000,
    connectionTimeoutMs: config.connectionTimeoutMs ?? 10000,
    maxConcurrentJobs: config.maxConcurrentJobs ?? 5,
    defaultJobTimeoutMs: 120000, // 2 min for health checks
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
 * Health Worker
 * Worker implementation for device health monitoring tasks
 */
export class HealthWorker extends BaseWorker {
  get type(): WorkerType {
    return 'health';
  }

  get capabilities(): WorkerCapability[] {
    return [
      {
        name: 'health_check',
        version: '1.0.0',
        enabled: true,
        config: {
          checkBattery: true,
          checkMemory: true,
          checkNetwork: true,
          checkScreen: true,
          checkStorage: true,
        },
        requiredFeatures: ['adb', 'shell_access'],
      },
      {
        name: 'daily_reset',
        version: '1.0.0',
        enabled: true,
        config: {
          supportReboot: true,
          supportCacheClear: true,
          supportMemoryFree: true,
        },
        requiredFeatures: ['adb', 'shell_access'],
      },
    ];
  }

  constructor(config: HealthWorkerConfig) {
    super(toWorkerConfig(config));

    // Register health check handler
    const healthCheckHandler = new HealthCheckHandler(this.adb, this.logger);
    this.registerJobHandler(healthCheckHandler);

    // Register reset handler
    const resetHandler = new ResetHandler(this.adb, this.logger);
    this.registerJobHandler(resetHandler);
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
    this.logger.info('HealthWorker disposed');
  }
}

export default HealthWorker;
