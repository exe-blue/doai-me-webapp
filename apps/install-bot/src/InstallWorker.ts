// ============================================
// DoAi.Me Install Bot - Install Worker
// BaseWorker 기반 앱 설치/관리 워커
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
import { InstallHandler, UninstallHandler } from './handlers';

/**
 * Install Worker configuration (simplified)
 */
export interface InstallWorkerConfig {
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
function toWorkerConfig(config: InstallWorkerConfig): WorkerConfig {
  return {
    workerId: config.workerId,
    type: 'install',
    managerUrl: config.managerUrl,
    heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000,
    connectionTimeoutMs: config.connectionTimeoutMs ?? 10000,
    maxConcurrentJobs: config.maxConcurrentJobs ?? 5,
    defaultJobTimeoutMs: 300000, // 5 min for app install
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
 * Install Worker
 * Worker implementation for app installation and management tasks
 */
export class InstallWorker extends BaseWorker {
  get type(): WorkerType {
    return 'install';
  }

  get capabilities(): WorkerCapability[] {
    return [
      {
        name: 'app_install',
        version: '1.0.0',
        enabled: true,
        config: {
          supportReinstall: true,
          supportPermissionGrant: true,
          supportApkUrl: true,
        },
        requiredFeatures: ['adb', 'package_manager'],
      },
      {
        name: 'app_uninstall',
        version: '1.0.0',
        enabled: true,
        config: {
          supportKeepData: true,
        },
        requiredFeatures: ['adb', 'package_manager'],
      },
      {
        name: 'app_update',
        version: '1.0.0',
        enabled: true,
        config: {
          supportDowngrade: false,
        },
        requiredFeatures: ['adb', 'package_manager'],
      },
    ];
  }

  constructor(config: InstallWorkerConfig) {
    super(toWorkerConfig(config));

    // Register install handler
    const installHandler = new InstallHandler(this.adb, this.logger);
    this.registerJobHandler(installHandler);

    // Register uninstall handler
    const uninstallHandler = new UninstallHandler(this.adb, this.logger);
    this.registerJobHandler(uninstallHandler);
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
    this.logger.info('InstallWorker disposed');
  }
}

export default InstallWorker;
