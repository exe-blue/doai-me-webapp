/**
 * Workflow Engine Types
 * 
 * YAML 기반 워크플로우 정의 및 실행 타입
 */

// ============================================
// 워크플로우 정의 타입
// ============================================

/**
 * 워크플로우 전체 정의
 */
export interface WorkflowDefinition {
  /** 고유 ID (예: youtube_watch) */
  id: string;
  
  /** 표시 이름 */
  name: string;
  
  /** 설명 */
  description?: string;
  
  /** 버전 */
  version: number;
  
  /** 전체 타임아웃 (ms) */
  timeout: number;
  
  /** 파라미터 정의 */
  params?: WorkflowParam[];
  
  /** 실행 스텝 배열 */
  steps: WorkflowStep[];
  
  /** 전역 재시도 정책 */
  retry_policy?: RetryPolicy;
  
  /** 에러 발생 시 실행할 스텝 */
  on_error?: WorkflowStep[];
  
  /** 태그 (검색/분류용) */
  tags?: string[];
  
  /** 카테고리 */
  category?: string;
}

/**
 * 워크플로우 파라미터 정의
 */
export interface WorkflowParam {
  /** 파라미터 이름 */
  name: string;
  
  /** 타입 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  
  /** 필수 여부 */
  required?: boolean;
  
  /** 기본값 */
  default?: unknown;
  
  /** 설명 */
  description?: string;
  
  /** 유효성 검사 (정규식 또는 값 목록) */
  validation?: string | string[];
}

/**
 * 재시도 정책
 */
export interface RetryPolicy {
  /** 기본 재시도 횟수 */
  default_attempts?: number;
  
  /** 재시도 간 지연 (ms 또는 문자열) */
  default_delay?: number | string;
  
  /** 백오프 전략 */
  backoff?: 'linear' | 'exponential' | 'none';
  
  /** 최대 지연 시간 (ms) */
  max_delay?: number;
}

// ============================================
// 워크플로우 스텝 타입
// ============================================

/**
 * 스텝 액션 타입
 */
export type StepAction = 'adb' | 'autox' | 'wait' | 'condition' | 'system' | 'loop';

/**
 * 에러 처리 방식
 */
export type OnErrorAction = 'stop' | 'fail' | 'continue' | 'skip' | 'retry';

/**
 * 워크플로우 스텝 정의
 */
export interface WorkflowStep {
  /** 스텝 ID (워크플로우 내 고유) */
  id: string;
  
  /** 스텝 이름 */
  name?: string;
  
  /** 액션 타입 */
  action: StepAction;
  
  // === ADB 액션 전용 ===
  /** ADB 명령어 */
  command?: string;
  
  // === AutoX 액션 전용 ===
  /** 인라인 스크립트 */
  script?: string;
  
  /** 스크립트 파일 경로 */
  scriptFile?: string;
  
  // === Wait 액션 전용 ===
  /** 대기 시간 (ms 또는 문자열) */
  duration?: number | string;
  
  // === Condition 액션 전용 ===
  /** 조건식 */
  condition?: string;
  
  /**
   * 조건이 참일 때 실행할 스텝
   * @deprecated Use `then_steps` instead. Objects with 'then' property can be mistakenly 
   * treated as Promises (thenable), causing unexpected behavior in async contexts.
   */
  then?: WorkflowStep[];
  
  /** 조건이 참일 때 실행할 스텝 (preferred over 'then' to avoid thenable conflicts) */
  then_steps?: WorkflowStep[];
  
  /**
   * 조건이 거짓일 때 실행할 스텝
   * @deprecated Use `else_steps` instead for consistency with `then_steps`.
   */
  else?: WorkflowStep[];
  
  /** 조건이 거짓일 때 실행할 스텝 (preferred over 'else' for consistency) */
  else_steps?: WorkflowStep[];
  
  // === Loop 액션 전용 ===
  /** 반복 횟수 */
  count?: number;
  
  /** 반복할 스텝 */
  body?: WorkflowStep[];
  
  // === System 액션 전용 ===
  /** 시스템 명령 (report, log 등) */
  systemCommand?: string;
  
  // === 공통 옵션 ===
  /** 스텝 타임아웃 (ms 또는 문자열) */
  timeout?: number | string;
  
  /** 재시도 설정 */
  retry?: StepRetry | number;
  
  /** 에러 처리 방식 */
  on_error?: OnErrorAction;
  
  /** 이전 스텝 의존성 */
  depends_on?: string[];
  
  /** 스텝 활성화 여부 */
  enabled?: boolean;
  
  /** 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * 스텝별 재시도 설정
 */
export interface StepRetry {
  /** 재시도 횟수 */
  attempts: number;
  
  /** 재시도 간 지연 (ms) */
  delay: number;
  
  /** 백오프 전략 */
  backoff?: 'linear' | 'exponential' | 'none';
  
  /** 재시도할 에러 타입 (정규식) */
  retryOn?: string[];
  
  /** 재시도하지 않을 에러 타입 */
  noRetryOn?: string[];
}

// ============================================
// 실행 컨텍스트 타입
// ============================================

/**
 * 워크플로우 실행 컨텍스트
 */
export interface ExecutionContext {
  /** 워크플로우 ID */
  workflowId: string;
  
  /** 실행 ID (고유) */
  executionId: string;
  
  /** 대상 디바이스 ID */
  deviceId: string;
  
  /** 실행 노드 ID */
  nodeId: string;
  
  /** 실행 파라미터 */
  params: Record<string, unknown>;
  
  /** 실행 중 생성된 변수 */
  variables: Record<string, unknown>;
  
  /** 실행 시작 시간 (Unix timestamp) */
  startedAt: number;
  
  /** 현재 실행 중인 스텝 ID */
  currentStep?: string;
  
  /** 실행 타임아웃 (ms) */
  timeout?: number;
  
  /** 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * 스텝 실행 결과
 */
export interface StepResult {
  /** 성공 여부 */
  success: boolean;
  
  /** 출력 데이터 */
  output?: unknown;
  
  /** 에러 메시지 */
  error?: string;
  
  /** 에러 코드 */
  errorCode?: string;
  
  /** 실행 시간 (ms) */
  duration: number;
  
  /** 재시도 횟수 */
  retries?: number;
  
  /** 스킵 여부 */
  skipped?: boolean;
  
  /** 스킵 사유 */
  skipReason?: string;
}

/**
 * 워크플로우 실행 결과
 */
export interface WorkflowResult {
  /** 성공 여부 */
  success: boolean;
  
  /** 전체 실행 시간 (ms) */
  duration: number;
  
  /** 스텝별 결과 */
  steps: Map<string, StepResult>;
  
  /** 최종 에러 (있는 경우) */
  error?: string;
  
  /** 실행 컨텍스트 */
  context: ExecutionContext;
}

// ============================================
// 실행기 옵션 타입
// ============================================

/**
 * ADB 명령 실행 함수 타입
 */
export type AdbExecutor = (deviceId: string, command: string) => Promise<string>;

/**
 * AutoX.js 스크립트 실행 함수 타입
 */
export type AutoxExecutor = (deviceId: string, script: string) => Promise<unknown>;

/**
 * 워크플로우 실행기 옵션
 */
export interface WorkflowRunnerOptions {
  /** ADB 명령 실행 함수 */
  adbExecutor: AdbExecutor;
  
  /** AutoX.js 스크립트 실행 함수 */
  autoxExecutor: AutoxExecutor;
  
  /** 스크립트 파일 기본 경로 */
  scriptBasePath?: string;
  
  /** 기본 타임아웃 (ms) */
  defaultTimeout?: number;
  
  /** 디버그 모드 */
  debug?: boolean;
}

// ============================================
// 이벤트 타입
// ============================================

/**
 * 워크플로우 이벤트 타입
 */
export type WorkflowEventType = 
  | 'start'
  | 'complete'
  | 'error'
  | 'abort'
  | 'step:start'
  | 'step:complete'
  | 'step:error'
  | 'step:retry'
  | 'step:skip';

/**
 * 워크플로우 이벤트 페이로드
 */
export interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: string;
  executionId: string;
  timestamp: number;
  data?: unknown;
}

/**
 * 스텝 이벤트 페이로드
 */
export interface StepEvent extends WorkflowEvent {
  stepId: string;
  stepName?: string;
  result?: StepResult;
  attempt?: number;
  delay?: number;
}

// ============================================
// 유틸리티 타입
// ============================================

/**
 * 시간 문자열 (예: "30s", "5m", "1h")
 */
export type TimeString = string;

/**
 * 시간 문자열을 밀리초로 변환
 */
export function parseTimeString(time: string | number): number {
  if (typeof time === 'number') return time;
  
  const match = time.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) throw new Error(`Invalid time format: ${time}`);
  
  const value = parseInt(match[1], 10);
  const unit = match[2] || 'ms';
  
  switch (unit) {
    case 'ms': return value;
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return value;
  }
}

/**
 * 워크플로우 유효성 검사 에러
 */
export class WorkflowValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = 'WorkflowValidationError';
  }
}

/**
 * 워크플로우 실행 에러
 */
export class WorkflowExecutionError extends Error {
  constructor(
    message: string,
    public readonly stepId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'WorkflowExecutionError';
  }
}
