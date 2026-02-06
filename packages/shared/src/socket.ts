// ============================================
// Socket.IO 이벤트 스펙
// ============================================

import type {
  DeviceStatus,
  VideoExecution,
  DeviceIssue,
} from "./types";

// ============================================
// Server → Client 이벤트
// ============================================

export interface ServerToClientEvents {
  // 연결 관리
  "connection:established": (data: { nodeId: string; connectedAt: string }) => void;
  "connection:error": (data: { code: string; message: string }) => void;

  // 디바이스 상태
  "device:status": (data: DeviceStatusUpdate) => void;
  "device:batch_status": (data: DeviceStatusUpdate[]) => void;
  "device:connected": (data: DeviceConnectedEvent) => void;
  "device:disconnected": (data: DeviceDisconnectedEvent) => void;

  // 작업 실행
  "execution:assigned": (data: ExecutionAssignedEvent) => void;
  "execution:started": (data: ExecutionStartedEvent) => void;
  "execution:progress": (data: ExecutionProgressEvent) => void;
  "execution:completed": (data: ExecutionCompletedEvent) => void;
  "execution:failed": (data: ExecutionFailedEvent) => void;
  "execution:cancelled": (data: ExecutionCancelledEvent) => void;

  // 노드 상태
  "node:status": (data: NodeStatusUpdate) => void;
  "node:heartbeat": (data: NodeHeartbeatEvent) => void;

  // 이슈
  "issue:created": (data: DeviceIssue) => void;
  "issue:resolved": (data: { issueId: string; resolvedAt: string }) => void;

  // 시스템
  "system:log": (data: SystemLogEvent) => void;
  "system:alert": (data: SystemAlertEvent) => void;
}

// ============================================
// Client → Server 이벤트
// ============================================

export interface ClientToServerEvents {
  // 노드 등록
  "node:register": (
    data: NodeRegisterData,
    callback: (response: { success: boolean; nodeId?: string; error?: string }) => void
  ) => void;

  // 디바이스 보고
  "device:report": (data: DeviceReportData) => void;
  "device:batch_report": (data: DeviceReportData[]) => void;

  // 작업 관련
  "execution:request": (
    data: ExecutionRequestData,
    callback: (response: { execution?: VideoExecution; error?: string }) => void
  ) => void;
  "execution:update": (data: ExecutionUpdateData) => void;
  "execution:complete": (data: ExecutionCompleteData) => void;
  "execution:fail": (data: ExecutionFailData) => void;

  // 노드 하트비트
  "node:heartbeat": (data: NodeHeartbeatData) => void;

  // 명령 응답
  "command:response": (data: CommandResponseData) => void;
}

// ============================================
// 이벤트 데이터 타입
// ============================================

// Device Events
export interface DeviceStatusUpdate {
  deviceId: string;
  status: DeviceStatus;
  batteryLevel?: number;
  temperature?: number;
  currentTaskId?: string | null;
  timestamp: string;
}

export interface DeviceConnectedEvent {
  deviceId: string;
  serialNumber: string;
  nodeId: string;
  timestamp: string;
}

export interface DeviceDisconnectedEvent {
  deviceId: string;
  reason: string;
  timestamp: string;
}

export interface DeviceReportData {
  deviceId: string;
  serialNumber: string;
  status: DeviceStatus;
  batteryLevel: number;
  temperature: number;
  memoryUsage: number;
  storageUsage: number;
  ipAddress: string;
}

// Execution Events
export interface ExecutionAssignedEvent {
  executionId: string;
  videoId: string;
  deviceId: string;
  nodeId: string;
  targetWatchSeconds: number;
  timestamp: string;
}

export interface ExecutionStartedEvent {
  executionId: string;
  deviceId: string;
  timestamp: string;
}

export interface ExecutionProgressEvent {
  executionId: string;
  deviceId: string;
  progress: number; // 0-100
  watchedSeconds: number;
  timestamp: string;
}

export interface ExecutionCompletedEvent {
  executionId: string;
  deviceId: string;
  actualWatchSeconds: number;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface ExecutionFailedEvent {
  executionId: string;
  deviceId: string;
  errorCode: string;
  errorMessage: string;
  watchedSeconds: number;
  timestamp: string;
}

export interface ExecutionCancelledEvent {
  executionId: string;
  deviceId: string;
  reason: string;
  timestamp: string;
}

export interface ExecutionRequestData {
  nodeId: string;
  deviceId: string;
  deviceCapabilities?: {
    resolution: string;
    androidVersion: string;
  };
}

export interface ExecutionUpdateData {
  executionId: string;
  progress: number;
  watchedSeconds: number;
  metadata?: Record<string, unknown>;
}

export interface ExecutionCompleteData {
  executionId: string;
  actualWatchSeconds: number;
  metadata: Record<string, unknown>;
}

export interface ExecutionFailData {
  executionId: string;
  errorCode: string;
  errorMessage: string;
  watchedSeconds: number;
  recoverable: boolean;
}

// Node Events
export interface NodeRegisterData {
  nodeId: string;
  name: string;
  ipAddress: string;
  version: string;
  deviceCount: number;
}

export interface NodeStatusUpdate {
  nodeId: string;
  status: "online" | "offline" | "degraded";
  onlineDevices: number;
  busyDevices: number;
  activeTasks: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface NodeHeartbeatEvent {
  nodeId: string;
  timestamp: string;
  stats: {
    cpuUsage: number;
    memoryUsage: number;
    activeTasks: number;
    queuedTasks: number;
  };
}

export interface NodeHeartbeatData {
  nodeId: string;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkStats: {
    bytesIn: number;
    bytesOut: number;
  };
  deviceStats: {
    total: number;
    online: number;
    busy: number;
    error: number;
  };
}

// Command Events
export interface CommandResponseData {
  commandId: string;
  deviceId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// System Events
export interface SystemLogEvent {
  level: "error" | "warn" | "info" | "debug";
  source: string;
  message: string;
  nodeId?: string;
  timestamp: string;
}

export interface SystemAlertEvent {
  type: "critical" | "warning" | "info";
  title: string;
  message: string;
  nodeId?: string;
  deviceId?: string;
  timestamp: string;
}
