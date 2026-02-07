import { randomUUID } from 'crypto';
import type { EmulatorProvider } from './providers/EmulatorProvider';
import type { EmulatorConfig, EmulatorInfo, CreateEmulatorOptions, SnapshotInfo, ResourceAllocation } from './types';

const DEFAULT_RESOURCES: ResourceAllocation = {
  cpuCores: 2,
  memoryMb: 2048,
  storageMb: 8192,
};

export class EmulatorManager {
  private provider: EmulatorProvider;
  private adbPortStart: number;
  private adbPortEnd: number;
  private usedPorts: Set<number> = new Set();

  constructor(provider: EmulatorProvider, options?: { adbPortStart?: number; adbPortEnd?: number }) {
    this.provider = provider;
    this.adbPortStart = options?.adbPortStart ?? 5600;
    this.adbPortEnd = options?.adbPortEnd ?? 5700;
  }

  async create(options: CreateEmulatorOptions = {}): Promise<EmulatorInfo> {
    const id = randomUUID();
    const adbPort = options.adbPort ?? this.allocatePort();

    const config: EmulatorConfig = {
      id,
      name: options.name ?? `emu-${id.slice(0, 8)}`,
      androidVersion: options.androidVersion ?? '13',
      provider: 'redroid',
      resources: { ...DEFAULT_RESOURCES, ...options.resources },
      adbPort,
      networkMode: options.networkMode ?? 'bridge',
    };

    const info = await this.provider.create(config);
    this.usedPorts.add(adbPort);
    return info;
  }

  async start(emulatorId: string): Promise<void> {
    await this.provider.start(emulatorId);
  }

  async stop(emulatorId: string): Promise<void> {
    await this.provider.stop(emulatorId);
  }

  async destroy(emulatorId: string): Promise<void> {
    const info = await this.provider.getInfo(emulatorId);
    if (info) {
      this.usedPorts.delete(info.config.adbPort);
    }
    await this.provider.destroy(emulatorId);
  }

  async getInfo(emulatorId: string): Promise<EmulatorInfo | null> {
    return this.provider.getInfo(emulatorId);
  }

  async listAll(): Promise<EmulatorInfo[]> {
    return this.provider.listAll();
  }

  async snapshot(emulatorId: string, name: string): Promise<SnapshotInfo> {
    return this.provider.snapshot(emulatorId, name);
  }

  async restoreSnapshot(emulatorId: string, snapshotId: string): Promise<void> {
    return this.provider.restoreSnapshot(emulatorId, snapshotId);
  }

  private allocatePort(): number {
    for (let port = this.adbPortStart; port <= this.adbPortEnd; port++) {
      if (!this.usedPorts.has(port)) {
        return port;
      }
    }
    throw new Error(`No available ADB ports in range ${this.adbPortStart}-${this.adbPortEnd}`);
  }
}
