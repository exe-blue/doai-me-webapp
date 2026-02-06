// ============================================
// DoAi.Me Worker Core - Base Worker
// Manager-Worker 통신을 위한 추상 기반 클래스
// ============================================

import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';
import os from 'os';

// @doai/worker-types imports
import type {
  // Event payloads
  CmdExecuteJob,
  CmdCancelJob,
  CmdPing,
  EvtWorkerRegister,
  EvtHeartbeat,
  EvtJobProgress,
  EvtJobComplete,
  EvtPong,
  // Socket event interfaces
  ManagerToWorkerEvents,
  WorkerToManagerEvents,
  // Worker types
  WorkerType,
  WorkerCapability,
  WorkerConfig,
  JobContext,
  JobResult,
  JobHandler,
  WorkerStatus,
  WorkerMetrics,
  // Device types
  DeviceState,
} from '@doai/worker-types';

// Local imports
import { AdbController } from './AdbController';
import { DeviceManager, ManagedDevice } from './DeviceManager';
import { Logger, defaultLogger } from './Logger';
import { InternalQueue } from './InternalQueue';
import type { InternalQueueStore } from './InternalQueueStore';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Typed Socket.IO client for Manager-Worker communication
 */
type TypedSocket = Socket<ManagerToWorkerEvents, WorkerToManagerEvents>;

/**
 * Active job tracking information
 */
interface ActiveJob {
  jobId: string;
  deviceId: string;
  workflowId: string;
  abortController: AbortController;
  startedAt: number;
  handler: JobHandler;
}

/**
 * BaseWorker event types
 */
export interface BaseWorkerEvents {
  'connected': () => void;
  'disconnected': (reason: string) => void;
  'reconnecting': (attempt: number) => void;
  'registered': () => void;
  'job:started': (jobId: string, deviceId: string) => void;
  'job:progress': (jobId: string, progress: number) => void;
  'job:completed': (jobId: string, success: boolean) => void;
  'job:cancelled': (jobId: string) => void;
  'error': (error: Error) => void;
}

// ============================================================================
// BaseWorker Abstract Class
// ============================================================================

/**
 * Base Worker 추상 클래스
 * Manager와 Socket.IO 기반 통신을 수행하는 Worker의 기반 구현
 * 
 * @example
 * ```typescript
 * class YouTubeWorker extends BaseWorker {
 *   get type(): WorkerType { return 'youtube'; }
 *   get capabilities(): WorkerCapability[] {
 *     return [{ name: 'youtube_watch', version: '1.0.0', enabled: true }];
 *   }
 * }
 * 
 * const worker = new YouTubeWorker(config);
 * worker.registerJobHandler(new YouTubeWatchHandler());
 * await worker.connect();
 * ```
 */
export abstract class BaseWorker extends EventEmitter {
  // Protected properties - accessible to subclasses
  protected readonly config: WorkerConfig;
  protected socket: TypedSocket | null = null;
  protected readonly adb: AdbController;
  protected readonly deviceManager: DeviceManager;
  protected readonly logger: Logger;

  // InternalQueue (opt-in: subclass calls enableInternalQueue() in constructor)
  protected internalQueue?: InternalQueue;

  // Private properties
  private readonly jobHandlers: Map<string, JobHandler> = new Map();
  private readonly activeJobs: Map<string, ActiveJob> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly startTime: number;
  private jobsCompleted: number = 0;
  private jobsFailed: number = 0;
  private connectionState: WorkerStatus['connectionState'] = 'disconnected';
  private lastHeartbeat: number | null = null;
  private reconnectAttempts: number = 0;

  /**
   * Worker 생성자
   * @param config Worker 설정
   */
  constructor(config: WorkerConfig) {
    super();
    this.config = config;
    this.startTime = Date.now();
    this.logger = defaultLogger.child(`Worker:${config.workerId}`);
    
    // Initialize ADB and Device Manager
    this.adb = new AdbController({ logger: this.logger.child('ADB') });
    this.deviceManager = new DeviceManager({
      adbController: this.adb,
      logger: this.logger.child('DeviceManager'),
      autoStartTracking: false, // We'll start it manually in connect()
    });

    this.logger.info('BaseWorker initialized', {
      workerId: config.workerId,
      managerUrl: config.managerUrl,
    });
  }

  // ============================================================================
  // InternalQueue (Opt-in)
  // ============================================================================

  /**
   * Enable internal queue for job buffering.
   * Call in subclass constructor to opt-in.
   * @param store Optional persistent store (default: in-memory only)
   */
  protected enableInternalQueue(store?: InternalQueueStore): void {
    this.internalQueue = new InternalQueue({
      store,
      saveDebounceMs: 1000,
    });
    this.logger.info('InternalQueue enabled', { persistent: !!store });
  }

  /**
   * Process the next queued job for a device that just became idle.
   * Called automatically after job completion when InternalQueue is enabled.
   */
  private async processNextQueuedJob(deviceSerial: string): Promise<void> {
    if (!this.internalQueue) return;

    const nextJob = await this.internalQueue.dequeue(deviceSerial);
    if (!nextJob) return;

    this.logger.info('Processing queued job', {
      jobId: nextJob.id,
      deviceId: nextJob.deviceId,
      workflowId: nextJob.workflowId,
    });

    // Synthesize a CmdExecuteJob payload
    const payload: CmdExecuteJob = {
      jobId: nextJob.id,
      workflowId: nextJob.workflowId,
      deviceId: nextJob.deviceId,
      params: nextJob.params,
      timeoutMs: nextJob.timeoutMs,
    };

    await this.handleExecuteJob(payload);
  }

  // ============================================================================
  // Abstract Methods - Must be implemented by subclasses
  // ============================================================================

  /**
   * Worker 타입 반환
   */
  abstract get type(): WorkerType;

  /**
   * Worker 기능 목록 반환
   */
  abstract get capabilities(): WorkerCapability[];

  // ============================================================================
  // Public Getters
  // ============================================================================

  /**
   * Worker ID 반환
   */
  get id(): string {
    return this.config.workerId;
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Manager에 연결
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      this.logger.warn('Already connected to manager');
      return;
    }

    this.connectionState = 'connecting';
    this.logger.info('Connecting to manager', { url: this.config.managerUrl });

    try {
      // Start device tracking first
      await this.deviceManager.startTracking();
      this.logger.info('Device tracking started');

      // Create Socket.IO connection
      this.socket = io(this.config.managerUrl, {
        timeout: this.config.connectionTimeoutMs,
        reconnection: true,
        reconnectionAttempts: this.config.reconnect.maxAttempts,
        reconnectionDelay: this.config.reconnect.initialDelayMs,
        reconnectionDelayMax: this.config.reconnect.maxDelayMs,
        auth: {
          workerId: this.config.workerId,
          workerType: this.type,
        },
      }) as TypedSocket;

      // Set up socket event handlers
      this.setupSocketHandlers();

      // Wait for connection
      await this.waitForConnection();

      // Register with manager
      this.register();

      // Start heartbeat
      this.startHeartbeat();

      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      this.logger.info('Connected to manager successfully');
      this.emit('connected');
    } catch (error) {
      this.connectionState = 'disconnected';
      this.logger.errorWithStack('Failed to connect to manager', error as Error);
      throw error;
    }
  }

  /**
   * Manager 연결 해제
   */
  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from manager');

    // Stop heartbeat
    this.stopHeartbeat();

    // Cancel all active jobs
    for (const [jobId] of this.activeJobs) {
      await this.handleCancelJob({ jobId, reason: 'Worker disconnecting', force: true });
    }

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Stop device tracking
    this.deviceManager.stopTracking();

    this.connectionState = 'disconnected';
    this.logger.info('Disconnected from manager');
    this.emit('disconnected', 'manual');
  }

  /**
   * 연결 완료 대기
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.connectionTimeoutMs);

      this.socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ============================================================================
  // Socket Event Handlers Setup
  // ============================================================================

  /**
   * Socket.IO 이벤트 핸들러 설정
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.logger.info('Socket connected');
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      
      // Re-register after reconnection
      this.register();
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.warn('Socket disconnected', { reason });
      this.connectionState = 'disconnected';
      this.emit('disconnected', reason);
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.reconnectAttempts = attempt;
      this.connectionState = 'reconnecting';
      this.logger.info('Reconnection attempt', { attempt });
      this.emit('reconnecting', attempt);
    });

    this.socket.io.on('reconnect', () => {
      this.logger.info('Reconnected to manager');
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
    });

    this.socket.io.on('reconnect_failed', () => {
      this.logger.error('Reconnection failed - all attempts exhausted');
      this.connectionState = 'disconnected';
      this.emit('error', new Error('Reconnection failed'));
    });

    // Command handlers with ACK
    this.socket.on('cmd:execute_job', ((payload: CmdExecuteJob, ack?: (response: { received: boolean; error?: string }) => void) => {
      this.logger.info('Received cmd:execute_job', { jobId: payload.jobId });
      
      // Acknowledge receipt
      if (typeof ack === 'function') {
        ack({ received: true });
      }
      
      // Handle the job asynchronously
      this.handleExecuteJob(payload).catch((error) => {
        this.logger.errorWithStack('Error handling execute_job', error as Error);
      });
    }) as ManagerToWorkerEvents['cmd:execute_job']);

    this.socket.on('cmd:cancel_job', ((payload: CmdCancelJob, ack?: (response: { received: boolean; cancelled: boolean; error?: string }) => void) => {
      this.logger.info('Received cmd:cancel_job', { jobId: payload.jobId });
      
      this.handleCancelJob(payload)
        .then((cancelled) => {
          if (typeof ack === 'function') {
            ack({ received: true, cancelled });
          }
        })
        .catch((error) => {
          this.logger.errorWithStack('Error handling cancel_job', error as Error);
          if (typeof ack === 'function') {
            ack({ received: true, cancelled: false, error: (error as Error).message });
          }
        });
    }) as ManagerToWorkerEvents['cmd:cancel_job']);

    this.socket.on('cmd:ping', ((payload: CmdPing) => {
      this.logger.debug('Received cmd:ping');
      
      const pongPayload: EvtPong = {
        timestamp: Date.now(),
        pingTimestamp: payload.timestamp,
        correlationId: payload.correlationId,
      };
      
      this.socket?.emit('evt:pong', pongPayload);
    }) as ManagerToWorkerEvents['cmd:ping']);
  }

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Manager에 Worker 등록
   */
  private register(): void {
    if (!this.socket) {
      this.logger.warn('Cannot register: socket not connected');
      return;
    }

    const connectedDevices = this.deviceManager
      .getOnlineDevices()
      .map((d) => d.serial);

    const registerPayload: EvtWorkerRegister = {
      workerId: this.config.workerId,
      workerType: this.type,
      capabilities: this.capabilities,
      version: '1.0.0', // TODO: Get from package.json
      host: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
      },
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      connectedDevices,
    };

    this.socket.emit('evt:register', registerPayload);
    this.logger.info('Registered with manager', {
      workerId: this.config.workerId,
      deviceCount: connectedDevices.length,
    });
    
    this.emit('registered');
  }

  // ============================================================================
  // Heartbeat Management
  // ============================================================================

  /**
   * Heartbeat 전송 시작
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      this.stopHeartbeat();
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);

    // Send initial heartbeat
    this.sendHeartbeat();
    this.logger.debug('Heartbeat started', { intervalMs: this.config.heartbeatIntervalMs });
  }

  /**
   * Heartbeat 전송 중지
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.logger.debug('Heartbeat stopped');
    }
  }

  /**
   * Heartbeat 전송
   */
  private sendHeartbeat(): void {
    if (!this.socket?.connected) {
      return;
    }

    const devices = this.deviceManager.getDevices();
    const deviceStates = devices.map((device) => ({
      deviceId: device.serial,
      state: this.mapManagedStateToDeviceState(device.state),
      currentJobId: device.currentTaskId,
    }));

    // Get system metrics
    const cpuUsage = this.getCpuUsage();
    const memUsage = os.freemem() / os.totalmem();
    const memoryUsage = Math.round((1 - memUsage) * 100);
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    const heartbeatPayload: EvtHeartbeat = {
      workerId: this.config.workerId,
      timestamp: Date.now(),
      metrics: {
        cpuUsage,
        memoryUsage,
        activeJobs: this.activeJobs.size,
        queuedJobs: this.internalQueue?.getTotalQueuedJobs() ?? 0,
        uptimeSeconds,
      },
      devices: deviceStates,
    };

    this.socket.emit('evt:heartbeat', heartbeatPayload);
    this.lastHeartbeat = Date.now();
    this.logger.debug('Heartbeat sent', {
      deviceCount: devices.length,
      activeJobs: this.activeJobs.size,
    });
  }

  /**
   * ManagedDeviceState를 DeviceState로 변환
   */
  private mapManagedStateToDeviceState(state: string): DeviceState {
    const stateMap: Record<string, DeviceState> = {
      idle: 'idle',
      busy: 'running',
      error: 'error',
      offline: 'disconnected',
      maintenance: 'quarantine',
    };
    return stateMap[state] || 'idle';
  }

  /**
   * CPU 사용률 계산 (간단한 근사치)
   */
  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    return Math.round((1 - totalIdle / totalTick) * 100);
  }

  // ============================================================================
  // Job Execution
  // ============================================================================

  /**
   * Job 실행 명령 처리
   */
  private async handleExecuteJob(payload: CmdExecuteJob): Promise<void> {
    const { jobId, workflowId, deviceId, params, timeoutMs } = payload;

    this.logger.info('Handling execute job', { jobId, workflowId, deviceId });

    // Find the handler for this workflow
    const handler = this.findHandlerForWorkflow(workflowId);
    if (!handler) {
      this.logger.error('No handler found for workflow', { workflowId });
      this.emitJobComplete(jobId, deviceId, {
        success: false,
        error: {
          code: 'HANDLER_NOT_FOUND',
          message: `No handler registered for workflow: ${workflowId}`,
          recoverable: false,
        },
      }, 0);
      return;
    }

    // Check if device is available
    const device = this.deviceManager.getDevice(deviceId);
    if (!device) {
      this.logger.error('Device not found', { deviceId });
      this.emitJobComplete(jobId, deviceId, {
        success: false,
        error: {
          code: 'DEVICE_NOT_FOUND',
          message: `Device not found: ${deviceId}`,
          recoverable: true,
        },
      }, 0);
      return;
    }

    if (device.state !== 'idle') {
      this.logger.error('Device not available', { deviceId, state: device.state });
      this.emitJobComplete(jobId, deviceId, {
        success: false,
        error: {
          code: 'DEVICE_BUSY',
          message: `Device is not available: ${device.state}`,
          recoverable: true,
        },
      }, 0);
      return;
    }

    // Validate parameters if handler supports it
    if (handler.validate) {
      const validationResult = handler.validate(params);
      if (validationResult !== true) {
        const errorMessage = typeof validationResult === 'string' 
          ? validationResult 
          : 'Parameter validation failed';
        this.logger.error('Parameter validation failed', { jobId, error: errorMessage });
        this.emitJobComplete(jobId, deviceId, {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: errorMessage,
            recoverable: false,
          },
        }, 0);
        return;
      }
    }

    // Execute the job
    await this.executeJob(jobId, deviceId, workflowId, handler, params, timeoutMs);
  }

  /**
   * Job 실행
   */
  private async executeJob(
    jobId: string,
    deviceId: string,
    workflowId: string,
    handler: JobHandler,
    params: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<void> {
    const startTime = Date.now();
    const abortController = new AbortController();
    const effectiveTimeout = timeoutMs ?? this.config.defaultJobTimeoutMs;

    // Track active job
    const activeJob: ActiveJob = {
      jobId,
      deviceId,
      workflowId,
      abortController,
      startedAt: startTime,
      handler,
    };
    this.activeJobs.set(jobId, activeJob);

    // Mark device as busy
    this.deviceManager.setDeviceState(deviceId, 'busy', jobId);

    // Emit job started event
    this.emit('job:started', jobId, deviceId);
    this.logger.info('Job started', { jobId, deviceId, workflowId });

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      this.logger.warn('Job timeout reached', { jobId, timeoutMs: effectiveTimeout });
      abortController.abort();
    }, effectiveTimeout);

    try {
      // Create job context
      const context: JobContext = {
        jobId,
        deviceId,
        params,
        signal: abortController.signal,
        reportProgress: (progress: number, message?: string) => {
          this.emitJobProgress(jobId, deviceId, progress, message);
        },
        logger: {
          debug: (msg, meta) => this.logger.debug(`[Job:${jobId}] ${msg}`, meta),
          info: (msg, meta) => this.logger.info(`[Job:${jobId}] ${msg}`, meta),
          warn: (msg, meta) => this.logger.warn(`[Job:${jobId}] ${msg}`, meta),
          error: (msg, meta) => this.logger.error(`[Job:${jobId}] ${msg}`, meta),
        },
      };

      // Execute handler
      const result = await handler.execute(context);
      const duration = Date.now() - startTime;

      if (result.success) {
        this.jobsCompleted++;
        this.logger.info('Job completed successfully', { jobId, duration });
      } else {
        this.jobsFailed++;
        this.logger.warn('Job completed with failure', { jobId, duration, error: result.error });
      }

      this.emitJobComplete(jobId, deviceId, result, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.jobsFailed++;

      const isAborted = (error as Error).name === 'AbortError' || abortController.signal.aborted;
      
      this.logger.errorWithStack(
        isAborted ? 'Job cancelled/timed out' : 'Job execution error',
        error as Error,
        { jobId, duration }
      );

      this.emitJobComplete(jobId, deviceId, {
        success: false,
        error: {
          code: isAborted ? 'JOB_CANCELLED' : 'EXECUTION_ERROR',
          message: (error as Error).message,
          recoverable: !isAborted,
        },
      }, duration);
    } finally {
      clearTimeout(timeoutHandle);
      
      // Cleanup
      this.activeJobs.delete(jobId);
      this.deviceManager.setDeviceState(deviceId, 'idle');

      // Call handler cleanup if available
      if (handler.cleanup) {
        try {
          await handler.cleanup({
            jobId,
            deviceId,
            params,
            signal: abortController.signal,
            reportProgress: () => {},
            logger: {
              debug: (msg, meta) => this.logger.debug(`[Cleanup:${jobId}] ${msg}`, meta),
              info: (msg, meta) => this.logger.info(`[Cleanup:${jobId}] ${msg}`, meta),
              warn: (msg, meta) => this.logger.warn(`[Cleanup:${jobId}] ${msg}`, meta),
              error: (msg, meta) => this.logger.error(`[Cleanup:${jobId}] ${msg}`, meta),
            },
          });
        } catch (cleanupError) {
          this.logger.errorWithStack('Handler cleanup error', cleanupError as Error, { jobId });
        }
      }

      // Process next queued job for this device (if InternalQueue is enabled)
      if (this.internalQueue) {
        this.processNextQueuedJob(deviceId).catch(err => {
          this.logger.error('Failed to process next queued job', { deviceId, error: (err as Error).message });
        });
      }
    }
  }

  /**
   * Workflow ID에 해당하는 핸들러 찾기
   */
  private findHandlerForWorkflow(workflowId: string): JobHandler | undefined {
    for (const handler of this.jobHandlers.values()) {
      if (handler.supportedWorkflows.includes(workflowId)) {
        return handler;
      }
    }
    return undefined;
  }

  /**
   * Job 진행 상황 이벤트 발송
   */
  private emitJobProgress(
    jobId: string,
    deviceId: string,
    progress: number,
    message?: string
  ): void {
    if (!this.socket?.connected) return;

    const progressPayload: EvtJobProgress = {
      jobId,
      deviceId,
      progress: Math.min(100, Math.max(0, progress)),
      message,
      timestamp: Date.now(),
    };

    this.socket.emit('evt:job_progress', progressPayload);
    this.emit('job:progress', jobId, progress);
    this.logger.debug('Job progress', { jobId, progress, message });
  }

  /**
   * Job 완료 이벤트 발송
   */
  private emitJobComplete(
    jobId: string,
    deviceId: string,
    result: JobResult,
    durationMs: number
  ): void {
    if (!this.socket?.connected) return;

    const completePayload: EvtJobComplete = {
      jobId,
      deviceId,
      success: result.success,
      result: result.data,
      error: result.error ? {
        code: result.error.code,
        message: result.error.message,
        recoverable: result.error.recoverable,
      } : undefined,
      durationMs,
      completedAt: Date.now(),
      retryCount: 0, // BaseWorker doesn't track retries internally
    };

    this.socket.emit('evt:job_complete', completePayload);
    this.emit('job:completed', jobId, result.success);
  }

  // ============================================================================
  // Job Cancellation
  // ============================================================================

  /**
   * Job 취소 명령 처리
   */
  private async handleCancelJob(payload: CmdCancelJob): Promise<boolean> {
    const { jobId, reason, force } = payload;
    
    const activeJob = this.activeJobs.get(jobId);
    if (!activeJob) {
      this.logger.warn('Cannot cancel: job not found', { jobId });
      return false;
    }

    this.logger.info('Cancelling job', { jobId, reason, force });

    // Abort the job
    activeJob.abortController.abort();

    // If force, we don't wait for cleanup
    if (force) {
      this.activeJobs.delete(jobId);
      this.deviceManager.setDeviceState(activeJob.deviceId, 'idle');
    }

    this.emit('job:cancelled', jobId);
    return true;
  }

  // ============================================================================
  // Job Handler Management
  // ============================================================================

  /**
   * Job 핸들러 등록
   * @param handler Job 핸들러
   */
  registerJobHandler(handler: JobHandler): void {
    if (this.jobHandlers.has(handler.name)) {
      this.logger.warn('Handler already registered, replacing', { name: handler.name });
    }

    this.jobHandlers.set(handler.name, handler);
    this.logger.info('Job handler registered', {
      name: handler.name,
      workflows: handler.supportedWorkflows,
    });
  }

  /**
   * Job 핸들러 해제
   * @param handlerName 핸들러 이름
   */
  unregisterJobHandler(handlerName: string): void {
    if (this.jobHandlers.delete(handlerName)) {
      this.logger.info('Job handler unregistered', { name: handlerName });
    }
  }

  // ============================================================================
  // Status and Metrics
  // ============================================================================

  /**
   * Worker 상태 반환
   */
  getStatus(): WorkerStatus {
    return {
      connected: this.socket?.connected ?? false,
      connectionState: this.connectionState,
      lastHeartbeat: this.lastHeartbeat,
      activeJobs: this.activeJobs.size,
      queuedJobs: this.internalQueue?.getTotalQueuedJobs() ?? 0,
      registeredHandlers: Array.from(this.jobHandlers.keys()),
    };
  }

  /**
   * Worker 메트릭 반환
   */
  getMetrics(): WorkerMetrics {
    const totalJobs = this.jobsCompleted + this.jobsFailed;
    const memUsage = os.freemem() / os.totalmem();

    return {
      totalJobsExecuted: totalJobs,
      successfulJobs: this.jobsCompleted,
      failedJobs: this.jobsFailed,
      averageJobDurationMs: 0, // Would need to track for accurate calculation
      cpuUsage: this.getCpuUsage(),
      memoryUsage: Math.round((1 - memUsage) * 100),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  // ============================================================================
  // Type-safe Event Emitter Overloads
  // ============================================================================

  /**
   * Type-safe event listener registration
   */
  on<K extends keyof BaseWorkerEvents>(
    event: K,
    listener: BaseWorkerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  /**
   * Type-safe event emission
   */
  emit<K extends keyof BaseWorkerEvents>(
    event: K,
    ...args: Parameters<BaseWorkerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

export default BaseWorker;
