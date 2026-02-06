// ============================================
// DoAi.Me 공통 타입 정의
// Backend와 Frontend가 공유하는 "언어(Type)"
// ============================================

// ============================================
// 공통 타입
// ============================================

export type UUID = string;
export type ISODateString = string;

// ============================================
// 비디오 관련
// ============================================

export interface Video {
  id: UUID;
  youtube_id: string;
  title: string;
  channel_id: UUID | null;
  channel_name: string;
  thumbnail_url: string;
  duration_seconds: number;
  view_count: number;
  published_at: ISODateString;
  category: string | null;
  tags: string[];
  status: "active" | "paused" | "archived";
  priority: number;
  target_watch_seconds: number;
  total_executions: number;
  total_watch_time: number;
  search_keyword?: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface Channel {
  id: UUID;
  youtube_id: string;
  name: string;
  handle: string | null;
  thumbnail_url: string;
  subscriber_count: number;
  video_count: number;
  auto_collect: boolean;
  last_collected_at: ISODateString | null;
  status: "active" | "paused";
  created_at: ISODateString;
}

export interface Keyword {
  id: UUID;
  keyword: string;
  category: string | null;
  auto_collect: boolean;
  max_results: number;
  last_collected_at: ISODateString | null;
  video_count: number;
  status: "active" | "paused";
  created_at: ISODateString;
}

// ============================================
// 디바이스 관련
// ============================================

export type DeviceStatus = "online" | "offline" | "busy" | "error" | "maintenance" | "idle";

export type DeviceHealthStatus = "healthy" | "zombie" | "offline";

export interface Device {
  id: UUID;
  device_id: string; // S9-001 형식
  serial_number: string; // ADB serial
  node_id: string;
  name: string;
  status: DeviceStatus;
  battery_level: number;
  temperature: number;
  ip_address: string;
  last_seen_at: ISODateString;
  current_task_id: UUID | null;
  total_tasks: number;
  success_rate: number;
  error_count: number;
  uptime_seconds: number;
  created_at: ISODateString;

  // Legacy fields for backward compatibility
  pc_id?: string;
  group_id?: string;
  last_heartbeat_at?: string | null;
  last_job_activity_at?: string | null;
  adb_connected?: boolean;
  consecutive_failures?: number;
  health_status?: DeviceHealthStatus;
  scrcpy_running?: boolean;
  scrcpy_pid?: number | null;
  ip?: string;
  slotNum?: number;
  boardId?: string;
  slotId?: string;
  connection_info?: DeviceConnectionInfo;
}

export interface DeviceConnectionInfo {
  pcCode?: string;
  slotNum?: number;
  adbConnected?: boolean;
}

export type IssueType =
  | "app_crash"
  | "network_error"
  | "adb_disconnect"
  | "low_battery"
  | "high_temperature"
  | "memory_full"
  | "screen_freeze"
  | "unknown";

export type IssueSeverity = "critical" | "high" | "medium" | "low";
export type IssueStatus = "open" | "in_progress" | "resolved" | "ignored";

export interface DeviceIssue {
  id: UUID;
  device_id: UUID;
  type: IssueType;
  severity: IssueSeverity;
  status: IssueStatus;
  message: string;
  details: Record<string, unknown>;
  auto_recoverable: boolean;
  recovery_attempts: number;
  resolved_at: ISODateString | null;
  resolved_by: string | null;
  created_at: ISODateString;
}

// ============================================
// 작업 실행 관련
// ============================================

export type ExecutionStatus =
  | "pending"
  | "queued"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout"
  | "partial";

/**
 * Maps DB execution status to application ExecutionStatus.
 * Use this when reading from database to ensure type safety.
 */
export function mapDbExecutionStatus(dbStatus: string): ExecutionStatus {
  const validStatuses: ExecutionStatus[] = [
    "pending", "queued", "assigned", "running", 
    "completed", "failed", "cancelled", "timeout", "partial"
  ];
  
  if (validStatuses.includes(dbStatus as ExecutionStatus)) {
    return dbStatus as ExecutionStatus;
  }
  
  console.warn(`Unknown execution status from DB: ${dbStatus}, defaulting to 'pending'`);
  return "pending";
}

export interface VideoExecution {
  id: UUID;
  video_id: UUID;
  device_id: UUID | null;
  node_id: string | null;
  schedule_id: UUID | null;
  status: ExecutionStatus;
  priority: number;
  target_watch_seconds: number;
  actual_watch_seconds: number | null;
  progress: number; // 0-100
  started_at: ISODateString | null;
  completed_at: ISODateString | null;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  metadata: ExecutionMetadata;
  created_at: ISODateString;
}

export interface ExecutionMetadata {
  ip_address?: string;
  user_agent?: string;
  resolution?: string;
  playback_quality?: string;
  buffering_count?: number;
  ads_skipped?: number;
  screenshot_url?: string;
}

// ============================================
// 스케줄 관련
// ============================================

export type ScheduleType = "once" | "interval" | "cron";
export type ScheduleStatus = "active" | "paused" | "completed";

export interface Schedule {
  id: UUID;
  name: string;
  type: ScheduleType;
  config: ScheduleConfig;
  video_ids: UUID[];
  video_count: number;
  status: ScheduleStatus;
  last_run_at: ISODateString | null;
  next_run_at: ISODateString | null;
  total_runs: number;
  created_at: ISODateString;
}

export interface ScheduleConfig {
  // once
  run_at?: ISODateString;
  // interval
  interval_minutes?: number;
  // cron
  cron_expression?: string;
  // 공통
  timezone?: string;
  max_concurrent?: number;
  devices_per_video?: number;
}

// ============================================
// 노드 관련
// ============================================

export type NodeStatus = "online" | "offline" | "degraded" | "maintenance" | "starting";

/**
 * DB node status values (may differ from application layer)
 */
export type DbNodeStatus = "online" | "offline" | "degraded" | "maintenance" | "starting" | "unknown";

/**
 * Maps DB node status to application NodeStatus.
 * Use this when reading from database to ensure type safety.
 */
export function mapDbNodeStatus(dbStatus: string): NodeStatus {
  const statusMap: Record<string, NodeStatus> = {
    "online": "online",
    "offline": "offline",
    "degraded": "degraded",
    "maintenance": "maintenance",
    "starting": "starting",
    "unknown": "offline", // Map unknown to offline
  };
  
  const mapped = statusMap[dbStatus];
  if (mapped) {
    return mapped;
  }
  
  console.warn(`Unknown node status from DB: ${dbStatus}, defaulting to 'offline'`);
  return "offline";
}

export interface Node {
  id: string; // node-1, node-2, ...
  name: string;
  status: NodeStatus;
  ip_address: string;
  device_count: number;
  online_devices: number;
  busy_devices: number;
  active_tasks: number;
  cpu_usage: number;
  memory_usage: number;
  last_heartbeat: ISODateString;
  version: string;
}

// ============================================
// 리포트 관련
// ============================================

export interface DailyReport {
  date: string; // YYYY-MM-DD
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  cancelled_tasks: number;
  total_watch_time: number;
  avg_watch_time: number;
  unique_videos: number;
  active_devices: number;
  error_rate: number;
  tasks_per_hour: number[];
}

// ============================================
// 시스템 로그
// ============================================

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug";
export type LogSource = "api" | "worker" | "device" | "database" | "network" | "scheduler";

export interface SystemLog {
  id: UUID;
  timestamp: ISODateString;
  level: LogLevel;
  source: LogSource;
  component: string;
  message: string;
  details?: Record<string, unknown>;
  stack_trace?: string;
  node_id?: string;
  device_id?: string;
  request_id?: string;
}

// ============================================
// Legacy: Job 관련 타입 (하위 호환성)
// ============================================

export type JobScriptType = "youtube_watch" | "youtube_search" | "custom";

export interface Job {
  id: string;
  title: string;
  keyword?: string | null;
  target_url: string;
  video_url?: string | null;
  duration_sec?: number;
  duration_min_pct?: number;
  duration_max_pct?: number;
  prob_like?: number;
  prob_comment?: number;
  prob_playlist?: number;
  like_probability?: number;
  script_type?: JobScriptType;
  target_group?: string | null;
  base_reward?: number;
  is_active?: boolean;
  total_assignments?: number;
  created_at: string;
  updated_at?: string;
}

export type JobAssignmentStatus =
  | "pending"
  | "paused"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobAssignment {
  id: string;
  job_id: string;
  device_id: string;
  device_serial?: string;
  status: JobAssignmentStatus;
  progress_pct: number;
  final_duration_sec?: number;
  did_like?: boolean;
  did_comment?: boolean;
  did_playlist?: boolean;
  error_log?: string;
  error_code?: string | null;
  retry_count?: number;
  assigned_at: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  jobs?: Job;
}

export interface SalaryLog {
  id: string;
  assignment_id: string;
  job_id: string;
  watch_percentage: number;
  actual_duration_sec: number;
  rank_in_group?: number;
  created_at: string;
}

// ============================================
// Scrcpy 관련 타입
// ============================================

export type ScrcpyCommandType =
  | "start"
  | "stop"
  | "tap"
  | "swipe"
  | "text"
  | "key"
  | "back"
  | "home";

export interface ScrcpyCommand {
  type: ScrcpyCommandType;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  text?: string;
  keycode?: number;
}

// ============================================
// Worker 관련 타입
// ============================================

export interface WorkerHeartbeat {
  pcId: string;
  devices: WorkerDeviceInfo[];
  timestamp?: number;
}

export interface WorkerDeviceInfo {
  serialNumber: string;
  status: DeviceStatus;
  slotNum?: number;
  boardId?: string;
  ip?: string;
  adbConnected?: boolean;
  currentJob?: string;
}

// ============================================
// API Response 타입
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
