// ============================================
// DoAi.Me Worker Core
// ADB 제어 및 디바이스 관리 핵심 라이브러리
// ============================================

// Logger exports
export {
  Logger,
  defaultLogger,
  type LogLevel,
  type LoggerOptions,
  type LogMessage,
} from './Logger';

// AdbController exports
export {
  AdbController,
  type AdbControllerOptions,
  type AdbDeviceInfo,
  type DeviceTrackEvent,
  type DeviceTrackCallback,
  type TransferProgressCallback,
  type TransferStats,
} from './AdbController';

// DeviceManager exports
export {
  DeviceManager,
  type DeviceManagerOptions,
  type DeviceManagerEvents,
  type ManagedDevice,
  type ManagedDeviceState,
} from './DeviceManager';

// Streaming exports
export {
  MinicapManager,
  MinicapServer,
  type MinicapDeployInfo,
  type MinicapManagerOptions,
  type MinicapServerState,
  type MinicapServerOptions,
  type FrameCallback,
} from './streaming';

// BaseWorker exports
export {
  BaseWorker,
  type BaseWorkerEvents,
} from './BaseWorker';

// HumanSimulator exports
export {
  HumanSimulator,
  DEFAULT_HUMAN_SIMULATOR_CONFIG,
  type HumanSimulatorConfig,
  type ScrollDirection,
} from './HumanSimulator';
