import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerRegistry } from '../WorkerRegistry';
import type { EvtWorkerRegister, EvtHeartbeat } from '@doai/worker-types';
import type { Socket } from 'socket.io';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockSocket(id = 'socket-1'): Socket {
  return {
    id,
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as Socket;
}

function createRegisterData(overrides: Partial<EvtWorkerRegister> = {}): EvtWorkerRegister {
  return {
    workerId: 'worker-1',
    workerType: 'youtube',
    version: '1.0.0',
    capabilities: [{ name: 'youtube_bot', enabled: true, version: '1.0.0' }],
    connectedDevices: ['device-1', 'device-2'],
    maxConcurrentJobs: 3,
    host: { hostname: 'test-host', platform: 'win32', arch: 'x64' },
    ...overrides,
  };
}

describe('WorkerRegistry', () => {
  let registry: WorkerRegistry;

  beforeEach(() => {
    registry = new WorkerRegistry({
      heartbeatTimeoutMs: 5000,
      healthCheckIntervalMs: 1000,
    });
  });

  afterEach(() => {
    registry.stop();
    registry.clear();
  });

  // ================================================================
  // Registration
  // ================================================================

  describe('registerWorker', () => {
    it('should register a new worker', () => {
      const socket = createMockSocket();
      const data = createRegisterData();

      const worker = registry.registerWorker(data, socket);

      expect(worker.worker_id).toBe('worker-1');
      expect(worker.worker_type).toBe('youtube');
      expect(worker.version).toBe('1.0.0');
      expect(worker.devices).toHaveLength(2);
      expect(worker.active_jobs).toBe(0);
      expect(worker.max_concurrent_jobs).toBe(3);
      expect(worker.socket).toBe(socket);
    });

    it('should emit worker:registered event', () => {
      const listener = vi.fn();
      registry.on('worker:registered', listener);

      const socket = createMockSocket();
      registry.registerWorker(createRegisterData(), socket);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].worker_id).toBe('worker-1');
    });

    it('should handle worker reconnection', () => {
      const socket1 = createMockSocket('s1');
      const socket2 = createMockSocket('s2');
      const reconnectListener = vi.fn();
      registry.on('worker:reconnected', reconnectListener);

      // First registration
      registry.registerWorker(createRegisterData(), socket1);

      // Reconnection with new socket
      const worker = registry.registerWorker(createRegisterData(), socket2);

      expect(worker.socket).toBe(socket2);
      expect(reconnectListener).toHaveBeenCalledOnce();
    });

    it('should initialize device states to idle', () => {
      const socket = createMockSocket();
      const worker = registry.registerWorker(createRegisterData(), socket);

      for (const device of worker.devices) {
        expect(device.state).toBe('idle');
      }
    });
  });

  // ================================================================
  // Unregistration
  // ================================================================

  describe('unregisterWorker', () => {
    it('should unregister an existing worker', () => {
      const socket = createMockSocket();
      registry.registerWorker(createRegisterData(), socket);

      const result = registry.unregisterWorker('worker-1', 'test');

      expect(result).toBe(true);
      expect(registry.getWorker('worker-1')).toBeUndefined();
    });

    it('should return false for unknown worker', () => {
      const result = registry.unregisterWorker('unknown');
      expect(result).toBe(false);
    });

    it('should emit worker:unregistered event', () => {
      const listener = vi.fn();
      registry.on('worker:unregistered', listener);

      const socket = createMockSocket();
      registry.registerWorker(createRegisterData(), socket);
      registry.unregisterWorker('worker-1', 'test-reason');

      expect(listener).toHaveBeenCalledWith('worker-1', 'test-reason');
    });
  });

  // ================================================================
  // Heartbeat
  // ================================================================

  describe('updateHeartbeat', () => {
    it('should update worker heartbeat and metrics', () => {
      const socket = createMockSocket();
      registry.registerWorker(createRegisterData(), socket);

      const heartbeat: EvtHeartbeat = {
        workerId: 'worker-1',
        timestamp: Date.now(),
        metrics: {
          cpuUsage: 50,
          memoryUsage: 60,
          uptimeSeconds: 3600,
          activeJobs: 2,
        },
        devices: [
          { deviceId: 'device-1', state: 'busy', currentJobId: 'job-1' },
          { deviceId: 'device-2', state: 'idle' },
        ],
      };

      registry.updateHeartbeat(heartbeat);

      const worker = registry.getWorker('worker-1')!;
      expect(worker.metrics?.cpuUsage).toBe(50);
      expect(worker.metrics?.memoryUsage).toBe(60);
      expect(worker.active_jobs).toBe(2);
      expect(worker.devices[0].state).toBe('busy');
      expect(worker.devices[0].currentJobId).toBe('job-1');
    });

    it('should emit worker:heartbeat event', () => {
      const listener = vi.fn();
      registry.on('worker:heartbeat', listener);

      const socket = createMockSocket();
      registry.registerWorker(createRegisterData(), socket);

      const heartbeat: EvtHeartbeat = {
        workerId: 'worker-1',
        timestamp: Date.now(),
        metrics: { cpuUsage: 10, memoryUsage: 20, uptimeSeconds: 100, activeJobs: 0 },
        devices: [],
      };

      registry.updateHeartbeat(heartbeat);

      expect(listener).toHaveBeenCalledWith('worker-1', heartbeat);
    });

    it('should ignore heartbeat from unknown worker', () => {
      const heartbeat: EvtHeartbeat = {
        workerId: 'unknown',
        timestamp: Date.now(),
        metrics: { cpuUsage: 0, memoryUsage: 0, uptimeSeconds: 0, activeJobs: 0 },
        devices: [],
      };

      // Should not throw
      registry.updateHeartbeat(heartbeat);
    });
  });

  // ================================================================
  // Health Check
  // ================================================================

  describe('checkWorkerHealth', () => {
    it('should emit timeout for stale workers', () => {
      const listener = vi.fn();
      registry.on('worker:timeout', listener);

      const socket = createMockSocket();
      registry.registerWorker(createRegisterData(), socket);

      // Manually set last_heartbeat to the past
      const worker = registry.getWorker('worker-1')!;
      worker.last_heartbeat = Date.now() - 10000; // 10s ago

      // With 5s timeout config, this should trigger
      registry.checkWorkerHealth();

      expect(listener).toHaveBeenCalledWith('worker-1', worker.last_heartbeat);
    });

    it('should not emit timeout for healthy workers', () => {
      const listener = vi.fn();
      registry.on('worker:timeout', listener);

      const socket = createMockSocket();
      registry.registerWorker(createRegisterData(), socket);

      registry.checkWorkerHealth();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // Lifecycle
  // ================================================================

  describe('start/stop', () => {
    it('should start health check timer', () => {
      vi.useFakeTimers();

      registry.start();

      const timeoutListener = vi.fn();
      registry.on('worker:timeout', timeoutListener);

      const socket = createMockSocket();
      registry.registerWorker(createRegisterData(), socket);
      const worker = registry.getWorker('worker-1')!;
      worker.last_heartbeat = Date.now() - 10000;

      vi.advanceTimersByTime(1000);

      expect(timeoutListener).toHaveBeenCalled();

      registry.stop();
      vi.useRealTimers();
    });

    it('should not start twice', () => {
      registry.start();
      registry.start(); // Should be a no-op
      registry.stop();
    });
  });

  // ================================================================
  // Queries
  // ================================================================

  describe('queries', () => {
    beforeEach(() => {
      const socket1 = createMockSocket('s1');
      const socket2 = createMockSocket('s2');

      registry.registerWorker(
        createRegisterData({
          workerId: 'worker-1',
          workerType: 'youtube',
          connectedDevices: ['d1', 'd2'],
          maxConcurrentJobs: 3,
        }),
        socket1
      );

      registry.registerWorker(
        createRegisterData({
          workerId: 'worker-2',
          workerType: 'generic',
          connectedDevices: ['d3'],
          capabilities: [{ name: 'scrape', enabled: true, version: '1.0.0' }],
          maxConcurrentJobs: 1,
        }),
        socket2
      );
    });

    it('getWorkers should return all workers', () => {
      expect(registry.getWorkers()).toHaveLength(2);
    });

    it('getWorkerCount should return correct count', () => {
      expect(registry.getWorkerCount()).toBe(2);
    });

    it('getWorkersByType should filter correctly', () => {
      const youtubeWorkers = registry.getWorkersByType('youtube');
      expect(youtubeWorkers).toHaveLength(1);
      expect(youtubeWorkers[0].worker_id).toBe('worker-1');
    });

    it('getWorkersWithCapability should filter correctly', () => {
      const scrapers = registry.getWorkersWithCapability('scrape');
      expect(scrapers).toHaveLength(1);
      expect(scrapers[0].worker_id).toBe('worker-2');
    });

    it('hasWorker should check existence', () => {
      expect(registry.hasWorker('worker-1')).toBe(true);
      expect(registry.hasWorker('nonexistent')).toBe(false);
    });

    it('findWorkerByDevice should locate device owner', () => {
      const worker = registry.findWorkerByDevice('d3');
      expect(worker?.worker_id).toBe('worker-2');
    });

    it('findWorkerByDevice should return undefined for unknown device', () => {
      expect(registry.findWorkerByDevice('unknown')).toBeUndefined();
    });

    it('getIdleDevices should return idle devices', () => {
      const idle = registry.getIdleDevices();
      expect(idle).toHaveLength(3); // d1, d2, d3
    });

    it('getTotalDeviceCount should count all devices', () => {
      expect(registry.getTotalDeviceCount()).toBe(3);
    });

    it('getAvailableWorkers should return workers that can accept jobs', () => {
      const available = registry.getAvailableWorkers();
      expect(available).toHaveLength(2);
    });

    it('clear should remove all workers', () => {
      registry.clear();
      expect(registry.getWorkerCount()).toBe(0);
    });
  });
});
