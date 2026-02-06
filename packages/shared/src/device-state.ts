/**
 * 디바이스 상태 정의
 * 상태 머신의 가능한 상태값 정의
 */

// ============================================
// 상태 상수
// ============================================

/**
 * 디바이스 상태 상수
 * 
 * 상태 흐름:
 * DISCONNECTED ←──────────────────┐
 *       │                         │
 *       ▼ (adb 연결됨)            │ (연결 끊김)
 *    [IDLE] ◄─────────────┐       │
 *       │                 │       │
 *       ▼ (작업 할당)     │       │
 *   [RUNNING] ────────────┤       │
 *       │                 │       │
 *       ├──▶ [COMPLETED] ─┘       │
 *       │                         │
 *       └──▶ [ERROR] ─────────────┘
 *                │
 *                └──▶ (재시도 3회 실패) → [QUARANTINE]
 */
export const DeviceStates = {
  /** 연결 끊김 (heartbeat 30초 초과) */
  DISCONNECTED: 'DISCONNECTED',
  /** 대기 중, 작업 수락 가능 */
  IDLE: 'IDLE',
  /** 워크플로우 실행 중 */
  RUNNING: 'RUNNING',
  /** 워크플로우 완료 (→ IDLE로 자동 전이) */
  COMPLETED: 'COMPLETED',
  /** 복구 가능한 오류 (재시도 중) */
  ERROR: 'ERROR',
  /** 격리 상태 (수동 개입 필요, 계속 실패하는 기기) */
  QUARANTINE: 'QUARANTINE',
} as const;

/**
 * 디바이스 상태 타입
 */
export type DeviceState = typeof DeviceStates[keyof typeof DeviceStates];

/**
 * 모든 상태 목록
 */
export const ALL_DEVICE_STATES: DeviceState[] = Object.values(DeviceStates);

// ============================================
// 상태 메타데이터
// ============================================

/**
 * 각 상태의 메타데이터
 */
export interface DeviceStateMetadata {
  /** 상태 이름 */
  name: DeviceState;
  /** 표시 이름 */
  displayName: string;
  /** 설명 */
  description: string;
  /** UI 색상 */
  color: string;
  /** 작업 수락 가능 여부 */
  canAcceptWork: boolean;
  /** 자동 복구 시도 가능 여부 */
  canAutoRecover: boolean;
}

/**
 * 상태별 메타데이터 맵
 */
export const DEVICE_STATE_METADATA: Record<DeviceState, DeviceStateMetadata> = {
  [DeviceStates.DISCONNECTED]: {
    name: DeviceStates.DISCONNECTED,
    displayName: '연결 끊김',
    description: 'Heartbeat 타임아웃으로 연결이 끊긴 상태',
    color: '#6b7280', // gray
    canAcceptWork: false,
    canAutoRecover: true,
  },
  [DeviceStates.IDLE]: {
    name: DeviceStates.IDLE,
    displayName: '대기 중',
    description: '작업을 수락할 준비가 된 상태',
    color: '#22c55e', // green
    canAcceptWork: true,
    canAutoRecover: false,
  },
  [DeviceStates.RUNNING]: {
    name: DeviceStates.RUNNING,
    displayName: '실행 중',
    description: '워크플로우를 실행 중인 상태',
    color: '#3b82f6', // blue
    canAcceptWork: false,
    canAutoRecover: false,
  },
  [DeviceStates.COMPLETED]: {
    name: DeviceStates.COMPLETED,
    displayName: '완료',
    description: '워크플로우가 성공적으로 완료된 상태 (→ IDLE로 자동 전이)',
    color: '#10b981', // emerald
    canAcceptWork: false,
    canAutoRecover: false,
  },
  [DeviceStates.ERROR]: {
    name: DeviceStates.ERROR,
    displayName: '오류',
    description: '복구 가능한 오류가 발생한 상태',
    color: '#f59e0b', // amber
    canAcceptWork: false,
    canAutoRecover: true,
  },
  [DeviceStates.QUARANTINE]: {
    name: DeviceStates.QUARANTINE,
    displayName: '격리',
    description: '수동 개입이 필요한 상태 (계속 실패하는 기기)',
    color: '#ef4444', // red
    canAcceptWork: false,
    canAutoRecover: false,
  },
};

// ============================================
// 상태 전이 트리거
// ============================================

/**
 * 상태 전이를 유발하는 트리거
 */
export const StateTransitionTriggers = {
  /** Heartbeat 수신 */
  HEARTBEAT_RECEIVED: 'HEARTBEAT_RECEIVED',
  /** Heartbeat 타임아웃 */
  HEARTBEAT_TIMEOUT: 'HEARTBEAT_TIMEOUT',
  /** 워크플로우 실행 시작 */
  WORKFLOW_STARTED: 'WORKFLOW_STARTED',
  /** 워크플로우 완료 */
  WORKFLOW_COMPLETED: 'WORKFLOW_COMPLETED',
  /** 워크플로우 실패 */
  WORKFLOW_FAILED: 'WORKFLOW_FAILED',
  /** 복구 성공 */
  RECOVERY_SUCCESS: 'RECOVERY_SUCCESS',
  /** 복구 실패 (반복) */
  RECOVERY_FAILED: 'RECOVERY_FAILED',
  /** 수동 복구 */
  MANUAL_RELEASE: 'MANUAL_RELEASE',
  /** 수동 격리 */
  MANUAL_QUARANTINE: 'MANUAL_QUARANTINE',
} as const;

export type StateTransitionTrigger = typeof StateTransitionTriggers[keyof typeof StateTransitionTriggers];

// ============================================
// 상태 전이 컨텍스트
// ============================================

/**
 * 상태 전이 시 전달되는 컨텍스트
 */
export interface TransitionContext {
  /** 전이 트리거 */
  trigger: StateTransitionTrigger;
  /** 관련 워크플로우 ID */
  workflowId?: string;
  /** 관련 Job ID */
  jobId?: string;
  /** 에러 메시지 */
  errorMessage?: string;
  /** 에러 카운트 */
  errorCount?: number;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
  /** 타임스탬프 */
  timestamp: number;
}

// ============================================
// 상태 스냅샷
// ============================================

/**
 * 디바이스 상태 스냅샷
 */
export interface DeviceStateSnapshot {
  /** 디바이스 ID */
  deviceId: string;
  /** 디바이스 시리얼 */
  serial: string;
  /** 현재 상태 */
  state: DeviceState;
  /** 이전 상태 */
  previousState?: DeviceState;
  /** 현재 워크플로우 ID */
  workflowId?: string;
  /** 현재 Job ID */
  jobId?: string;
  /** 에러 메시지 */
  errorMessage?: string;
  /** 연속 에러 횟수 */
  errorCount: number;
  /** 마지막 Heartbeat 타임스탬프 */
  lastHeartbeat: number;
  /** 상태 전이 타임스탬프 */
  stateChangedAt: number;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 상태가 유효한지 확인
 */
export function isValidState(state: string): state is DeviceState {
  return ALL_DEVICE_STATES.includes(state as DeviceState);
}

/**
 * 작업 수락 가능한 상태인지 확인
 */
export function canAcceptWork(state: DeviceState): boolean {
  return DEVICE_STATE_METADATA[state].canAcceptWork;
}

/**
 * 자동 복구 가능한 상태인지 확인
 */
export function canAutoRecover(state: DeviceState): boolean {
  return DEVICE_STATE_METADATA[state].canAutoRecover;
}

/**
 * 상태 메타데이터 조회
 */
export function getStateMetadata(state: DeviceState): DeviceStateMetadata {
  return DEVICE_STATE_METADATA[state];
}
