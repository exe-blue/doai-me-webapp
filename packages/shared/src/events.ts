/**
 * Canonical Event Map — 모든 이벤트의 단일 진실 원천
 *
 * 기존 4개 이벤트 시스템을 점진적으로 이것으로 마이그레이션:
 * - socket-events.ts (SOCKET_EVENTS) → deprecated
 * - constants.ts (WORKER_EVENTS/DASHBOARD_EVENTS) → 유지 (하위 호환)
 * - socket.ts (ServerToClient/ClientToServer) → deprecated
 * - worker-types/events.ts (cmd:/evt:) → 내부 Manager↔Worker 전용 유지
 */

import type { BotActionProbabilities } from './bot-catalog';

// ============================================
// Worker ↔ Backend 이벤트 (Socket.IO /worker ns)
// ============================================

export const CANONICAL_WORKER_EVENTS = {
  // --- Lifecycle ---
  HEARTBEAT:            'worker:heartbeat',
  HEARTBEAT_ACK:        'worker:heartbeat:ack',

  // --- Device ---
  DEVICE_INIT:          'device:init',
  DEVICE_INIT_COMPLETE: 'device:init:complete',
  DEVICE_COMMAND:       'device:command',
  DEVICE_LOG:           'device:log',

  // --- Job Lifecycle ---
  JOB_ASSIGN:           'job:assign',
  JOB_STARTED:          'job:started',
  JOB_PROGRESS:         'job:progress',
  JOB_COMPLETED:        'job:completed',
  JOB_FAILED:           'job:failed',

  // --- Comment ---
  COMMENT_REQUEST:      'comment:request',
  COMMENT_RESPONSE:     'comment:response',

  // --- Scrcpy ---
  SCRCPY_THUMBNAIL:     'scrcpy:thumbnail',
  SCRCPY_SESSION_STATE: 'scrcpy:session:state',

  // --- Command Response ---
  COMMAND_ACK:          'command:ack',
  COMMAND_ERROR:        'command:error',
} as const;

// ============================================
// Dashboard ↔ Backend 이벤트 (Socket.IO /dashboard ns)
// ============================================

export const CANONICAL_DASHBOARD_EVENTS = {
  // --- Device ---
  DEVICES_INITIAL:      'devices:initial',
  DEVICE_UPDATE:        'device:update',
  DEVICE_ONLINE:        'device:online',
  DEVICE_OFFLINE:       'device:offline',

  // --- Job Control ---
  JOB_DISTRIBUTE:       'job:distribute',
  JOB_DISTRIBUTE_ACK:   'job:distribute:ack',
  JOB_PAUSE:            'job:pause',
  JOB_RESUME:           'job:resume',
  JOB_CANCEL:           'job:cancel',

  // --- Command ---
  COMMAND_SEND:         'command:send',
  COMMAND_BROADCAST:    'command:broadcast',

  // --- Scrcpy ---
  SCRCPY_START:         'scrcpy:start',
  SCRCPY_STOP:          'scrcpy:stop',
  SCRCPY_INPUT:         'scrcpy:input',
  SCRCPY_THUMBNAIL:     'scrcpy:thumbnail',
  SCRCPY_SESSION_STATE: 'scrcpy:session:state',
} as const;

// ============================================
// Event Type Helpers
// ============================================

export type CanonicalWorkerEvent = typeof CANONICAL_WORKER_EVENTS[keyof typeof CANONICAL_WORKER_EVENTS];
export type CanonicalDashboardEvent = typeof CANONICAL_DASHBOARD_EVENTS[keyof typeof CANONICAL_DASHBOARD_EVENTS];

// ============================================
// Job Assign Payload (Backend → Worker)
// ============================================

export interface JobAssignPayload {
  jobId: string;
  assignmentId: string;
  deviceId: string;
  deviceSerial: string;
  botTemplateId: string;         // 'youtube-watch-v1'
  params: {
    keyword: string;
    videoTitle: string;
    videoUrl: string;
    youtubeId: string;
    durationMinPct: number;
    durationMaxPct: number;
    actionProbabilities: BotActionProbabilities;
    commentText?: string;
    skipAdTimeout: number;
    watchTimeout: number;
  };
  priority: number;
  timeoutMs: number;
}

// ============================================
// Job Progress Payload (Worker → Backend)
// ============================================

export interface JobProgressPayload {
  jobId: string;
  assignmentId: string;
  deviceId: string;
  stepId: string;
  progress: number;           // 0~100
  message?: string;
  timestamp: number;
}

// ============================================
// Job Complete Payload (Worker → Backend)
// ============================================

export interface JobCompletePayload {
  jobId: string;
  assignmentId: string;
  deviceId: string;
  success: boolean;
  durationMs: number;
  result?: {
    actualWatchPct: number;
    didLike: boolean;
    didComment: boolean;
    didSubscribe: boolean;
    didPlaylist: boolean;
  };
  error?: {
    code: string;
    message: string;
    stepId: string;
    recoverable: boolean;
  };
  timestamp: number;
}
