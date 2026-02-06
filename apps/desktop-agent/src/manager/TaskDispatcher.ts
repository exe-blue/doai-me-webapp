/**
 * TaskDispatcher - Dispatches jobs to workers
 * 
 * Following the Command & Control pattern:
 * - Manager (TaskDispatcher) sends commands (cmd:*)
 * - Workers send events (evt:*) for progress and completion
 */

import { EventEmitter } from 'events';
import type {
  CmdExecuteJob,
  CmdCancelJob,
  EvtJobProgress,
  EvtJobComplete,
  WorkerType,
} from '@doai/worker-types';
import type { WorkerRegistry, RegisteredWorker } from './WorkerRegistry';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Job status
 */
export type JobStatus = 'pending' | 'dispatched' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Dispatched job tracking information
 */
export interface DispatchedJob {
  /** Unique job ID */
  job_id: string;
  /** Job type / workflow ID */
  job_type: string;
  /** Worker ID handling this job */
  worker_id: string;
  /** Device IDs assigned to this job */
  device_ids: string[];
  /** Timestamp when job was dispatched */
  dispatched_at: number;
  /** Current job status */
  status: JobStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current step name */
  current_step?: string;
  /** Result data (if completed successfully) */
  result?: Record<string, unknown>;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  /** Job parameters */
  params: Record<string, unknown>;
  /** Completion timestamp */
  completed_at?: number;
  /** Execution duration in milliseconds */
  duration_ms?: number;
}

/**
 * Options for job dispatch
 */
export interface DispatchOptions {
  /** Target worker type (optional, for filtering) */
  targetWorkerType?: WorkerType;
  /** Number of devices to use (default: 1) */
  targetDeviceCount?: number;
  /** Priority (higher = more urgent) */
  priority?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    delayMs: number;
  };
}

/**
 * Configuration for TaskDispatcher
 */
export interface TaskDispatcherConfig {
  /** Default job timeout in milliseconds */
  defaultTimeoutMs: number;
  /** Default retry configuration */
  defaultRetry: {
    maxAttempts: number;
    delayMs: number;
  };
}

/**
 * Events emitted by TaskDispatcher
 */
export interface TaskDispatcherEvents {
  'job:dispatched': (job: DispatchedJob) => void;
  'job:progress': (job: DispatchedJob, progress: EvtJobProgress) => void;
  'job:complete': (job: DispatchedJob) => void;
  'job:failed': (job: DispatchedJob) => void;
  'job:cancelled': (job: DispatchedJob) => void;
}

// Default configuration
const DEFAULT_CONFIG: TaskDispatcherConfig = {
  defaultTimeoutMs: 300000,  // 5 minutes
  defaultRetry: {
    maxAttempts: 3,
    delayMs: 5000,
  },
};

// ============================================================================
// TaskDispatcher Class
// ============================================================================

export class TaskDispatcher extends EventEmitter {
  /** Map of job ID to dispatched job */
  private jobs: Map<string, DispatchedJob> = new Map();
  
  /** Worker registry reference */
  private registry: WorkerRegistry;
  
  /** Configuration */
  private config: TaskDispatcherConfig;

  constructor(registry: WorkerRegistry, config: Partial<TaskDispatcherConfig> = {}) {
    super();
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Job Dispatch
  // ==========================================================================

  /**
   * Dispatch a job to available workers
   * 
   * @param jobId - Unique job identifier
   * @param jobType - Job type / workflow ID
   * @param params - Job parameters
   * @param options - Dispatch options
   * @returns Dispatched job info, or null if no workers available
   */
  async dispatchJob(
    jobId: string,
    jobType: string,
    params: Record<string, unknown>,
    options: DispatchOptions = {}
  ): Promise<DispatchedJob | null> {
    const {
      targetWorkerType,
      targetDeviceCount = 1,
      priority = 0,
      timeoutMs = this.config.defaultTimeoutMs,
      retry = this.config.defaultRetry,
    } = options;

    // Check if job already exists
    if (this.jobs.has(jobId)) {
      logger.warn('[TaskDispatcher] Job already exists', { jobId });
      return this.jobs.get(jobId) || null;
    }

    // Find available workers
    const availableWorkers = this.findAvailableWorkers(targetWorkerType);
    
    if (availableWorkers.length === 0) {
      logger.warn('[TaskDispatcher] No available workers', {
        jobId,
        targetWorkerType,
      });
      return null;
    }

    // Select devices from available workers
    const selectedDevices = this.selectDevices(availableWorkers, targetDeviceCount);
    
    if (selectedDevices.length === 0) {
      logger.warn('[TaskDispatcher] No idle devices available', {
        jobId,
        targetDeviceCount,
      });
      return null;
    }

    // Group devices by worker
    const devicesByWorker = this.groupDevicesByWorker(selectedDevices);

    // For now, dispatch to the first worker with devices
    const [workerId, deviceIds] = Object.entries(devicesByWorker)[0];
    const worker = this.registry.getWorker(workerId);

    if (!worker) {
      logger.error('[TaskDispatcher] Worker not found after selection', { workerId });
      return null;
    }

    // Create dispatched job record
    const now = Date.now();
    const job: DispatchedJob = {
      job_id: jobId,
      job_type: jobType,
      worker_id: workerId,
      device_ids: deviceIds,
      dispatched_at: now,
      status: 'dispatched',
      progress: 0,
      params,
    };

    this.jobs.set(jobId, job);

    // Send command to worker - dispatch to each device
    for (const deviceId of deviceIds) {
      const cmdPayload: CmdExecuteJob = {
        jobId,
        workflowId: jobType,
        deviceId,
        params,
        priority,
        timeoutMs,
        retry,
      };

      logger.info('[TaskDispatcher] Dispatching job to worker', {
        jobId,
        workerId,
        deviceId,
        jobType,
      });

      worker.socket.emit('cmd:execute_job', cmdPayload);
    }

    this.emit('job:dispatched', job);

    return job;
  }

  /**
   * Find available workers, optionally filtered by type
   */
  private findAvailableWorkers(workerType?: WorkerType): RegisteredWorker[] {
    let workers = this.registry.getAvailableWorkers();
    
    if (workerType) {
      workers = workers.filter(w => w.worker_type === workerType);
    }

    return workers;
  }

  /**
   * Select devices from available workers
   */
  private selectDevices(
    workers: RegisteredWorker[],
    count: number
  ): Array<{ workerId: string; deviceId: string }> {
    const selected: Array<{ workerId: string; deviceId: string }> = [];

    for (const worker of workers) {
      for (const device of worker.devices) {
        if (device.state === 'idle' && !device.currentJobId) {
          selected.push({
            workerId: worker.worker_id,
            deviceId: device.deviceId,
          });

          if (selected.length >= count) {
            return selected;
          }
        }
      }
    }

    return selected;
  }

  /**
   * Group selected devices by worker ID
   */
  private groupDevicesByWorker(
    devices: Array<{ workerId: string; deviceId: string }>
  ): Record<string, string[]> {
    const groups: Record<string, string[]> = {};

    for (const { workerId, deviceId } of devices) {
      if (!groups[workerId]) {
        groups[workerId] = [];
      }
      groups[workerId].push(deviceId);
    }

    return groups;
  }

  // ==========================================================================
  // Job Progress & Completion
  // ==========================================================================

  /**
   * Handle job progress event from worker
   */
  handleJobProgress(data: EvtJobProgress, workerId: string): void {
    const job = this.jobs.get(data.jobId);

    if (!job) {
      logger.warn('[TaskDispatcher] Progress for unknown job', {
        jobId: data.jobId,
        workerId,
      });
      return;
    }

    if (job.worker_id !== workerId) {
      logger.warn('[TaskDispatcher] Progress from wrong worker', {
        jobId: data.jobId,
        expectedWorker: job.worker_id,
        actualWorker: workerId,
      });
      return;
    }

    // Update job progress
    job.status = 'running';
    job.progress = data.progress;
    job.current_step = data.currentStep;

    logger.debug('[TaskDispatcher] Job progress updated', {
      jobId: data.jobId,
      progress: data.progress,
      currentStep: data.currentStep,
    });

    this.emit('job:progress', job, data);
  }

  /**
   * Handle job complete event from worker
   */
  handleJobComplete(data: EvtJobComplete, workerId: string): void {
    const job = this.jobs.get(data.jobId);

    if (!job) {
      logger.warn('[TaskDispatcher] Completion for unknown job', {
        jobId: data.jobId,
        workerId,
      });
      return;
    }

    if (job.worker_id !== workerId) {
      logger.warn('[TaskDispatcher] Completion from wrong worker', {
        jobId: data.jobId,
        expectedWorker: job.worker_id,
        actualWorker: workerId,
      });
      return;
    }

    // Update job status
    job.completed_at = data.completedAt;
    job.duration_ms = data.durationMs;
    job.progress = 100;

    if (data.success) {
      job.status = 'completed';
      job.result = data.result;

      logger.info('[TaskDispatcher] Job completed successfully', {
        jobId: data.jobId,
        durationMs: data.durationMs,
      });

      this.emit('job:complete', job);
    } else {
      job.status = 'failed';
      job.error = data.error;

      logger.error('[TaskDispatcher] Job failed', {
        jobId: data.jobId,
        error: data.error?.message,
        code: data.error?.code,
      });

      this.emit('job:failed', job);
    }
  }

  // ==========================================================================
  // Job Cancellation
  // ==========================================================================

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string, reason?: string): Promise<boolean> {
    const job = this.jobs.get(jobId);

    if (!job) {
      logger.warn('[TaskDispatcher] Cancel request for unknown job', { jobId });
      return false;
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      logger.warn('[TaskDispatcher] Cannot cancel job in terminal state', {
        jobId,
        status: job.status,
      });
      return false;
    }

    const worker = this.registry.getWorker(job.worker_id);

    if (!worker) {
      logger.warn('[TaskDispatcher] Worker not found for job cancellation', {
        jobId,
        workerId: job.worker_id,
      });
      // Still mark as cancelled since we can't reach the worker
      job.status = 'cancelled';
      this.emit('job:cancelled', job);
      return true;
    }

    // Send cancel command to worker
    const cmdPayload: CmdCancelJob = {
      jobId,
      reason,
      force: false,
    };

    logger.info('[TaskDispatcher] Sending cancel command', {
      jobId,
      workerId: job.worker_id,
      reason,
    });

    worker.socket.emit('cmd:cancel_job', cmdPayload);

    job.status = 'cancelled';
    this.emit('job:cancelled', job);

    return true;
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get a job by ID
   */
  getJob(jobId: string): DispatchedJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all active jobs (not completed, failed, or cancelled)
   */
  getActiveJobs(): DispatchedJob[] {
    return Array.from(this.jobs.values()).filter(
      job => job.status === 'pending' || job.status === 'dispatched' || job.status === 'running'
    );
  }

  /**
   * Get all jobs
   */
  getAllJobs(): DispatchedJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus): DispatchedJob[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  /**
   * Get jobs by worker ID
   */
  getJobsByWorker(workerId: string): DispatchedJob[] {
    return Array.from(this.jobs.values()).filter(job => job.worker_id === workerId);
  }

  /**
   * Get active job count
   */
  getActiveJobCount(): number {
    return this.getActiveJobs().length;
  }

  /**
   * Check if a job exists
   */
  hasJob(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  /**
   * Remove completed/failed/cancelled jobs older than specified age
   */
  pruneOldJobs(maxAgeMs: number): number {
    const now = Date.now();
    const terminalStatuses: JobStatus[] = ['completed', 'failed', 'cancelled'];
    let pruned = 0;

    for (const [jobId, job] of this.jobs) {
      if (terminalStatuses.includes(job.status)) {
        const completedAt = job.completed_at || job.dispatched_at;
        if (now - completedAt > maxAgeMs) {
          this.jobs.delete(jobId);
          pruned++;
        }
      }
    }

    if (pruned > 0) {
      logger.info('[TaskDispatcher] Pruned old jobs', { count: pruned });
    }

    return pruned;
  }

  /**
   * Clear all jobs (for testing or shutdown)
   */
  clear(): void {
    this.jobs.clear();
    logger.info('[TaskDispatcher] Cleared all jobs');
  }
}

// Type augmentation for EventEmitter
export interface TaskDispatcher {
  on<E extends keyof TaskDispatcherEvents>(
    event: E,
    listener: TaskDispatcherEvents[E]
  ): this;
  
  off<E extends keyof TaskDispatcherEvents>(
    event: E,
    listener: TaskDispatcherEvents[E]
  ): this;
  
  emit<E extends keyof TaskDispatcherEvents>(
    event: E,
    ...args: Parameters<TaskDispatcherEvents[E]>
  ): boolean;
  
  once<E extends keyof TaskDispatcherEvents>(
    event: E,
    listener: TaskDispatcherEvents[E]
  ): this;
}

export default TaskDispatcher;
