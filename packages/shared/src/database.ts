/**
 * Unified Supabase Database Types
 *
 * Single source of truth for all database types used by both
 * apps/backend and apps/dashboard.
 *
 * IMPORTANT: Use `type` aliases instead of `interface` for Row/Insert/Update types.
 * TypeScript interfaces don't satisfy `extends Record<string, unknown>` in conditional types,
 * which breaks @supabase/supabase-js generic type inference (v2.90+).
 *
 * 참고: 실제 프로덕션에서는 supabase gen types 명령으로 자동 생성 권장
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > database.ts
 */

// ============================================
// 기본 타입
// ============================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================
// 노드 (PC)
// ============================================

export type NodeStatus = 'online' | 'offline' | 'error';

export type Node = {
  id: string;
  name: string | null;
  status: NodeStatus;
  ip_address: string | null;
  device_capacity: number;
  cpu_usage: number | null;
  memory_usage: number | null;
  connected_devices: number;
  last_seen: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type NodeInsert = {
  id: string;
  name?: string | null;
  status?: NodeStatus;
  ip_address?: string | null;
  device_capacity?: number;
  cpu_usage?: number | null;
  memory_usage?: number | null;
  connected_devices?: number;
  last_seen?: string | null;
  metadata?: Json;
};

export type NodeUpdate = {
  name?: string | null;
  status?: NodeStatus;
  ip_address?: string | null;
  device_capacity?: number;
  cpu_usage?: number | null;
  memory_usage?: number | null;
  connected_devices?: number;
  last_seen?: string | null;
  metadata?: Json;
};

// ============================================
// 디바이스 (스마트폰)
// ============================================

export type DeviceStatus = 'online' | 'offline' | 'busy' | 'error';

export type Device = {
  id: string;
  pc_id: string | null;
  device_number: number | null;
  serial_number: string | null;
  ip_address: string | null;
  model: string | null;
  android_version: string | null;
  connection_type: string;
  usb_port: number | null;
  status: DeviceStatus;
  battery_level: number | null;
  last_heartbeat: string | null;
  last_task_at: string | null;
  error_count: number;
  last_error: string | null;
  last_error_at: string | null;
  management_code: string | null;
  created_at: string;
  updated_at: string;
};

export type DeviceInsert = {
  id: string;
  pc_id?: string | null;
  device_number?: number | null;
  serial_number?: string | null;
  ip_address?: string | null;
  model?: string | null;
  android_version?: string | null;
  connection_type?: string;
  usb_port?: number | null;
  status?: DeviceStatus;
  battery_level?: number | null;
  last_heartbeat?: string | null;
  last_task_at?: string | null;
  error_count?: number;
  last_error?: string | null;
  last_error_at?: string | null;
};

export type DeviceUpdate = {
  pc_id?: string | null;
  device_number?: number | null;
  serial_number?: string | null;
  ip_address?: string | null;
  model?: string | null;
  android_version?: string | null;
  connection_type?: string;
  usb_port?: number | null;
  status?: DeviceStatus;
  battery_level?: number | null;
  last_heartbeat?: string | null;
  last_task_at?: string | null;
  error_count?: number;
  last_error?: string | null;
  last_error_at?: string | null;
};

// ============================================
// 디바이스 상태 (실시간)
// ============================================

export type DeviceStateRecord = {
  id: string;
  device_id: string;
  pc_id: string | null;
  status: DeviceStatus;
  current_workflow_id: string | null;
  current_step: string | null;
  progress: number;
  error_message: string | null;
  battery_level: number | null;
  last_heartbeat: string;
  updated_at: string;
};

// ============================================
// 워크플로우
// ============================================

export type WorkflowStep = {
  id: string;
  action: 'adb' | 'system' | 'wait' | 'condition' | 'celery' | 'appium';
  script?: string;
  command?: string;
  params?: Record<string, unknown>;
  celery_task?: string;
  celery_params?: Record<string, unknown>;
  /** Appium task name (e.g. 'youtube_watch', 'youtube_search_and_watch') */
  appium_task?: string;
  /** Appium task parameters */
  appium_params?: Record<string, unknown>;
  timeout?: number;
  retry?: { attempts: number; delay: number; backoff: string };
  onError?: 'fail' | 'skip' | 'goto';
  nextOnError?: string;
};

export type Workflow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
  steps: WorkflowStep[];
  params: Json;
  params_schema: Json;
  timeout: number;
  retry_policy: Json;
  is_active: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type WorkflowInsert = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  version?: number;
  steps: WorkflowStep[];
  params?: Json;
  params_schema?: Json;
  timeout?: number;
  retry_policy?: Json;
  is_active?: boolean;
  tags?: string[];
};

export type WorkflowUpdate = {
  name?: string;
  description?: string | null;
  category?: string | null;
  version?: number;
  steps?: WorkflowStep[];
  params?: Json;
  params_schema?: Json;
  timeout?: number;
  retry_policy?: Json;
  is_active?: boolean;
  tags?: string[];
};

// ============================================
// 워크플로우 실행
// ============================================

export type ExecutionStatus = 'queued' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';

export type WorkflowExecution = {
  id: string;
  execution_id: string | null;
  workflow_id: string | null;
  workflow_version: number | null;
  device_id: string | null;
  device_ids: string[];
  node_id: string | null;
  node_ids: string[];
  status: ExecutionStatus;
  params: Json;
  result: Json | null;
  error_message: string | null;
  current_step: string | null;
  progress: number;
  total_devices: number;
  completed_devices: number;
  failed_devices: number;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowExecutionInsert = {
  workflow_id: string;
  device_id?: string | null;
  device_ids?: string[];
  node_id?: string | null;
  node_ids?: string[];
  execution_id?: string | null;
  workflow_version?: number | null;
  status?: ExecutionStatus;
  params?: Json;
  total_devices?: number;
  triggered_by?: string | null;
};

export type WorkflowExecutionUpdate = {
  status?: ExecutionStatus;
  result?: Json | null;
  error_message?: string | null;
  current_step?: string | null;
  progress?: number;
  completed_devices?: number;
  failed_devices?: number;
  started_at?: string | null;
  completed_at?: string | null;
};

// ============================================
// 실행 로그
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogStatus = 'started' | 'progress' | 'completed' | 'failed' | 'skipped' | 'retrying';

export type ExecutionLog = {
  id: number;
  execution_id: string | null;
  device_id: string | null;
  workflow_id: string | null;
  step_id: string | null;
  level: LogLevel;
  status: LogStatus | null;
  message: string | null;
  data: Json;
  details: Json;
  created_at: string;
};

export type ExecutionLogInsert = {
  execution_id?: string | null;
  device_id?: string | null;
  workflow_id?: string | null;
  step_id?: string | null;
  level?: LogLevel;
  status?: LogStatus | null;
  message?: string | null;
  data?: Json;
  details?: Json;
};

// ============================================
// 시스템 설정
// ============================================

export type Setting = {
  key: string;
  value: Json;
  description: string | null;
  updated_at: string;
};

// ============================================
// 알림
// ============================================

export type AlertLevel = 'critical' | 'warning' | 'info';

export type Alert = {
  id: number;
  level: AlertLevel | null;
  message: string;
  source: string | null;
  data: Json;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

export type AlertInsert = {
  level?: AlertLevel | null;
  message: string;
  source?: string | null;
  data?: Json;
  acknowledged?: boolean;
};

// ============================================
// 작업 (Job)
// ============================================

export type Job = {
  id: string;
  title: string;
  keyword?: string | null;
  duration_sec?: number;
  target_group?: string | null;
  target_url: string;
  video_url?: string | null;
  script_type?: string;
  duration_min_pct?: number;
  duration_max_pct?: number;
  prob_like?: number;
  like_probability?: number;
  prob_comment?: number;
  prob_playlist?: number;
  base_reward?: number;
  is_active?: boolean;
  total_assignments?: number;
  created_at: string;
  updated_at?: string;
};

export type JobInsert = {
  title: string;
  keyword?: string | null;
  duration_sec?: number;
  target_group?: string | null;
  target_url: string;
  video_url?: string | null;
  script_type?: string;
  duration_min_pct?: number;
  duration_max_pct?: number;
  prob_like?: number;
  like_probability?: number;
  prob_comment?: number;
  prob_playlist?: number;
  base_reward?: number;
  is_active?: boolean;
  total_assignments?: number;
};

export type JobUpdate = {
  title?: string;
  keyword?: string | null;
  duration_sec?: number;
  target_group?: string | null;
  target_url?: string;
  video_url?: string | null;
  script_type?: string;
  duration_min_pct?: number;
  duration_max_pct?: number;
  prob_like?: number;
  like_probability?: number;
  prob_comment?: number;
  prob_playlist?: number;
  base_reward?: number;
  is_active?: boolean;
  total_assignments?: number;
  updated_at?: string;
};

// ============================================
// 작업 할당 (Job Assignment)
// ============================================

export type JobAssignment = {
  id: string;
  job_id: string;
  device_id: string;
  device_serial?: string;
  status: 'pending' | 'paused' | 'running' | 'completed' | 'failed' | 'cancelled';
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
  // Join된 job 정보 (선택적)
  jobs?: Job;
};

export type JobAssignmentInsert = {
  job_id: string;
  device_id: string;
  device_serial?: string;
  status?: 'pending' | 'paused' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress_pct?: number;
  assigned_at?: string;
};

export type JobAssignmentUpdate = {
  status?: 'pending' | 'paused' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress_pct?: number;
  final_duration_sec?: number;
  did_like?: boolean;
  did_comment?: boolean;
  did_playlist?: boolean;
  error_log?: string;
  error_code?: string | null;
  retry_count?: number;
  started_at?: string;
  completed_at?: string;
};

// ============================================
// 급여 로그 (Salary Log)
// ============================================

export type SalaryLog = {
  id: string;
  assignment_id: string;
  job_id: string;
  watch_percentage: number;
  actual_duration_sec: number;
  rank_in_group?: number;
  created_at: string;
};

export type SalaryLogInsert = {
  assignment_id: string;
  job_id: string;
  watch_percentage: number;
  actual_duration_sec: number;
  rank_in_group?: number;
};

// ============================================
// Scrcpy 명령 (Scrcpy Command)
// ============================================

export type ScrcpyCommand = {
  id: string;
  device_id: string;
  pc_id: string;
  command_type: 'scrcpy_start' | 'scrcpy_stop';
  options: Record<string, unknown>;
  status: 'pending' | 'received' | 'executing' | 'completed' | 'failed' | 'timeout';
  process_pid?: number | null;
  error_message?: string | null;
  created_at: string;
  received_at?: string | null;
  completed_at?: string | null;
};

export type ScrcpyCommandInsert = {
  device_id: string;
  pc_id: string;
  command_type: 'scrcpy_start' | 'scrcpy_stop';
  options?: Record<string, unknown>;
  status?: 'pending' | 'received' | 'executing' | 'completed' | 'failed' | 'timeout';
};

export type ScrcpyCommandUpdate = {
  status?: 'pending' | 'received' | 'executing' | 'completed' | 'failed' | 'timeout';
  process_pid?: number | null;
  error_message?: string | null;
  received_at?: string | null;
  completed_at?: string | null;
};

// ============================================
// 채널 (Channel) — DB 테이블용
// NOTE: 앱 레이어 Channel 타입은 packages/shared/src/types.ts에 별도 정의
// ============================================

export type DbChannel = {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_url: string;
  is_active: boolean;
  last_video_id?: string;
  last_checked_at?: string;
  check_interval_min: number;
  default_duration_sec: number;
  default_prob_like: number;
  default_prob_comment: number;
  default_prob_playlist: number;
  created_at: string;
  updated_at: string;
};

export type DbChannelInsert = {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  is_active?: boolean;
  last_video_id?: string;
  last_checked_at?: string;
  check_interval_min?: number;
  default_duration_sec?: number;
  default_prob_like?: number;
  default_prob_comment?: number;
  default_prob_playlist?: number;
};

export type DbChannelUpdate = {
  channel_name?: string;
  channel_url?: string;
  is_active?: boolean;
  last_video_id?: string;
  last_checked_at?: string;
  check_interval_min?: number;
  default_duration_sec?: number;
  default_prob_like?: number;
  default_prob_comment?: number;
  default_prob_playlist?: number;
  updated_at?: string;
};

// ============================================
// 댓글 (Comment)
// ============================================

export type DbComment = {
  id: string;
  job_id?: string;
  channel_id?: string;
  content: string;
  is_used: boolean;
  used_by_device_id?: string;
  used_at?: string;
  created_at: string;
};

export type DbCommentInsert = {
  job_id?: string;
  channel_id?: string;
  content: string;
  is_used?: boolean;
};

export type DbCommentUpdate = {
  content?: string;
  is_used?: boolean;
  used_by_device_id?: string;
  used_at?: string;
};

// ============================================
// 스크립트 (Script)
// ============================================

export type ScriptType = 'adb_shell' | 'python' | 'uiautomator2' | 'javascript';
export type ScriptStatus = 'draft' | 'active' | 'archived';

export type Script = {
  id: string;
  name: string;
  description: string | null;
  type: ScriptType;
  content: string;
  version: number;
  target_group: string | null;
  tags: string[];
  params_schema: Json;
  default_params: Json;
  timeout_ms: number;
  status: ScriptStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ScriptInsert = {
  name: string;
  type: ScriptType;
  content: string;
  description?: string | null;
  version?: number;
  target_group?: string | null;
  tags?: string[];
  params_schema?: Json;
  default_params?: Json;
  timeout_ms?: number;
  status?: ScriptStatus;
  created_by?: string | null;
};

export type ScriptUpdate = {
  name?: string;
  description?: string | null;
  type?: ScriptType;
  content?: string;
  version?: number;
  target_group?: string | null;
  tags?: string[];
  params_schema?: Json;
  default_params?: Json;
  timeout_ms?: number;
  status?: ScriptStatus;
};

// ============================================
// 스크립트 실행 (Script Execution)
// ============================================

export type ScriptExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';

export type ScriptExecution = {
  id: string;
  script_id: string;
  script_version: number;
  device_ids: string[];
  pc_ids: string[];
  params: Json;
  status: ScriptExecutionStatus;
  total_devices: number;
  completed_devices: number;
  failed_devices: number;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScriptExecutionInsert = {
  script_id: string;
  script_version: number;
  device_ids?: string[];
  pc_ids?: string[];
  params?: Json;
  status?: ScriptExecutionStatus;
  total_devices?: number;
  triggered_by?: string | null;
};

export type ScriptExecutionUpdate = {
  status?: ScriptExecutionStatus;
  completed_devices?: number;
  failed_devices?: number;
  started_at?: string | null;
  completed_at?: string | null;
};

// ============================================
// 스크립트 디바이스 결과 (Script Device Result)
// ============================================

export type ScriptDeviceResultStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type ScriptDeviceResult = {
  id: string;
  execution_id: string;
  device_id: string;
  management_code: string | null;
  status: ScriptDeviceResultStatus;
  output: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ScriptDeviceResultInsert = {
  execution_id: string;
  device_id: string;
  management_code?: string | null;
  status?: ScriptDeviceResultStatus;
};

export type ScriptDeviceResultUpdate = {
  status?: ScriptDeviceResultStatus;
  output?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
};

// ============================================
// 모니터링 채널 (Legacy)
// ============================================

export type MonitoredChannel = {
  id: string;
  channel_id: string;
  channel_name: string;
  is_active: boolean;
  last_video_id?: string;
  last_checked_at?: string;
  preset_settings?: {
    duration_min_pct?: number;
    duration_max_pct?: number;
    prob_like?: number;
    prob_comment?: number;
    prob_playlist?: number;
  };
  created_at: string;
  updated_at: string;
};

// ============================================
// 통계 타입
// ============================================

export type DeviceStats = {
  total: number;
  online: number;
  offline: number;
  busy: number;
  error: number;
};

export type NodeDeviceSummary = {
  node_id: string;
  node_name: string | null;
  node_status: NodeStatus;
  total_devices: number;
  online_devices: number;
  busy_devices: number;
  error_devices: number;
};

export type SystemOverview = {
  online_nodes: number;
  total_nodes: number;
  total_devices: number;
  online_devices: number;
  busy_devices: number;
  error_devices: number;
  running_workflows: number;
  unacknowledged_alerts: number;
};

// ============================================
// Database 스키마 타입 (Supabase 클라이언트용)
// ============================================

export type Database = {
  public: {
    Tables: {
      nodes: {
        Row: Node;
        Insert: NodeInsert;
        Update: NodeUpdate;
        Relationships: [];
      };
      devices: {
        Row: Device;
        Insert: DeviceInsert;
        Update: DeviceUpdate;
        Relationships: [];
      };
      device_states: {
        Row: DeviceStateRecord;
        Insert: Partial<DeviceStateRecord> & { device_id: string };
        Update: Partial<DeviceStateRecord>;
        Relationships: [];
      };
      workflows: {
        Row: Workflow;
        Insert: WorkflowInsert;
        Update: WorkflowUpdate;
        Relationships: [];
      };
      workflow_executions: {
        Row: WorkflowExecution;
        Insert: WorkflowExecutionInsert;
        Update: WorkflowExecutionUpdate;
        Relationships: [];
      };
      execution_logs: {
        Row: ExecutionLog;
        Insert: ExecutionLogInsert;
        Update: Partial<ExecutionLog>;
        Relationships: [];
      };
      settings: {
        Row: Setting;
        Insert: { key: string; value: Json; description?: string };
        Update: { value?: Json; description?: string };
        Relationships: [];
      };
      alerts: {
        Row: Alert;
        Insert: AlertInsert;
        Update: Partial<Alert>;
        Relationships: [];
      };
      jobs: {
        Row: Job;
        Insert: JobInsert;
        Update: JobUpdate;
        Relationships: [];
      };
      job_assignments: {
        Row: JobAssignment;
        Insert: JobAssignmentInsert;
        Update: JobAssignmentUpdate;
        Relationships: [];
      };
      salary_logs: {
        Row: SalaryLog;
        Insert: SalaryLogInsert;
        Update: Partial<SalaryLog>;
        Relationships: [];
      };
      scrcpy_commands: {
        Row: ScrcpyCommand;
        Insert: ScrcpyCommandInsert;
        Update: ScrcpyCommandUpdate;
        Relationships: [];
      };
      channels: {
        Row: DbChannel;
        Insert: DbChannelInsert;
        Update: DbChannelUpdate;
        Relationships: [];
      };
      comments: {
        Row: DbComment;
        Insert: DbCommentInsert;
        Update: DbCommentUpdate;
        Relationships: [];
      };
      monitored_channels: {
        Row: MonitoredChannel;
        Insert: Partial<MonitoredChannel> & { channel_id: string; channel_name: string };
        Update: Partial<MonitoredChannel>;
        Relationships: [];
      };
      scripts: {
        Row: Script;
        Insert: ScriptInsert;
        Update: ScriptUpdate;
        Relationships: [];
      };
      script_executions: {
        Row: ScriptExecution;
        Insert: ScriptExecutionInsert;
        Update: ScriptExecutionUpdate;
        Relationships: [];
      };
      script_device_results: {
        Row: ScriptDeviceResult;
        Insert: ScriptDeviceResultInsert;
        Update: ScriptDeviceResultUpdate;
        Relationships: [];
      };
    };
    Views: {
      system_overview: {
        Row: SystemOverview;
        Relationships: [];
      };
    };
    Functions: {
      get_device_status_counts: {
        Args: Record<string, never>;
        Returns: { status: string; count: number }[];
      };
      get_node_device_summary: {
        Args: { p_pc_id: string | null };
        Returns: NodeDeviceSummary[];
      };
      cleanup_old_data: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      update_device_status_with_error: {
        Args: { p_device_id: string; p_last_error: string | null };
        Returns: undefined;
      };
      exec_sql: {
        Args: { query: string; params: (string | null)[] };
        Returns: undefined;
      };
      increment_device_error_count: {
        Args: { device_id: string };
        Returns: undefined;
      };
      increment_execution_device_count: {
        Args: { exec_id: string; count_type: string };
        Returns: undefined;
      };
      increment_workflow_version: {
        Args: { workflow_id: string };
        Returns: { version: number }[];
      };
      increment_script_version: {
        Args: { p_script_id: string };
        Returns: { version: number }[];
      };
      increment_script_exec_count: {
        Args: { p_execution_id: string; p_count_type: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// ============================================
// Type Helpers
// ============================================

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof Database
}
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;
