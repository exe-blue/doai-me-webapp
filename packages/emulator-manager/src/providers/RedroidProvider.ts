import Dockerode from 'dockerode';
import type { EmulatorProvider } from './EmulatorProvider';
import type { EmulatorConfig, EmulatorInfo, EmulatorState, SnapshotInfo } from '../types';

const REDROID_IMAGE = 'redroid/redroid:13.0.0-latest';

export class RedroidProvider implements EmulatorProvider {
  readonly name = 'redroid';
  private docker: Dockerode;
  private emulators: Map<string, EmulatorInfo> = new Map();

  constructor(dockerOptions?: Dockerode.DockerOptions) {
    this.docker = new Dockerode(dockerOptions);
  }

  async create(config: EmulatorConfig): Promise<EmulatorInfo> {
    const container = await this.docker.createContainer({
      Image: REDROID_IMAGE,
      name: `redroid-${config.id}`,
      ExposedPorts: {
        '5555/tcp': {},
      },
      HostConfig: {
        Privileged: true,
        PortBindings: {
          '5555/tcp': [{ HostPort: String(config.adbPort) }],
        },
        Memory: config.resources.memoryMb * 1024 * 1024,
        NanoCpus: config.resources.cpuCores * 1e9,
        NetworkMode: config.networkMode,
      },
      Cmd: [
        'androidboot.redroid_gpu_mode=guest',
        `androidboot.redroid_width=720`,
        `androidboot.redroid_height=1280`,
        `androidboot.redroid_fps=30`,
      ],
    });

    const info: EmulatorInfo = {
      id: config.id,
      config,
      state: 'creating',
      containerId: container.id,
      adbSerial: `localhost:${config.adbPort}`,
      ipAddress: '',
      createdAt: Date.now(),
    };

    this.emulators.set(config.id, info);
    return info;
  }

  async start(emulatorId: string): Promise<void> {
    const info = this.emulators.get(emulatorId);
    if (!info) throw new Error(`Emulator ${emulatorId} not found`);

    const container = this.docker.getContainer(info.containerId);
    await container.start();

    const inspectData = await container.inspect();
    const ipAddress = inspectData.NetworkSettings?.IPAddress ?? '';

    info.state = inspectData.State?.Running ? 'running' : 'booting';
    info.ipAddress = ipAddress;
    this.emulators.set(emulatorId, info);
  }

  async stop(emulatorId: string): Promise<void> {
    const info = this.emulators.get(emulatorId);
    if (!info) throw new Error(`Emulator ${emulatorId} not found`);

    info.state = 'stopping';
    this.emulators.set(emulatorId, info);

    const container = this.docker.getContainer(info.containerId);
    await container.stop();

    info.state = 'stopped';
    this.emulators.set(emulatorId, info);
  }

  async destroy(emulatorId: string): Promise<void> {
    const info = this.emulators.get(emulatorId);
    if (!info) throw new Error(`Emulator ${emulatorId} not found`);

    const container = this.docker.getContainer(info.containerId);
    try { await container.stop(); } catch { /* may already be stopped */ }
    await container.remove({ force: true });

    this.emulators.delete(emulatorId);
  }

  async getState(emulatorId: string): Promise<EmulatorState> {
    const info = this.emulators.get(emulatorId);
    if (!info) throw new Error(`Emulator ${emulatorId} not found`);

    try {
      const container = this.docker.getContainer(info.containerId);
      const inspectData = await container.inspect();
      const running = inspectData.State?.Running ?? false;

      if (running && info.state === 'booting') {
        return 'booting';
      }
      return running ? 'running' : 'stopped';
    } catch {
      return 'error';
    }
  }

  async getInfo(emulatorId: string): Promise<EmulatorInfo | null> {
    return this.emulators.get(emulatorId) ?? null;
  }

  async listAll(): Promise<EmulatorInfo[]> {
    return Array.from(this.emulators.values());
  }

  async snapshot(emulatorId: string, name: string): Promise<SnapshotInfo> {
    const info = this.emulators.get(emulatorId);
    if (!info) throw new Error(`Emulator ${emulatorId} not found`);

    const sanitizedName = name.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    if (!sanitizedName) throw new Error('Invalid snapshot name after sanitization');

    const container = this.docker.getContainer(info.containerId);
    const commitResult = await container.commit({
      repo: `redroid-snapshot-${emulatorId}`,
      tag: sanitizedName,
    });

    return {
      id: commitResult.Id ?? `${emulatorId}-${name}`,
      emulatorId,
      name,
      createdAt: Date.now(),
      sizeMb: 0,
    };
  }

  async restoreSnapshot(_emulatorId: string, _snapshotId: string): Promise<void> {
    throw new Error('Snapshot restore not yet implemented for Redroid');
  }

  async getContainerIp(containerId: string): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const inspectData = await container.inspect();
    return inspectData.NetworkSettings?.IPAddress ?? '';
  }
}
