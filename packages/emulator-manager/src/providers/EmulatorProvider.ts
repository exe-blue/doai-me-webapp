import type { EmulatorConfig, EmulatorInfo, EmulatorState, SnapshotInfo } from '../types';

export interface EmulatorProvider {
  readonly name: string;

  create(config: EmulatorConfig): Promise<EmulatorInfo>;
  start(emulatorId: string): Promise<void>;
  stop(emulatorId: string): Promise<void>;
  destroy(emulatorId: string): Promise<void>;

  getState(emulatorId: string): Promise<EmulatorState>;
  getInfo(emulatorId: string): Promise<EmulatorInfo | null>;
  listAll(): Promise<EmulatorInfo[]>;

  snapshot(emulatorId: string, name: string): Promise<SnapshotInfo>;
  restoreSnapshot(emulatorId: string, snapshotId: string): Promise<void>;

  getContainerIp(containerId: string): Promise<string>;
}
