/**
 * 모니터링 및 알림 시스템 타입 정의
 * 
 * 500대 디바이스 운영을 위한 모니터링 시스템
 */

// ============================================
// 알림 타입
// ============================================

/** 알림 레벨 */
export type AlertLevel = 'critical' | 'warning' | 'info';

/** 알림 상태 */
export type AlertStatus = 'firing' | 'resolved' | 'acknowledged';

/** 알림 채널 타입 */
export type AlertChannelType = 'discord' | 'slack' | 'ntfy' | 'webhook';

/** 알림 채널 설정 */
export interface AlertChannel {
  id: string;
  type: AlertChannelType;
  name: string;
  webhook?: string;
  topic?: string;
  levels: AlertLevel[];
  enabled: boolean;
}

/** 알림 규칙 */
export interface AlertRule {
  id: string;
  name?: string;
  level: AlertLevel;
  condition: AlertCondition | string; // 문자열 조건식도 지원
  threshold?: number;
  window?: number; // ms
  message: string;
  cooldown?: number; // ms, 재알림 대기 시간
  enabled: boolean;
}

/** 알림 조건 (프리셋) */
export type AlertCondition =
  | 'node_offline'
  | 'device_error_rate'
  | 'device_disconnected_rate'
  | 'queue_backlog'
  | 'queue_failed_rate'
  | 'workflow_timeout_rate'
  | 'custom';

/** 발생한 알림 */
export interface Alert {
  id: string;
  ruleId: string;
  level: AlertLevel;
  status: AlertStatus;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  firedAt: number;
  resolvedAt?: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
}

// ============================================
// 메트릭 타입
// ============================================

/** 시스템 메트릭 */
export interface SystemMetrics {
  timestamp: number;
  
  nodes: {
    total: number;
    online: number;
    offline: number;
  };
  
  devices: {
    total: number;
    idle: number;
    running: number;
    error: number;
    disconnected: number;
    quarantine: number;
  };
  
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  
  workflows: {
    running: number;
    completedLast5m: number;
    failedLast5m: number;
    avgDurationMs: number;
  };
}

/** 노드 메트릭 */
export interface NodeMetrics {
  nodeId: string;
  timestamp: number;
  status: 'online' | 'offline';
  deviceCount: number;
  activeJobs: number;
  cpu?: number;
  memory?: number;
  lastSeen: number;
}

/** 디바이스 메트릭 */
export interface DeviceMetrics {
  deviceId: string;
  nodeId: string;
  timestamp: number;
  state: string;
  battery?: number;
  workflowsCompleted: number;
  workflowsFailed: number;
  lastActivity: number;
}

/** 큐 메트릭 */
export interface QueueMetrics {
  queueName: string;
  timestamp: number;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

// ============================================
// 메트릭 수집 설정
// ============================================

/** 메트릭 수집 설정 */
export interface MetricsCollectorConfig {
  redisUrl: string;
  collectIntervalMs: number;
  retentionPeriodMs: number;
  enablePrometheus: boolean;
  prometheusPort?: number;
}

/** 알림 매니저 설정 */
export interface AlertManagerConfig {
  redisUrl: string;
  checkIntervalMs: number;
  channels: AlertChannel[];
  rules: AlertRule[];
}

// ============================================
// 이벤트 타입
// ============================================

/** 메트릭 수집 이벤트 */
export interface MetricsEvent {
  type: 'metrics:collected';
  metrics: SystemMetrics;
}

/** 알림 이벤트 */
export interface AlertEvent {
  type: 'alert:fired' | 'alert:resolved';
  alert: Alert;
}
