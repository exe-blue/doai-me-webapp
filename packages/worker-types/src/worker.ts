/**
 * Worker type definitions
 */

// ============================================================================
// Worker Types
// ============================================================================

/**
 * Types of workers in the system
 */
export type WorkerType = 'youtube' | 'install' | 'health' | 'scrape' | 'generic' | 'registration' | 'script';

/**
 * All available worker types as a const array for runtime validation
 */
export const WORKER_TYPES: readonly WorkerType[] = [
  'youtube',
  'install',
  'health',
  'scrape',
  'generic',
  'registration',
  'script',
] as const;

// ============================================================================
// Worker Capability
// ============================================================================

/**
 * Represents a specific capability that a worker provides
 */
export interface WorkerCapability {
  /** Capability name (e.g., 'youtube_watch', 'app_install') */
  name: string;
  /** Capability version */
  version: string;
  /** Whether this capability is currently enabled */
  enabled: boolean;
  /** Optional configuration for this capability */
  config?: Record<string, unknown>;
  /** Required device features for this capability */
  requiredFeatures?: string[];
}

// ============================================================================
// Worker Configuration
// ============================================================================

/**
 * Configuration for a worker instance
 */
export interface WorkerConfig {
  /** Unique worker ID */
  workerId: string;
  /** Worker type */
  type: WorkerType;
  /** Manager server URL */
  managerUrl: string;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: number;
  /** Reconnection settings */
  reconnect: {
    /** Maximum number of reconnection attempts */
    maxAttempts: number;
    /** Initial delay between reconnection attempts in milliseconds */
    initialDelayMs: number;
    /** Maximum delay between reconnection attempts in milliseconds */
    maxDelayMs: number;
    /** Multiplier for exponential backoff */
    backoffMultiplier: number;
  };
  /** Maximum concurrent jobs this worker can handle */
  maxConcurrentJobs: number;
  /** Job timeout in milliseconds (default for all jobs) */
  defaultJobTimeoutMs: number;
  /** Worker capabilities */
  capabilities: WorkerCapability[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Job Handler
// ============================================================================

/**
 * Context provided to job handlers during execution
 */
export interface JobContext {
  /** Job ID */
  jobId: string;
  /** Device ID */
  deviceId: string;
  /** Job parameters */
  params: Record<string, unknown>;
  /** Abort signal for cancellation */
  signal: AbortSignal;
  /** Report progress callback */
  reportProgress: (progress: number, message?: string) => void;
  /** Logger instance */
  logger: {
    debug: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * Result returned by a job handler
 */
export interface JobResult {
  /** Whether the job succeeded */
  success: boolean;
  /** Result data (if successful) */
  data?: Record<string, unknown>;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Interface for job handlers
 */
export interface JobHandler {
  /** Handler name for identification */
  readonly name: string;
  /** Workflow IDs this handler can execute */
  readonly supportedWorkflows: string[];
  
  /**
   * Execute the job
   * @param context - Job execution context
   * @returns Promise resolving to job result
   */
  execute(context: JobContext): Promise<JobResult>;
  
  /**
   * Optional: Validate job parameters before execution
   * @param params - Job parameters to validate
   * @returns True if valid, or an error message if invalid
   */
  validate?(params: Record<string, unknown>): boolean | string;
  
  /**
   * Optional: Cleanup after job completion or cancellation
   * @param context - Job context for cleanup
   */
  cleanup?(context: JobContext): Promise<void>;
}

// ============================================================================
// Worker Interface
// ============================================================================

/**
 * Main interface for a worker implementation
 */
export interface WorkerInterface {
  /** Worker ID */
  readonly workerId: string;
  /** Worker type */
  readonly type: WorkerType;
  /** Current worker status */
  readonly status: WorkerStatus;
  
  /**
   * Connect to the manager
   */
  connect(): Promise<void>;
  
  /**
   * Disconnect from the manager
   */
  disconnect(): Promise<void>;
  
  /**
   * Register a job handler
   * @param handler - Job handler to register
   */
  registerHandler(handler: JobHandler): void;
  
  /**
   * Unregister a job handler
   * @param handlerName - Name of the handler to unregister
   */
  unregisterHandler(handlerName: string): void;
  
  /**
   * Get current worker metrics
   */
  getMetrics(): WorkerMetrics;
}

// ============================================================================
// Worker Status
// ============================================================================

/**
 * Current status of a worker
 */
export interface WorkerStatus {
  /** Whether the worker is connected to the manager */
  connected: boolean;
  /** Current connection state */
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  /** Last successful heartbeat timestamp */
  lastHeartbeat: number | null;
  /** Number of active jobs */
  activeJobs: number;
  /** Number of queued jobs */
  queuedJobs: number;
  /** List of registered handler names */
  registeredHandlers: string[];
  /** Current error (if any) */
  error?: {
    code: string;
    message: string;
    timestamp: number;
  };
}

/**
 * Worker metrics for monitoring
 */
export interface WorkerMetrics {
  /** Total jobs executed */
  totalJobsExecuted: number;
  /** Successful jobs */
  successfulJobs: number;
  /** Failed jobs */
  failedJobs: number;
  /** Average job duration in milliseconds */
  averageJobDurationMs: number;
  /** CPU usage percentage */
  cpuUsage: number;
  /** Memory usage percentage */
  memoryUsage: number;
  /** Uptime in seconds */
  uptimeSeconds: number;
}
