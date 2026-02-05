/**
 * Supabase Database Types
 * 
 * 참고: 실제 프로덕션에서는 supabase gen types 명령으로 자동 생성 권장
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types.ts
 */

// ============================================
// 기본 타입
// ============================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================
// 노드 (PC)
// ============================================

export type NodeStatus = 'online' | 'offline' | 'error';

export interface Node {
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
}

export interface NodeInsert {
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
}

export interface NodeUpdate {
  name?: string | null;
  status?: NodeStatus;
  ip_address?: string | null;
  device_capacity?: number;
  cpu_usage?: number | null;
  memory_usage?: number | null;
  connected_devices?: number;
  last_seen?: string | null;
  metadata?: Json;
}

// ============================================
// 디바이스 (스마트폰)
// ============================================

export type DeviceState = 'DISCONNECTED' | 'IDLE' | 'QUEUED' | 'RUNNING' | 'ERROR' | 'QUARANTINE';

export interface Device {
  id: string;
  node_id: string | null;
  serial_number: string | null;
  name: string | null;
  state: DeviceState;
  model: string | null;
  android_version: string | null;
  battery: number | null;
  ip_address: string | null;
  error_count: number;
  last_error: string | null;
  last_workflow_id: string | null;
  last_seen: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface DeviceInsert {
  id: string;
  node_id?: string | null;
  serial_number?: string | null;
  name?: string | null;
  state?: DeviceState;
  model?: string | null;
  android_version?: string | null;
  battery?: number | null;
  ip_address?: string | null;
  error_count?: number;
  last_error?: string | null;
  last_workflow_id?: string | null;
  last_seen?: string | null;
  metadata?: Json;
}

export interface DeviceUpdate {
  node_id?: string | null;
  serial_number?: string | null;
  name?: string | null;
  state?: DeviceState;
  model?: string | null;
  android_version?: string | null;
  battery?: number | null;
  ip_address?: string | null;
  error_count?: number;
  last_error?: string | null;
  last_workflow_id?: string | null;
  last_seen?: string | null;
  metadata?: Json;
}

// ============================================
// 디바이스 상태 (실시간)
// ============================================

export interface DeviceStateRecord {
  id: string;
  device_id: string;
  node_id: string | null;
  state: DeviceState;
  current_workflow_id: string | null;
  current_step: string | null;
  progress: number;
  error_message: string | null;
  battery: number | null;
  last_heartbeat: string;
  updated_at: string;
}

// ============================================
// 워크플로우
// ============================================

export interface WorkflowStep {
  id: string;
  action: 'autox' | 'adb' | 'wait' | 'system' | 'condition';
  script?: string;
  params?: Record<string, unknown>;
  timeout?: number;
  retry?: { max: number; delay: number };
  onError?: 'continue' | 'fail' | 'skip';
}

export interface Workflow {
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
}

export interface WorkflowInsert {
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
}

export interface WorkflowUpdate {
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
}

// ============================================
// 워크플로우 실행
// ============================================

export type ExecutionStatus = 'queued' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';

export interface WorkflowExecution {
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
}

export interface WorkflowExecutionInsert {
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
}

export interface WorkflowExecutionUpdate {
  status?: ExecutionStatus;
  result?: Json | null;
  error_message?: string | null;
  current_step?: string | null;
  progress?: number;
  completed_devices?: number;
  failed_devices?: number;
  started_at?: string | null;
  completed_at?: string | null;
}

// ============================================
// 실행 로그
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogStatus = 'started' | 'progress' | 'completed' | 'failed' | 'skipped' | 'retrying';

export interface ExecutionLog {
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
}

export interface ExecutionLogInsert {
  execution_id?: string | null;
  device_id?: string | null;
  workflow_id?: string | null;
  step_id?: string | null;
  level?: LogLevel;
  status?: LogStatus | null;
  message?: string | null;
  data?: Json;
  details?: Json;
}

// ============================================
// 시스템 설정
// ============================================

export interface Setting {
  key: string;
  value: Json;
  description: string | null;
  updated_at: string;
}

// ============================================
// 알림
// ============================================

export type AlertLevel = 'critical' | 'warning' | 'info';

export interface Alert {
  id: number;
  level: AlertLevel | null;
  message: string;
  source: string | null;
  data: Json;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface AlertInsert {
  level?: AlertLevel | null;
  message: string;
  source?: string | null;
  data?: Json;
  acknowledged?: boolean;
}

// ============================================
// 통계 타입
// ============================================

export interface DeviceStats {
  total: number;
  DISCONNECTED: number;
  IDLE: number;
  QUEUED: number;
  RUNNING: number;
  ERROR: number;
  QUARANTINE: number;
}

export interface NodeDeviceSummary {
  node_id: string;
  node_name: string | null;
  node_status: NodeStatus;
  total_devices: number;
  idle_devices: number;
  running_devices: number;
  error_devices: number;
}

export interface SystemOverview {
  online_nodes: number;
  total_nodes: number;
  total_devices: number;
  idle_devices: number;
  running_devices: number;
  error_devices: number;
  running_workflows: number;
  unacknowledged_alerts: number;
}

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
    };
    Views: {
      system_overview: {
        Row: SystemOverview;
        Relationships: [];
      };
    };
    Functions: {
      get_device_state_counts: {
        Args: Record<string, never>;
        Returns: { state: string; count: number }[];
      };
      get_node_device_summary: {
        Args: { p_node_id: string | null };
        Returns: NodeDeviceSummary[];
      };
      cleanup_old_data: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      update_device_state_with_error: {
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
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
