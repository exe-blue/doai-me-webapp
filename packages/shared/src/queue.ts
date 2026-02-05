// ============================================
// BullMQ Job 타입 정의
// ============================================

import type { UUID } from "./types";

// ============================================
// Queue 이름
// ============================================

export const QUEUE_NAMES = {
  VIDEO_EXECUTION: "video-execution",
  DEVICE_COMMAND: "device-command",
  METADATA_FETCH: "metadata-fetch",
  SCHEDULED_TASK: "scheduled-task",
  CLEANUP: "cleanup",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============================================
// Video Execution Job
// ============================================

export interface VideoExecutionJobData {
  executionId: UUID;
  videoId: UUID;
  youtubeId: string;
  targetWatchSeconds: number;
  priority: number;
  retryCount: number;
  maxRetries: number;
  preferredNodeId?: string;
  preferredDeviceId?: string;
  metadata?: {
    scheduleId?: UUID;
    batchId?: string;
  };
}

export interface VideoExecutionJobResult {
  success: boolean;
  executionId: UUID;
  deviceId: string;
  nodeId: string;
  actualWatchSeconds: number;
  duration: number;
  errorCode?: string;
  errorMessage?: string;
}

// ============================================
// Device Command Job
// ============================================

export type DeviceCommand =
  | "reboot"
  | "clear_cache"
  | "kill_app"
  | "screenshot"
  | "install_app"
  | "uninstall_app"
  | "shell";

export interface DeviceCommandJobData {
  commandId: UUID;
  deviceIds: string[];
  nodeId: string;
  command: DeviceCommand;
  params?: Record<string, unknown>;
  timeout?: number;
}

export interface DeviceCommandJobResult {
  commandId: UUID;
  results: {
    deviceId: string;
    success: boolean;
    result?: unknown;
    error?: string;
  }[];
}

// ============================================
// Metadata Fetch Job
// ============================================

export type MetadataFetchType = "video" | "channel" | "search";

export interface MetadataFetchJobData {
  type: MetadataFetchType;
  targetId: string; // YouTube ID 또는 검색어
  options?: {
    maxResults?: number;
    channelId?: string;
  };
  callbackData?: {
    entityId: UUID;
    entityType: "video" | "channel" | "keyword";
  };
}

export interface MetadataFetchJobResult {
  success: boolean;
  type: MetadataFetchType;
  data: unknown;
  error?: string;
}

// ============================================
// Scheduled Task Job
// ============================================

export interface ScheduledTaskJobData {
  scheduleId: UUID;
  scheduleName: string;
  videoIds: UUID[];
  config: {
    maxConcurrent: number;
    devicesPerVideo: number;
    targetWatchSeconds?: number;
  };
}

export interface ScheduledTaskJobResult {
  scheduleId: UUID;
  queuedCount: number;
  failedCount: number;
  errors?: string[];
}

// ============================================
// Cleanup Job
// ============================================

export type CleanupTarget =
  | "old_executions"
  | "old_logs"
  | "orphan_files"
  | "stale_connections";

export interface CleanupJobData {
  target: CleanupTarget;
  options: {
    olderThanDays?: number;
    limit?: number;
    dryRun?: boolean;
  };
}

export interface CleanupJobResult {
  target: CleanupTarget;
  deletedCount: number;
  freedSpace?: number;
  dryRun: boolean;
}

// ============================================
// Job Options 기본값
// ============================================

export const DEFAULT_JOB_OPTIONS = {
  [QUEUE_NAMES.VIDEO_EXECUTION]: {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
  [QUEUE_NAMES.DEVICE_COMMAND]: {
    attempts: 2,
    backoff: {
      type: "fixed" as const,
      delay: 3000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
  [QUEUE_NAMES.METADATA_FETCH]: {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 2000,
    },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  [QUEUE_NAMES.SCHEDULED_TASK]: {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
  [QUEUE_NAMES.CLEANUP]: {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
} as const;

export type JobOptions = typeof DEFAULT_JOB_OPTIONS;
