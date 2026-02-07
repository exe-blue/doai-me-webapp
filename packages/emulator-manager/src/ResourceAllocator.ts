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
    return {
      totalCpuCores: info.NCPU ?? 0,
      totalMemoryMb: Math.floor((info.MemTotal ?? 0) / (1024 * 1024)),
      availableMemoryMb: Math.floor((info.MemTotal ?? 0) / (1024 * 1024)),
    };
  }

  calculateMaxEmulators(resources: ResourceAllocation): number {
    // This is a simplified estimate
    return Math.floor(64 * 1024 / resources.memoryMb); // Assume 64GB total
  }
}
