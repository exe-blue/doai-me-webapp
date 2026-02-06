/**
 * @doai/worker-types
 * Type definitions for worker-manager communication
 */

// Events
export type {
  // Command payloads (Manager -> Worker)
  CmdExecuteJob,
  CmdCancelJob,
  CmdPing,
  // Event payloads (Worker -> Manager)
  EvtWorkerRegister,
  EvtHeartbeat,
  EvtJobProgress,
  EvtJobComplete,
  EvtPong,
  // Socket event interfaces
  ManagerToWorkerEvents,
  WorkerToManagerEvents,
  // Type helpers
  ManagerEventPayload,
  WorkerEventPayload,
} from './events';

// Worker types
export type {
  WorkerType,
  WorkerCapability,
  WorkerConfig,
  JobContext,
  JobResult,
  JobHandler,
  WorkerInterface,
  WorkerStatus,
  WorkerMetrics,
} from './worker';

export { WORKER_TYPES } from './worker';

// Device types
export type {
  DeviceState,
  DeviceStateInfo,
  Device,
  DeviceCapabilities,
  DeviceMetrics,
  DeviceCommandType,
  DeviceCommand,
  DeviceCommandPayload,
  ShellCommandPayload,
  TapCommandPayload,
  SwipeCommandPayload,
  TextCommandPayload,
  KeyCommandPayload,
  ScreenshotCommandPayload,
  InstallCommandPayload,
  UninstallCommandPayload,
  LaunchCommandPayload,
  StopCommandPayload,
  RebootCommandPayload,
  DeviceCommandResult,
} from './device';

export { DEVICE_STATES, DEVICE_STATE_INFO } from './device';

// Streaming types
export type {
  MinicapFrame,
  MinicapInfo,
  StreamConfig,
  ScreenStreamEvents,
  StreamStartInfo,
  StreamStopInfo,
  StreamError,
  StreamErrorCode,
  QualityChangeInfo,
  StreamStats,
} from './streaming';

export { DEFAULT_STREAM_CONFIG } from './streaming';
