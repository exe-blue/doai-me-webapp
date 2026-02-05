/**
 * Event types for Manager-Worker communication
 * Following the Command & Control pattern:
 * - Manager sends commands (cmd:*)
 * - Worker sends events (evt:*)
 */

import type { WorkerType, WorkerCapability } from './worker';
import type { DeviceState } from './device';

// ============================================================================
// Command Payloads (Manager -> Worker)
// ============================================================================

/**
 * Payload for cmd:execute_job command
 */
export interface CmdExecuteJob {
  /** Unique job execution ID */
  jobId: string;
  /** Workflow ID to execute */
  workflowId: string;
  /** Target device ID */
  deviceId: string;
  /** Job parameters */
  params: Record<string, unknown>;
  /** Job priority (higher = more urgent) */
  priority?: number;
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    delayMs: number;
  };
}

/**
 * Payload for cmd:cancel_job command
 */
export interface CmdCancelJob {
  /** Job ID to cancel */
  jobId: string;
  /** Reason for cancellation */
  reason?: string;
  /** Whether to force immediate cancellation */
  force?: boolean;
}

/**
 * Payload for cmd:ping command
 */
export interface CmdPing {
  /** Timestamp when ping was sent */
  timestamp: number;
  /** Optional correlation ID */
  correlationId?: string;
}

// ============================================================================
// Event Payloads (Worker -> Manager)
// ============================================================================

/**
 * Payload for evt:register event
 */
export interface EvtWorkerRegister {
  /** Unique worker ID */
  workerId: string;
  /** Worker type */
  workerType: WorkerType;
  /** Worker capabilities */
  capabilities: WorkerCapability[];
  /** Worker version */
  version: string;
  /** Host machine information */
  host: {
    hostname: string;
    platform: string;
    arch: string;
  };
  /** Maximum concurrent jobs this worker can handle */
  maxConcurrentJobs: number;
  /** List of connected device IDs */
  connectedDevices: string[];
}

/**
 * Payload for evt:heartbeat event
 */
export interface EvtHeartbeat {
  /** Worker ID */
  workerId: string;
  /** Current timestamp */
  timestamp: number;
  /** Worker health metrics */
  metrics: {
    /** CPU usage percentage (0-100) */
    cpuUsage: number;
    /** Memory usage percentage (0-100) */
    memoryUsage: number;
    /** Number of active jobs */
    activeJobs: number;
    /** Number of queued jobs */
    queuedJobs: number;
    /** Uptime in seconds */
    uptimeSeconds: number;
  };
  /** Connected devices with their states */
  devices: Array<{
    deviceId: string;
    state: DeviceState;
    currentJobId?: string;
  }>;
}

/**
 * Payload for evt:job_progress event
 */
export interface EvtJobProgress {
  /** Job ID */
  jobId: string;
  /** Device ID executing the job */
  deviceId: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current step name */
  currentStep?: string;
  /** Total number of steps */
  totalSteps?: number;
  /** Current step index (0-based) */
  currentStepIndex?: number;
  /** Optional message describing current activity */
  message?: string;
  /** Timestamp of this progress update */
  timestamp: number;
}

/**
 * Payload for evt:job_complete event
 */
export interface EvtJobComplete {
  /** Job ID */
  jobId: string;
  /** Device ID that executed the job */
  deviceId: string;
  /** Whether the job succeeded */
  success: boolean;
  /** Job result data (if successful) */
  result?: Record<string, unknown>;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    stack?: string;
    recoverable: boolean;
  };
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Timestamp when job completed */
  completedAt: number;
  /** Number of retry attempts made */
  retryCount: number;
}

/**
 * Payload for evt:pong event
 */
export interface EvtPong {
  /** Timestamp when pong was sent */
  timestamp: number;
  /** Original ping timestamp for RTT calculation */
  pingTimestamp: number;
  /** Optional correlation ID from ping */
  correlationId?: string;
}

// ============================================================================
// Socket Event Interfaces
// ============================================================================

/**
 * Events sent from Manager to Worker
 */
export interface ManagerToWorkerEvents {
  'cmd:execute_job': (payload: CmdExecuteJob) => void;
  'cmd:cancel_job': (payload: CmdCancelJob) => void;
  'cmd:ping': (payload: CmdPing) => void;
}

/**
 * Events sent from Worker to Manager
 */
export interface WorkerToManagerEvents {
  'evt:register': (payload: EvtWorkerRegister) => void;
  'evt:heartbeat': (payload: EvtHeartbeat) => void;
  'evt:job_progress': (payload: EvtJobProgress) => void;
  'evt:job_complete': (payload: EvtJobComplete) => void;
  'evt:pong': (payload: EvtPong) => void;
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Extract the payload type for a manager-to-worker event
 */
export type ManagerEventPayload<E extends keyof ManagerToWorkerEvents> = 
  Parameters<ManagerToWorkerEvents[E]>[0];

/**
 * Extract the payload type for a worker-to-manager event
 */
export type WorkerEventPayload<E extends keyof WorkerToManagerEvents> = 
  Parameters<WorkerToManagerEvents[E]>[0];
