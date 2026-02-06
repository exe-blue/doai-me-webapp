/**
 * Socket.IO 이벤트 타입 정의 (공유)
 * 
 * Backend ↔ Desktop Agent 간 통신 이벤트
 */

// ============================================
// 이벤트 이름
// ============================================

export const SOCKET_EVENTS = {
  // 서버 → 에이전트
  EXECUTE_WORKFLOW: 'EXECUTE_WORKFLOW',
  CANCEL_WORKFLOW: 'CANCEL_WORKFLOW',
  PING: 'PING',
  
  // 에이전트 → 서버
  REGISTER: 'REGISTER',
  DEVICE_STATUS: 'DEVICE_STATUS',
  WORKFLOW_PROGRESS: 'WORKFLOW_PROGRESS',
  WORKFLOW_COMPLETE: 'WORKFLOW_COMPLETE',
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  PONG: 'PONG',
} as const;

// ============================================
// 워크플로우 타입
// ============================================

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  timeout: number;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  action: 'autox' | 'adb' | 'system' | 'wait' | 'condition';
  script?: string;
  command?: string;
  timeout: number;
  retry: {
    attempts: number;
    delay: number;
    backoff: 'fixed' | 'exponential' | string;
  };
  onError: 'fail' | 'skip' | 'goto';
  nextOnError?: string;
}

// ============================================
// 서버 → 에이전트 이벤트
// ============================================

export interface ExecuteWorkflowEvent {
  job_id: string;
  workflow_id: string;
  workflow: WorkflowDefinition;
  device_ids: string[];
  params: Record<string, unknown>;
}

export interface CancelWorkflowEvent {
  job_id: string;
}

// ============================================
// 에이전트 → 서버 이벤트
// ============================================

export interface RegisterEvent {
  node_id: string;
  version?: string;
  device_count?: number;
}

export interface DeviceStatusEvent {
  node_id: string;
  devices: {
    id: string;
    state: DeviceState;
    battery?: number;
    screen_on?: boolean;
    current_workflow?: string;
    current_step?: string;
    progress?: number;
  }[];
  system?: {
    cpu?: number;
    memory?: number;
  };
}

export interface WorkflowProgressEvent {
  job_id: string;
  device_id: string;
  current_step: string;
  progress: number;
  message?: string;
}

export interface WorkflowCompleteEvent {
  job_id: string;
  device_id: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface WorkflowErrorEvent {
  job_id: string;
  device_id: string;
  step_id: string;
  error: string;
  retry_count: number;
}

// ============================================
// 상태 타입
// ============================================

export type DeviceState = 
  | 'DISCONNECTED'
  | 'IDLE'
  | 'RUNNING'
  | 'COMPLETED'
  | 'ERROR'
  | 'QUARANTINE';

export type LegacyNodeStatus = 'online' | 'offline';

export interface NodeState {
  status: LegacyNodeStatus;
  device_count: number;
  active_jobs?: number;
  cpu?: number;
  memory?: number;
  last_seen: number;
}

export interface DeviceStateData {
  state: DeviceState;
  node_id?: string;
  workflow_id?: string;
  current_step?: string;
  progress?: number;
  error_message?: string;
  error_count?: number;
  last_heartbeat?: number;
}

// ============================================
// Job 타입
// ============================================

export interface WorkflowJobData {
  job_id: string;
  workflow_id: string;
  workflow: WorkflowDefinition;
  device_ids: string[];
  node_id: string;
  params: Record<string, unknown>;
  created_at: number;
}

export interface WorkflowJobResult {
  job_id: string;
  total: number;
  success: number;
  failed: number;
  duration_ms: number;
  device_results: DeviceResult[];
}

export interface DeviceResult {
  device_id: string;
  success: boolean;
  error?: string;
  duration_ms: number;
}
