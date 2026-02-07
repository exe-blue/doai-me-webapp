import Dockerode from 'dockerode';
import type { ResourceAllocation } from './types';

export class ResourceAllocator {
  private docker: Dockerode;

  constructor(dockerOptions?: Dockerode.DockerOptions) {
    this.docker = new Dockerode(dockerOptions);
  }

  async updateResources(containerId: string, resources: Partial<ResourceAllocation>): Promise<void> {
    const container = this.docker.getContainer(containerId);
    const updateConfig: Dockerode.ContainerUpdateOptions = {};

    if (resources.memoryMb) {
      updateConfig.Memory = resources.memoryMb * 1024 * 1024;
    }
    if (resources.cpuCores) {
      updateConfig.NanoCpus = resources.cpuCores * 1e9;
    }

    await container.update(updateConfig);
  }

  async getHostResources(): Promise<{ totalCpuCores: number; totalMemoryMb: number; availableMemoryMb: number }> {
    const info = await this.docker.info();
    const totalMemoryMb = Math.floor((info.MemTotal ?? 0) / (1024 * 1024));

    let usedMemoryMb = 0;
    try {
      const containers = await this.docker.listContainers();
      for (const c of containers) {
        const container = this.docker.getContainer(c.Id);
        const inspectData = await container.inspect();
        const memLimit = inspectData.HostConfig?.Memory ?? 0;
        if (memLimit > 0) {
          usedMemoryMb += Math.floor(memLimit / (1024 * 1024));
        }
      }
    } catch {
      usedMemoryMb = Math.floor(totalMemoryMb * 0.2);
    }

    return {
      totalCpuCores: info.NCPU ?? 0,
      totalMemoryMb,
      availableMemoryMb: Math.max(0, totalMemoryMb - usedMemoryMb),
    };
  }

  async calculateMaxEmulators(resources: ResourceAllocation): Promise<number> {
    if (!resources.memoryMb || resources.memoryMb <= 0) return 0;
    const hostResources = await this.getHostResources();
    if (hostResources.availableMemoryMb <= 0) return 0;
    return Math.floor(hostResources.availableMemoryMb / resources.memoryMb);
  }
}
