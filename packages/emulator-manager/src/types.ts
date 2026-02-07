// ============================================
// Emulator Manager Types
// ============================================

export type EmulatorState = 'creating' | 'booting' | 'ready' | 'running' | 'paused' | 'stopping' | 'stopped' | 'error';

export type EmulatorProvider = 'redroid';

export interface ResourceAllocation {
  cpuCores: number;
  memoryMb: number;
  storageMb: number;
}

export interface EmulatorConfig {
  id: string;
  name: string;
  androidVersion: string;
  provider: EmulatorProvider;
  resources: ResourceAllocation;
  adbPort: number;
  networkMode: 'bridge' | 'host';
}

export interface EmulatorInfo {
  id: string;
  config: EmulatorConfig;
  state: EmulatorState;
  containerId: string;
  adbSerial: string;
  ipAddress: string;
  createdAt: number;
  metrics?: EmulatorMetrics;
}

export interface EmulatorMetrics {
  cpuPercent: number;
  memoryMb: number;
}

export interface EmulatorPoolConfig {
  maxEmulators: number;
  preWarmCount: number;
  androidVersion: string;
  defaultResources: ResourceAllocation;
  adbPortStart: number;
  adbPortEnd: number;
}

export interface EmulatorHealthStatus {
  id: string;
  healthy: boolean;
  adbResponsive: boolean;
  containerRunning: boolean;
  lastChecked: number;
  errorMessage?: string;
}

export interface CreateEmulatorOptions {
  name?: string;
  androidVersion?: string;
  resources?: Partial<ResourceAllocation>;
  adbPort?: number;
  networkMode?: 'bridge' | 'host';
}

export interface SnapshotInfo {
  id: string;
  emulatorId: string;
  name: string;
  createdAt: number;
  sizeMb: number;
}
