// =============================================
// DoAi.Me Socket.io 이벤트 상수
// Backend와 Frontend가 공유하는 이벤트 이름
// =============================================

// -----------------------------------------
// Worker Namespace Events (/worker)
// -----------------------------------------

export const WORKER_EVENTS = {
  // Heartbeat
  HEARTBEAT: 'worker:heartbeat',
  HEARTBEAT_ACK: 'worker:heartbeat:ack',
  
  // Device Initialization
  DEVICE_INIT: 'device:init',
  DEVICE_INIT_COMPLETE: 'device:init:complete',
  DEVICE_COMMAND: 'device:command',
  DEVICE_LOG: 'device:log',
  
  // Command
  COMMAND_ACK: 'command:ack',
  COMMAND_ERROR: 'command:error',
  
  // Job Lifecycle
  JOB_REQUEST: 'job:request',
  JOB_REQUEST_RESPONSE: 'job:request:response',
  JOB_ASSIGN: 'job:assign',
  JOB_STARTED: 'job:started',
  JOB_PROGRESS: 'job:progress',
  JOB_COMPLETED: 'job:completed',
  JOB_FAILED: 'job:failed',
  
  // Comment
  COMMENT_REQUEST: 'comment:request',
  COMMENT_RESPONSE: 'comment:response',
  
  // Stream
  STREAM_START: 'stream:start',
  STREAM_STOP: 'stream:stop',
  STREAM_FRAME: 'stream:frame',
  STREAM_ERROR: 'stream:error',
  
  // Connection
  DISCONNECT: 'disconnect',
} as const;

// -----------------------------------------
// Dashboard Namespace Events (/dashboard)
// -----------------------------------------

export const DASHBOARD_EVENTS = {
  // Initial Data
  DEVICES_INITIAL: 'devices:initial',
  
  // Device Updates
  DEVICE_UPDATE: 'device:update',
  DEVICE_ONLINE: 'device:online',
  DEVICE_OFFLINE: 'device:offline',
  
  // Job Control
  JOB_DISTRIBUTE: 'job:distribute',
  JOB_DISTRIBUTE_ACK: 'job:distribute:ack',
  JOB_PAUSE: 'job:pause',
  JOB_RESUME: 'job:resume',
  JOB_RESUME_ACK: 'job:resume:ack',
  JOB_CANCEL: 'job:cancel',
  
  // Command Control
  COMMAND_SEND: 'command:send',
  COMMAND_BROADCAST: 'command:broadcast',
  
  // Stream Control
  STREAM_START: 'stream:start',
  STREAM_STOP: 'stream:stop',
  STREAM_DATA: 'stream:data',
  
  // Log Room
  JOIN_LOG_ROOM: 'join:log_room',
  LEAVE_LOG_ROOM: 'leave:log_room',
  LOG_ROOM_JOINED: 'log_room:joined',
  LOG_ENTRY: 'log:entry',
  
  // Connection
  DISCONNECT: 'disconnect',
} as const;

// -----------------------------------------
// Socket.io Namespace Paths
// -----------------------------------------

export const SOCKET_NAMESPACES = {
  WORKER: '/worker',
  DASHBOARD: '/dashboard',
} as const;

// -----------------------------------------
// Device Status Constants
// -----------------------------------------

export const DEVICE_STATUS = {
  IDLE: 'idle',
  BUSY: 'busy',
  OFFLINE: 'offline',
} as const;

export const DEVICE_HEALTH = {
  HEALTHY: 'healthy',
  ZOMBIE: 'zombie',
  OFFLINE: 'offline',
} as const;

// -----------------------------------------
// Job Assignment Status Constants
// -----------------------------------------

export const JOB_ASSIGNMENT_STATUS = {
  PENDING: 'pending',
  PAUSED: 'paused',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

// -----------------------------------------
// Script Types
// -----------------------------------------

export const SCRIPT_TYPES = {
  YOUTUBE_WATCH: 'youtube_watch',
  YOUTUBE_SEARCH: 'youtube_search',
  CUSTOM: 'custom',
} as const;

// -----------------------------------------
// Timing Constants (ms)
// -----------------------------------------

export const TIMING = {
  HEARTBEAT_INTERVAL: 30000,       // 30초
  HEARTBEAT_TIMEOUT: 90000,        // 90초 (3회 누락)
  ZOMBIE_THRESHOLD: 120000,        // 2분
  RECONNECT_DELAY: 5000,           // 5초
  STREAM_FPS_DEFAULT: 5,           // 기본 스트림 FPS
} as const;

// -----------------------------------------
// API Endpoints (relative paths)
// -----------------------------------------

export const API_ENDPOINTS = {
  DEVICES: '/api/devices',
  JOBS: '/api/jobs',
  COMMENTS: '/api/comments',
  ANALYTICS_DEVICES: '/api/analytics/devices',
  ANALYTICS_JOBS: '/api/analytics/jobs',
  AI_GENERATE: '/api/ai/generate',
  YOUTUBE_META: '/api/youtube-meta',
} as const;

// -----------------------------------------
// Type Exports (for type inference)
// -----------------------------------------

export type WorkerEvent = typeof WORKER_EVENTS[keyof typeof WORKER_EVENTS];
export type DashboardEvent = typeof DASHBOARD_EVENTS[keyof typeof DASHBOARD_EVENTS];
export type SocketNamespace = typeof SOCKET_NAMESPACES[keyof typeof SOCKET_NAMESPACES];
export type DeviceStatusValue = typeof DEVICE_STATUS[keyof typeof DEVICE_STATUS];
export type DeviceHealthValue = typeof DEVICE_HEALTH[keyof typeof DEVICE_HEALTH];
export type JobAssignmentStatusValue = typeof JOB_ASSIGNMENT_STATUS[keyof typeof JOB_ASSIGNMENT_STATUS];
export type ScriptTypeValue = typeof SCRIPT_TYPES[keyof typeof SCRIPT_TYPES];
