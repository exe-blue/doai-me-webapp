/**
 * Device type definitions
 */

// ============================================================================
// Device State
// ============================================================================

/**
 * Possible states of a device
 */
export type DeviceState = 'idle' | 'running' | 'error' | 'quarantine' | 'disconnected';

/**
 * All available device states as a const array for runtime validation
 */
export const DEVICE_STATES: readonly DeviceState[] = [
  'idle',
  'running',
  'error',
  'quarantine',
  'disconnected',
] as const;

/**
 * Device state metadata
 */
export interface DeviceStateInfo {
  /** State name */
  state: DeviceState;
  /** Human-readable description */
  description: string;
  /** Whether jobs can be assigned in this state */
  canAcceptJobs: boolean;
  /** Whether the device is considered healthy */
  isHealthy: boolean;
}

/**
 * State information lookup
 */
export const DEVICE_STATE_INFO: Record<DeviceState, DeviceStateInfo> = {
  idle: {
    state: 'idle',
    description: 'Device is ready and waiting for jobs',
    canAcceptJobs: true,
    isHealthy: true,
  },
  running: {
    state: 'running',
    description: 'Device is currently executing a job',
    canAcceptJobs: false,
    isHealthy: true,
  },
  error: {
    state: 'error',
    description: 'Device encountered an error',
    canAcceptJobs: false,
    isHealthy: false,
  },
  quarantine: {
    state: 'quarantine',
    description: 'Device is quarantined due to repeated failures',
    canAcceptJobs: false,
    isHealthy: false,
  },
  disconnected: {
    state: 'disconnected',
    description: 'Device is not connected',
    canAcceptJobs: false,
    isHealthy: false,
  },
};

// ============================================================================
// Device Interface
// ============================================================================

/**
 * Represents a connected Android device
 */
export interface Device {
  /** Unique device identifier (usually ADB serial) */
  id: string;
  /** Device serial number */
  serial: string;
  /** Human-readable device name */
  name: string;
  /** Device model */
  model: string;
  /** Device manufacturer */
  manufacturer: string;
  /** Android version */
  androidVersion: string;
  /** Android API level */
  apiLevel: number;
  /** Current device state */
  state: DeviceState;
  /** Worker ID this device is connected to */
  workerId: string;
  /** Current job ID (if running) */
  currentJobId?: string;
  /** Last seen timestamp */
  lastSeen: number;
  /** Device capabilities */
  capabilities: DeviceCapabilities;
  /** Device metrics */
  metrics?: DeviceMetrics;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Device hardware and software capabilities
 */
export interface DeviceCapabilities {
  /** Whether the device has a screen */
  hasScreen: boolean;
  /** Screen resolution */
  screenResolution?: {
    width: number;
    height: number;
    density: number;
  };
  /** Whether screen capture is available */
  screenCaptureEnabled: boolean;
  /** Whether the device is rooted */
  isRooted: boolean;
  /** Available storage in bytes */
  availableStorage: number;
  /** Total storage in bytes */
  totalStorage: number;
  /** Available RAM in bytes */
  availableRam: number;
  /** Total RAM in bytes */
  totalRam: number;
  /** Battery level percentage (0-100) */
  batteryLevel: number;
  /** Whether the device is charging */
  isCharging: boolean;
  /** Installed packages that are relevant */
  installedPackages: string[];
}

/**
 * Real-time device metrics
 */
export interface DeviceMetrics {
  /** CPU usage percentage (0-100) */
  cpuUsage: number;
  /** Memory usage percentage (0-100) */
  memoryUsage: number;
  /** Battery level percentage (0-100) */
  batteryLevel: number;
  /** Battery temperature in Celsius */
  batteryTemperature: number;
  /** Network connectivity status */
  networkStatus: 'wifi' | 'mobile' | 'none';
  /** Timestamp of metrics collection */
  timestamp: number;
}

// ============================================================================
// Device Commands
// ============================================================================

/**
 * Types of commands that can be sent to a device
 */
export type DeviceCommandType = 
  | 'shell'
  | 'tap'
  | 'swipe'
  | 'text'
  | 'key'
  | 'screenshot'
  | 'install'
  | 'uninstall'
  | 'launch'
  | 'stop'
  | 'reboot';

/**
 * Command sent to a device
 */
export interface DeviceCommand {
  /** Command ID */
  id: string;
  /** Target device ID */
  deviceId: string;
  /** Command type */
  type: DeviceCommandType;
  /** Command payload */
  payload: DeviceCommandPayload;
  /** Command timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to wait for command completion */
  waitForCompletion?: boolean;
}

/**
 * Command payload types
 */
export type DeviceCommandPayload =
  | ShellCommandPayload
  | TapCommandPayload
  | SwipeCommandPayload
  | TextCommandPayload
  | KeyCommandPayload
  | ScreenshotCommandPayload
  | InstallCommandPayload
  | UninstallCommandPayload
  | LaunchCommandPayload
  | StopCommandPayload
  | RebootCommandPayload;

export interface ShellCommandPayload {
  type: 'shell';
  command: string;
  args?: string[];
}

export interface TapCommandPayload {
  type: 'tap';
  x: number;
  y: number;
  duration?: number;
}

export interface SwipeCommandPayload {
  type: 'swipe';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs?: number;
}

export interface TextCommandPayload {
  type: 'text';
  text: string;
}

export interface KeyCommandPayload {
  type: 'key';
  keycode: number | string;
}

export interface ScreenshotCommandPayload {
  type: 'screenshot';
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface InstallCommandPayload {
  type: 'install';
  apkPath: string;
  reinstall?: boolean;
  grantPermissions?: boolean;
}

export interface UninstallCommandPayload {
  type: 'uninstall';
  packageName: string;
  keepData?: boolean;
}

export interface LaunchCommandPayload {
  type: 'launch';
  packageName: string;
  activity?: string;
  extras?: Record<string, string>;
}

export interface StopCommandPayload {
  type: 'stop';
  packageName: string;
  force?: boolean;
}

export interface RebootCommandPayload {
  type: 'reboot';
  mode?: 'normal' | 'recovery' | 'bootloader';
}

// ============================================================================
// Device Command Result
// ============================================================================

/**
 * Result of a device command execution
 */
export interface DeviceCommandResult {
  /** Command ID */
  commandId: string;
  /** Device ID */
  deviceId: string;
  /** Whether the command succeeded */
  success: boolean;
  /** Command output (if any) */
  output?: string;
  /** Binary data (e.g., screenshot) */
  data?: Uint8Array;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
  };
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Timestamp of completion */
  timestamp: number;
}
