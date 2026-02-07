import { EmulatorManager } from './EmulatorManager';
import type { EmulatorInfo, EmulatorPoolConfig, CreateEmulatorOptions } from './types';

export class EmulatorPool {
  private manager: EmulatorManager;
  private config: EmulatorPoolConfig;
  private available: string[] = [];
  private allocated: Map<string, string> = new Map(); // allocationId -> emulatorId

  constructor(manager: EmulatorManager, config: EmulatorPoolConfig) {
    this.manager = manager;
    this.config = config;
  }

  async initialize(): Promise<void> {
    for (let i = 0; i < this.config.preWarmCount; i++) {
      const emu = await this.manager.create({
        androidVersion: this.config.androidVersion,
        resources: this.config.defaultResources,
      });
      await this.manager.start(emu.id);
      this.available.push(emu.id);
    }
  }

  async acquire(allocationId: string): Promise<EmulatorInfo | null> {
    const emulatorId = this.available.shift();
    if (!emulatorId) return null;

    this.allocated.set(allocationId, emulatorId);
    const info = await this.manager.getInfo(emulatorId);

    // Replenish pool in background
    this.replenish().catch(() => {});

    return info;
  }

  async release(allocationId: string): Promise<void> {
    const emulatorId = this.allocated.get(allocationId);
    if (!emulatorId) return;

    this.allocated.delete(allocationId);
    this.available.push(emulatorId);
  }

  async scaleUp(count: number): Promise<void> {
    const total = this.available.length + this.allocated.size;
    const toCreate = Math.min(count, this.config.maxEmulators - total);

    for (let i = 0; i < toCreate; i++) {
      const emu = await this.manager.create({
        androidVersion: this.config.androidVersion,
        resources: this.config.defaultResources,
      });
      await this.manager.start(emu.id);
      this.available.push(emu.id);
    }
  }

  async scaleDown(count: number): Promise<void> {
    const toRemove = Math.min(count, this.available.length);
    for (let i = 0; i < toRemove; i++) {
      const emulatorId = this.available.pop();
      if (emulatorId) {
        await this.manager.destroy(emulatorId);
      }
    }
  }

  getStatus(): { available: number; allocated: number; total: number; max: number } {
    return {
      available: this.available.length,
      allocated: this.allocated.size,
      total: this.available.length + this.allocated.size,
      max: this.config.maxEmulators,
    };
  }

  private async replenish(): Promise<void> {
    const total = this.available.length + this.allocated.size;
    if (this.available.length < this.config.preWarmCount && total < this.config.maxEmulators) {
      const emu = await this.manager.create({
        androidVersion: this.config.androidVersion,
        resources: this.config.defaultResources,
      });
      await this.manager.start(emu.id);
      this.available.push(emu.id);
    }
  }
}
