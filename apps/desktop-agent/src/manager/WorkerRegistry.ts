/**
 * WorkerRegistry - Manages worker registration and tracking
 * 
 * Following the Command & Control pattern:
 * - Tracks registered workers and their states
 * - Monitors worker health via heartbeats
 * - Emits events for worker lifecycle changes
 */

import { EventEmitter } from 'events';
import type { Socket } from 'socket.io';
import type {
  EvtWorkerRegister,
  EvtHeartbeat,
  WorkerType,
  WorkerCapability,
  DeviceState,
} from '@doai/worker-types';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Device info as tracked by the registry
 */
export interface TrackedDevice {
  deviceId: string;
  state: DeviceState;
  currentJobId?: string;
}

/**
 * Registered worker information
 */
export interface RegisteredWorker {
  /** Unique worker ID */
  worker_id: string;
  /** Worker type (youtube, install, scrape, generic) */
  worker_type: WorkerType;
  /** Worker version string */
  version: string;
  /** Worker capabilities */
  capabilities: WorkerCapability[];
  /** Connected devices managed by this worker */
  devices: TrackedDevice[];
  /** Socket.IO socket instance */
  socket: Socket;
  /** Timestamp when worker connected */
  connected_at: number;
  /** Timestamp of last heartbeat */
  last_heartbeat: number;
  /** Number of currently active jobs */
  active_jobs: number;
  /** Maximum concurrent jobs this worker can handle */
  max_concurrent_jobs: number;
  /** Host information */
  host: {
    hostname: string;
    platform: string;
    arch: string;
  };
  /** Worker health metrics from last heartbeat */
  metrics?: {
    cpuUsage: number;
    memoryUsage: number;
    uptimeSeconds: number;
  };
}

/**
 * Configuration for WorkerRegistry
 */
export interface WorkerRegistryConfig {
  /** Heartbeat timeout in milliseconds (default: 30000) */
  heartbeatTimeoutMs: number;
  /** Health check interval in milliseconds (default: 10000) */
  healthCheckIntervalMs: number;
}

/**
 * Events emitted by WorkerRegistry
 */
export interface WorkerRegistryEvents {
  'worker:registered': (worker: RegisteredWorker) => void;
  'worker:unregistered': (workerId: string, reason: string) => void;
  'worker:reconnected': (worker: RegisteredWorker) => void;
  'worker:heartbeat': (workerId: string, data: EvtHeartbeat) => void;
  'worker:timeout': (workerId: string, lastHeartbeat: number) => void;
}

// Default configuration
const DEFAULT_CONFIG: WorkerRegistryConfig = {
  heartbeatTimeoutMs: 30000,  // 30 seconds
  healthCheckIntervalMs: 10000,  // 10 seconds
};

// ============================================================================
// WorkerRegistry Class
// ============================================================================

export class WorkerRegistry extends EventEmitter {
  /** Map of worker ID to registered worker */
  private workers: Map<string, RegisteredWorker> = new Map();
  
  /** Configuration */
  private config: WorkerRegistryConfig;
  
  /** Health check timer */
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<WorkerRegistryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the health check timer
   */
  start(): void {
    if (this.healthCheckTimer) {
      return;
    }

    logger.info('[WorkerRegistry] Starting health check timer', {
      intervalMs: this.config.healthCheckIntervalMs,
    });

    this.healthCheckTimer = setInterval(() => {
      this.checkWorkerHealth();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop the health check timer
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.info('[WorkerRegistry] Stopped health check timer');
    }
  }

  // ==========================================================================
  // Registration
  // ==========================================================================

  /**
   * Register a new worker
   */
  registerWorker(data: EvtWorkerRegister, socket: Socket): RegisteredWorker {
    const existingWorker = this.workers.get(data.workerId);
    const now = Date.now();

    if (existingWorker) {
      // Worker reconnecting
      logger.info('[WorkerRegistry] Worker reconnecting', {
        workerId: data.workerId,
        workerType: data.workerType,
      });

      const reconnectedWorker: RegisteredWorker = {
        ...existingWorker,
        socket,
        version: data.version,
        capabilities: data.capabilities,
        devices: data.connectedDevices.map(deviceId => ({
          deviceId,
          state: 'idle' as DeviceState,
        })),
        last_heartbeat: now,
        max_concurrent_jobs: data.maxConcurrentJobs,
        host: data.host,
      };

      this.workers.set(data.workerId, reconnectedWorker);
      this.emit('worker:reconnected', reconnectedWorker);

      return reconnectedWorker;
    }

    // New worker registration
    const worker: RegisteredWorker = {
      worker_id: data.workerId,
      worker_type: data.workerType,
      version: data.version,
      capabilities: data.capabilities,
      devices: data.connectedDevices.map(deviceId => ({
        deviceId,
        state: 'idle' as DeviceState,
      })),
      socket,
      connected_at: now,
      last_heartbeat: now,
      active_jobs: 0,
      max_concurrent_jobs: data.maxConcurrentJobs,
      host: data.host,
    };

    this.workers.set(data.workerId, worker);

    logger.info('[WorkerRegistry] Worker registered', {
      workerId: data.workerId,
      workerType: data.workerType,
      deviceCount: data.connectedDevices.length,
    });

    this.emit('worker:registered', worker);

    return worker;
  }

  /**
   * Unregister a worker
   */
  unregisterWorker(workerId: string, reason = 'disconnected'): boolean {
    const worker = this.workers.get(workerId);
    
    if (!worker) {
      logger.warn('[WorkerRegistry] Attempted to unregister unknown worker', {
        workerId,
      });
      return false;
    }

    this.workers.delete(workerId);

    logger.info('[WorkerRegistry] Worker unregistered', {
      workerId,
      reason,
    });

    this.emit('worker:unregistered', workerId, reason);

    return true;
  }

  // ==========================================================================
  // Heartbeat
  // ==========================================================================

  /**
   * Update worker heartbeat and metrics
   */
  updateHeartbeat(data: EvtHeartbeat): void {
    const worker = this.workers.get(data.workerId);
    
    if (!worker) {
      logger.warn('[WorkerRegistry] Heartbeat from unknown worker', {
        workerId: data.workerId,
      });
      return;
    }

    // Update heartbeat timestamp
    worker.last_heartbeat = data.timestamp;

    // Update metrics
    worker.metrics = {
      cpuUsage: data.metrics.cpuUsage,
      memoryUsage: data.metrics.memoryUsage,
      uptimeSeconds: data.metrics.uptimeSeconds,
    };

    // Update active jobs count
    worker.active_jobs = data.metrics.activeJobs;

    // Update device states
    worker.devices = data.devices.map(d => ({
      deviceId: d.deviceId,
      state: d.state,
      currentJobId: d.currentJobId,
    }));

    logger.debug('[WorkerRegistry] Heartbeat received', {
      workerId: data.workerId,
      activeJobs: data.metrics.activeJobs,
      deviceCount: data.devices.length,
    });

    this.emit('worker:heartbeat', data.workerId, data);
  }

  /**
   * Check worker health and detect timeouts
   */
  checkWorkerHealth(): void {
    const now = Date.now();
    const timeoutThreshold = now - this.config.heartbeatTimeoutMs;

    for (const [workerId, worker] of this.workers) {
      if (worker.last_heartbeat < timeoutThreshold) {
        logger.warn('[WorkerRegistry] Worker heartbeat timeout', {
          workerId,
          lastHeartbeat: worker.last_heartbeat,
          timeoutMs: this.config.heartbeatTimeoutMs,
        });

        this.emit('worker:timeout', workerId, worker.last_heartbeat);
      }
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get a worker by ID
   */
  getWorker(workerId: string): RegisteredWorker | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Get all registered workers
   */
  getWorkers(): RegisteredWorker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get workers by type
   */
  getWorkersByType(workerType: WorkerType): RegisteredWorker[] {
    return this.getWorkers().filter(w => w.worker_type === workerType);
  }

  /**
   * Get workers that have a specific capability
   */
  getWorkersWithCapability(capabilityName: string): RegisteredWorker[] {
    return this.getWorkers().filter(w => 
      w.capabilities.some(c => c.name === capabilityName && c.enabled)
    );
  }

  /**
   * Get all idle devices across all workers
   */
  getIdleDevices(): Array<{ workerId: string; deviceId: string }> {
    const idleDevices: Array<{ workerId: string; deviceId: string }> = [];

    for (const worker of this.workers.values()) {
      for (const device of worker.devices) {
        if (device.state === 'idle' && !device.currentJobId) {
          idleDevices.push({
            workerId: worker.worker_id,
            deviceId: device.deviceId,
          });
        }
      }
    }

    return idleDevices;
  }

  /**
   * Get total device count across all workers
   */
  getTotalDeviceCount(): number {
    let count = 0;
    for (const worker of this.workers.values()) {
      count += worker.devices.length;
    }
    return count;
  }

  /**
   * Get idle device count across all workers
   */
  getIdleDeviceCount(): number {
    return this.getIdleDevices().length;
  }

  /**
   * Get count of registered workers
   */
  getWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Check if a worker exists
   */
  hasWorker(workerId: string): boolean {
    return this.workers.has(workerId);
  }

  /**
   * Find worker that owns a specific device
   */
  findWorkerByDevice(deviceId: string): RegisteredWorker | undefined {
    for (const worker of this.workers.values()) {
      if (worker.devices.some(d => d.deviceId === deviceId)) {
        return worker;
      }
    }
    return undefined;
  }

  /**
   * Get workers that can accept new jobs
   */
  getAvailableWorkers(): RegisteredWorker[] {
    return this.getWorkers().filter(w => 
      w.active_jobs < w.max_concurrent_jobs &&
      w.devices.some(d => d.state === 'idle')
    );
  }

  /**
   * Clear all workers (for testing or shutdown)
   */
  clear(): void {
    this.workers.clear();
    logger.info('[WorkerRegistry] Cleared all workers');
  }
}

// Type augmentation for EventEmitter
export interface WorkerRegistry {
  on<E extends keyof WorkerRegistryEvents>(
    event: E,
    listener: WorkerRegistryEvents[E]
  ): this;
  
  off<E extends keyof WorkerRegistryEvents>(
    event: E,
    listener: WorkerRegistryEvents[E]
  ): this;
  
  emit<E extends keyof WorkerRegistryEvents>(
    event: E,
    ...args: Parameters<WorkerRegistryEvents[E]>
  ): boolean;
  
  once<E extends keyof WorkerRegistryEvents>(
    event: E,
    listener: WorkerRegistryEvents[E]
  ): this;
}

export default WorkerRegistry;
