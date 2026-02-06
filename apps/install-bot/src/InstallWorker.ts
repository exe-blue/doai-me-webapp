// ============================================
// DoAi.Me Install Bot - Install Worker
// Main worker implementation for app installation/management
// ============================================

import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';
import {
  WorkerType,
  WorkerCapability,
  WorkerConfig,
  WorkerInterface,
  WorkerStatus,
  WorkerMetrics,
  JobHandler,
  JobContext,
  JobResult,
  CmdExecuteJob,
  CmdCancelJob,
} from '@doai/worker-types';
import {
  AdbController,
  DeviceManager,
  DeviceManagerEvents,
  ManagedDevice,
  Logger,
  defaultLogger,
} from '@doai/worker-core';
import { InstallHandler, UninstallHandler } from './handlers';

/**
 * Install Worker configuration
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
 * Active job tracking
 */
interface ActiveJob {
  jobId: string;
  deviceId: string;
  handler: JobHandler;
  startTime: number;
  abortController: AbortController;
}

/**
 * Install Worker
 * Worker implementation for app installation and management tasks
 */
export class InstallWorker extends EventEmitter implements WorkerInterface {
  readonly workerId: string;
  readonly type: WorkerType = 'install';

  private config: InstallWorkerConfig;
  private socket: Socket | null = null;
  private adbController: AdbController;
  private deviceManager: DeviceManager;
  private logger: Logger;

  private handlers: Map<string, JobHandler> = new Map();
  private activeJobs: Map<string, ActiveJob> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  // Metrics
  private metrics: WorkerMetrics = {
    totalJobsExecuted: 0,
    successfulJobs: 0,
    failedJobs: 0,
    averageJobDurationMs: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    uptimeSeconds: 0,
  };
  private startTime: number = Date.now();
  private jobDurations: number[] = [];

  // Status
  private _status: WorkerStatus = {
    connected: false,
    connectionState: 'disconnected',
    lastHeartbeat: null,
    activeJobs: 0,
    queuedJobs: 0,
    registeredHandlers: [],
  };

  // Capabilities
  readonly capabilities: WorkerCapability[] = [
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

  constructor(config: InstallWorkerConfig) {
    super();

    this.workerId = config.workerId;
    this.config = {
      heartbeatIntervalMs: 30000,
      connectionTimeoutMs: 10000,
      maxConcurrentJobs: 5,
      adbHost: 'localhost',
      adbPort: 5037,
      ...config,
    };

    this.logger = config.logger ?? defaultLogger.child('InstallWorker');

    // Initialize ADB controller
    this.adbController = new AdbController({
      host: this.config.adbHost,
      port: this.config.adbPort,
      logger: this.logger,
    });

    // Initialize device manager
    this.deviceManager = new DeviceManager({
      adbController: this.adbController,
      logger: this.logger,
      autoStartTracking: false,
    });

    // Set up device event listeners
    this.setupDeviceListeners();

    // Register default handlers
    this.registerDefaultHandlers();

    this.logger.info('InstallWorker initialized', {
      workerId: this.workerId,
      managerUrl: this.config.managerUrl,
    });
  }

  /**
   * Get current worker status
   */
  get status(): WorkerStatus {
    return {
      ...this._status,
      activeJobs: this.activeJobs.size,
      registeredHandlers: Array.from(this.handlers.keys()),
    };
  }

  /**
   * Connect to the manager server
   */
  async connect(): Promise<void> {
    if (this._status.connected) {
      this.logger.warn('Already connected to manager');
      return;
    }

    this._status.connectionState = 'connecting';
    this.emit('connecting');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.connectionTimeoutMs);

      this.socket = io(this.config.managerUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        auth: {
          workerId: this.workerId,
          workerType: this.type,
        },
      });

      this.socket.on('connect', async () => {
        clearTimeout(timeout);
        this._status.connected = true;
        this._status.connectionState = 'connected';
        this.reconnectAttempts = 0;

        this.logger.info('Connected to manager', { url: this.config.managerUrl });

        // Start device tracking
        await this.deviceManager.startTracking();

        // Register with manager
        await this.registerWithManager();

        // Start heartbeat
        this.startHeartbeat();

        this.emit('connected');
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        this._status.connected = false;
        this._status.connectionState = 'disconnected';
        this.stopHeartbeat();
        this.logger.warn('Disconnected from manager', { reason });
        this.emit('disconnected', reason);
      });

      this.socket.on('reconnect', (attemptNumber) => {
        this._status.connectionState = 'reconnecting';
        this.reconnectAttempts = attemptNumber;
        this.logger.info('Reconnecting to manager', { attempt: attemptNumber });
        this.emit('reconnecting', attemptNumber);
      });

      this.socket.on('connect_error', (error) => {
        this.logger.error('Connection error', { error: error.message });
        this._status.error = {
          code: 'CONNECTION_ERROR',
          message: error.message,
          timestamp: Date.now(),
        };
        if (!this._status.connected) {
          clearTimeout(timeout);
          reject(error);
        }
      });

      // Set up command listeners
      this.setupSocketListeners();
    });
  }

  /**
   * Disconnect from the manager server
   */
  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from manager');

    // Cancel all active jobs
    for (const [jobId] of this.activeJobs) {
      await this.cancelJob(jobId);
    }

    // Stop heartbeat
    this.stopHeartbeat();

    // Stop device tracking
    this.deviceManager.stopTracking();

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this._status.connected = false;
    this._status.connectionState = 'disconnected';
    this.emit('disconnected', 'manual');
  }

  /**
   * Register a job handler
   */
  registerHandler(handler: JobHandler): void {
    this.handlers.set(handler.name, handler);
    this.logger.info('Handler registered', { name: handler.name, workflows: handler.supportedWorkflows });
  }

  /**
   * Unregister a job handler
   */
  unregisterHandler(handlerName: string): void {
    this.handlers.delete(handlerName);
    this.logger.info('Handler unregistered', { name: handlerName });
  }

  /**
   * Get current worker metrics
   */
  getMetrics(): WorkerMetrics {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const avgDuration = this.jobDurations.length > 0
      ? this.jobDurations.reduce((a, b) => a + b, 0) / this.jobDurations.length
      : 0;

    // Update metrics
    this.metrics = {
      ...this.metrics,
      uptimeSeconds,
      averageJobDurationMs: Math.round(avgDuration),
      // Note: CPU and memory would need platform-specific implementation
    };

    return { ...this.metrics };
  }

  /**
   * Get device manager instance
   */
  getDeviceManager(): DeviceManager {
    return this.deviceManager;
  }

  /**
   * Get ADB controller instance
   */
  getAdbController(): AdbController {
    return this.adbController;
  }

  /**
   * Register default handlers
   */
  private registerDefaultHandlers(): void {
    // Register install handler
    const installHandler = new InstallHandler(this.adbController, this.logger);
    this.registerHandler(installHandler);

    // Register uninstall handler
    const uninstallHandler = new UninstallHandler(this.adbController, this.logger);
    this.registerHandler(uninstallHandler);
  }

  /**
   * Set up device event listeners
   */
  private setupDeviceListeners(): void {
    this.deviceManager.on('device:connected', (device: ManagedDevice) => {
      this.logger.info('Device connected', { serial: device.serial });
      this.emitDeviceEvent('device:connected', device);
    });

    this.deviceManager.on('device:disconnected', (device: ManagedDevice) => {
      this.logger.info('Device disconnected', { serial: device.serial });
      this.emitDeviceEvent('device:disconnected', device);
    });

    this.deviceManager.on('device:stateChanged', (device: ManagedDevice, previousState) => {
      this.logger.debug('Device state changed', { serial: device.serial, from: previousState, to: device.state });
      this.emitDeviceEvent('device:stateChanged', device, previousState);
    });
  }

  /**
   * Emit device event to manager
   */
  private emitDeviceEvent(event: string, device: ManagedDevice, ...args: unknown[]): void {
    if (this.socket?.connected) {
      this.socket.emit(`evt:${event}`, {
        workerId: this.workerId,
        device: {
          serial: device.serial,
          state: device.state,
          type: device.type,
        },
        ...args,
      });
    }
  }

  /**
   * Set up socket command listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Handle job execution command
    this.socket.on('cmd:execute_job', async (payload: CmdExecuteJob) => {
      this.logger.info('Received execute job command', { jobId: payload.jobId });
      await this.executeJob(payload);
    });

    // Handle job cancellation command
    this.socket.on('cmd:cancel_job', async (payload: CmdCancelJob) => {
      this.logger.info('Received cancel job command', { jobId: payload.jobId });
      await this.cancelJob(payload.jobId);
    });

    // Handle ping
    this.socket.on('cmd:ping', () => {
      this.socket?.emit('evt:pong', { workerId: this.workerId, timestamp: Date.now() });
    });
  }

  /**
   * Register worker with manager
   */
  private async registerWithManager(): Promise<void> {
    if (!this.socket) return;

    const devices = this.deviceManager.getOnlineDevices();

    this.socket.emit('evt:worker_register', {
      workerId: this.workerId,
      workerType: this.type,
      capabilities: this.capabilities,
      devices: devices.map((d) => ({
        serial: d.serial,
        state: d.state,
        type: d.type,
      })),
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      timestamp: Date.now(),
    });

    this.logger.info('Registered with manager', {
      workerId: this.workerId,
      deviceCount: devices.length,
    });
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat to manager
   */
  private sendHeartbeat(): void {
    if (!this.socket?.connected) return;

    const devices = this.deviceManager.getOnlineDevices();

    this.socket.emit('evt:heartbeat', {
      workerId: this.workerId,
      workerType: this.type,
      devices: devices.map((d) => ({
        serial: d.serial,
        state: d.state,
        currentTaskId: d.currentTaskId,
      })),
      activeJobs: Array.from(this.activeJobs.keys()),
      metrics: this.getMetrics(),
      timestamp: Date.now(),
    });

    this._status.lastHeartbeat = Date.now();
  }

  /**
   * Execute a job
   */
  private async executeJob(payload: CmdExecuteJob): Promise<void> {
    const { jobId, deviceId, workflowId, params } = payload;

    // Find handler for workflow
    const handler = this.findHandlerForWorkflow(workflowId);
    if (!handler) {
      this.logger.error('No handler found for workflow', { workflowId });
      this.emitJobComplete(jobId, deviceId, {
        success: false,
        error: {
          code: 'NO_HANDLER',
          message: `No handler registered for workflow: ${workflowId}`,
          recoverable: false,
        },
      });
      return;
    }

    // Check if device is available
    const device = this.deviceManager.getDevice(deviceId);
    if (!device || device.state !== 'idle') {
      this.logger.error('Device not available', { deviceId, state: device?.state });
      this.emitJobComplete(jobId, deviceId, {
        success: false,
        error: {
          code: 'DEVICE_UNAVAILABLE',
          message: `Device ${deviceId} is not available`,
          recoverable: true,
        },
      });
      return;
    }

    // Validate parameters
    if (handler.validate) {
      const validation = handler.validate(params);
      if (validation !== true) {
        const errorMsg = typeof validation === 'string' ? validation : 'Invalid parameters';
        this.logger.error('Job validation failed', { jobId, error: errorMsg });
        this.emitJobComplete(jobId, deviceId, {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: errorMsg,
            recoverable: false,
          },
        });
        return;
      }
    }

    // Set device as busy
    this.deviceManager.setDeviceState(deviceId, 'busy', jobId);

    // Create abort controller for this job
    const abortController = new AbortController();

    // Track active job
    const activeJob: ActiveJob = {
      jobId,
      deviceId,
      handler,
      startTime: Date.now(),
      abortController,
    };
    this.activeJobs.set(jobId, activeJob);

    // Create job context
    const context: JobContext = {
      jobId,
      deviceId,
      params,
      signal: abortController.signal,
      reportProgress: (progress, message) => this.emitJobProgress(jobId, deviceId, progress, message),
      logger: {
        debug: (msg, meta) => this.logger.debug(msg, { jobId, ...meta }),
        info: (msg, meta) => this.logger.info(msg, { jobId, ...meta }),
        warn: (msg, meta) => this.logger.warn(msg, { jobId, ...meta }),
        error: (msg, meta) => this.logger.error(msg, { jobId, ...meta }),
      },
    };

    try {
      this.logger.info('Executing job', { jobId, workflowId, deviceId });

      // Execute handler
      const result = await handler.execute(context);

      // Record metrics
      const duration = Date.now() - activeJob.startTime;
      this.recordJobCompletion(result.success, duration);

      // Emit completion
      this.emitJobComplete(jobId, deviceId, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Job execution failed', { jobId, error: errorMessage });

      // Record metrics
      const duration = Date.now() - activeJob.startTime;
      this.recordJobCompletion(false, duration);

      // Emit failure
      this.emitJobComplete(jobId, deviceId, {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: errorMessage,
          recoverable: true,
        },
      });
    } finally {
      // Cleanup
      this.activeJobs.delete(jobId);
      this.deviceManager.setDeviceState(deviceId, 'idle');

      if (handler.cleanup) {
        try {
          await handler.cleanup(context);
        } catch (cleanupError) {
          this.logger.warn('Job cleanup failed', { jobId, error: String(cleanupError) });
        }
      }
    }
  }

  /**
   * Cancel a job
   */
  private async cancelJob(jobId: string): Promise<void> {
    const activeJob = this.activeJobs.get(jobId);
    if (!activeJob) {
      this.logger.warn('Cannot cancel: job not found', { jobId });
      return;
    }

    this.logger.info('Cancelling job', { jobId });

    // Abort the job
    activeJob.abortController.abort();

    // Call cancel method if handler has one
    const handler = activeJob.handler as JobHandler & { cancel?: () => void };
    if (handler.cancel) {
      handler.cancel();
    }
  }

  /**
   * Find handler for a workflow
   */
  private findHandlerForWorkflow(workflowId: string): JobHandler | null {
    for (const handler of this.handlers.values()) {
      if (handler.supportedWorkflows.includes(workflowId)) {
        return handler;
      }
    }
    return null;
  }

  /**
   * Emit job progress event
   */
  private emitJobProgress(jobId: string, deviceId: string, progress: number, message?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('evt:job_progress', {
      workerId: this.workerId,
      jobId,
      deviceId,
      progress,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit job complete event
   */
  private emitJobComplete(jobId: string, deviceId: string, result: JobResult): void {
    if (!this.socket?.connected) return;

    this.socket.emit('evt:job_complete', {
      workerId: this.workerId,
      jobId,
      deviceId,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Record job completion for metrics
   */
  private recordJobCompletion(success: boolean, durationMs: number): void {
    this.metrics.totalJobsExecuted++;

    if (success) {
      this.metrics.successfulJobs++;
    } else {
      this.metrics.failedJobs++;
    }

    // Keep last 100 job durations for average calculation
    this.jobDurations.push(durationMs);
    if (this.jobDurations.length > 100) {
      this.jobDurations.shift();
    }
  }

  /**
   * Dispose worker and clean up resources
   */
  dispose(): void {
    this.disconnect();
    this.deviceManager.dispose();
    this.handlers.clear();
    this.removeAllListeners();
    this.logger.info('InstallWorker disposed');
  }
}

export default InstallWorker;
