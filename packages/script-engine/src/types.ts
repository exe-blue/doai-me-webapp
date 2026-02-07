// ============================================
// Script Engine Types
// ============================================

export interface ScriptContext {
  scriptId: string;
  userId: string;
  deviceIds: string[];
  variables: Record<string, unknown>;
  timeout: number;
}

export interface ScriptResult {
  scriptId: string;
  success: boolean;
  output: string[];
  errors: string[];
  startedAt: number;
  completedAt: number;
  durationMs: number;
}

export interface ScriptOptions {
  timeout?: number;
  memoryLimitMb?: number;
  maxOutputLines?: number;
  allowedModules?: string[];
}

export interface ScriptLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
  data?: unknown;
}

export interface ScriptExecutionState {
  scriptId: string;
  status: 'compiling' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentLine?: number;
  logs: ScriptLogEntry[];
}

export interface DeviceAPIInterface {
  list(filter?: { state?: string }): Promise<Array<{ id: string; serial: string; state: string }>>;
  tap(deviceId: string, x: number, y: number): Promise<void>;
  swipe(deviceId: string, x1: number, y1: number, x2: number, y2: number, durationMs?: number): Promise<void>;
  text(deviceId: string, text: string): Promise<void>;
  screenshot(deviceId: string): Promise<Uint8Array>;
}

export interface AdbAPIInterface {
  shell(deviceId: string, command: string): Promise<string>;
  install(deviceId: string, apkPath: string): Promise<void>;
  push(deviceId: string, localPath: string, remotePath: string): Promise<void>;
  pull(deviceId: string, remotePath: string, localPath: string): Promise<void>;
}

export interface AutomationAPIInterface {
  waitForElement(options: { text?: string; id?: string; timeout?: number }): Promise<boolean>;
  clickElement(options: { text?: string; id?: string }): Promise<void>;
  getElementText(options: { id: string }): Promise<string>;
}

export interface LogAPIInterface {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
}
