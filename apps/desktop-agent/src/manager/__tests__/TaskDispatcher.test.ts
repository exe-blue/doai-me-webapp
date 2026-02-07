import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskDispatcher } from '../TaskDispatcher';
import { WorkerRegistry } from '../WorkerRegistry';
import type { EvtJobProgress, EvtJobComplete } from '@doai/worker-types';
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

describe('TaskDispatcher', () => {
  let registry: WorkerRegistry;
  let dispatcher: TaskDispatcher;
  let socket: Socket;

  beforeEach(() => {
    registry = new WorkerRegistry();
    dispatcher = new TaskDispatcher(registry);

    socket = createMockSocket();

    // Register a worker with idle devices
    registry.registerWorker(
      {
        workerId: 'worker-1',
        workerType: 'youtube',
        version: '1.0.0',
        capabilities: [{ name: 'youtube_bot', enabled: true, version: '1.0.0' }],
        connectedDevices: ['device-1', 'device-2'],
        maxConcurrentJobs: 3,
        host: { hostname: 'test', platform: 'win32', arch: 'x64' },
      },
      socket
    );
  });

  // ================================================================
  // Dispatch
  // ================================================================

  describe('dispatchJob', () => {
    it('should dispatch a job to available worker', async () => {
      const job = await dispatcher.dispatchJob('job-1', 'youtube_watch', { query: 'test' });

      expect(job).not.toBeNull();
      expect(job!.job_id).toBe('job-1');
      expect(job!.worker_id).toBe('worker-1');
      expect(job!.status).toBe('dispatched');
      expect(job!.device_ids).toHaveLength(1);
      expect(socket.emit).toHaveBeenCalledWith('cmd:execute_job', expect.objectContaining({
        jobId: 'job-1',
        workflowId: 'youtube_watch',
      }));
    });

    it('should return null when no workers available', async () => {
      registry.clear();
      const job = await dispatcher.dispatchJob('job-1', 'youtube_watch', {});
      expect(job).toBeNull();
    });

    it('should return existing job if already dispatched', async () => {
      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});
      const job2 = await dispatcher.dispatchJob('job-1', 'youtube_watch', {});

      expect(job2!.job_id).toBe('job-1');
    });

    it('should emit job:dispatched event', async () => {
      const listener = vi.fn();
      dispatcher.on('job:dispatched', listener);

      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});

      expect(listener).toHaveBeenCalledOnce();
    });

    it('should filter by worker type', async () => {
      const job = await dispatcher.dispatchJob('job-1', 'task', {}, {
        targetWorkerType: 'generic',
      });

      expect(job).toBeNull(); // No generic workers registered
    });
  });

  // ================================================================
  // Job Progress
  // ================================================================

  describe('handleJobProgress', () => {
    it('should update job progress', async () => {
      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});

      const progress: EvtJobProgress = {
        jobId: 'job-1',
        progress: 50,
        currentStep: 'searching',
        timestamp: Date.now(),
        deviceId: 'device-1',
      };

      dispatcher.handleJobProgress(progress, 'worker-1');

      const job = dispatcher.getJob('job-1');
      expect(job?.status).toBe('running');
      expect(job?.progress).toBe(50);
      expect(job?.current_step).toBe('searching');
    });

    it('should emit job:progress event', async () => {
      const listener = vi.fn();
      dispatcher.on('job:progress', listener);

      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});

      dispatcher.handleJobProgress(
        { jobId: 'job-1', progress: 30, currentStep: 'step1', timestamp: Date.now(), deviceId: 'd1' },
        'worker-1'
      );

      expect(listener).toHaveBeenCalledOnce();
    });

    it('should ignore progress from wrong worker', async () => {
      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});

      dispatcher.handleJobProgress(
        { jobId: 'job-1', progress: 30, currentStep: 'step1', timestamp: Date.now(), deviceId: 'd1' },
        'wrong-worker'
      );

      const job = dispatcher.getJob('job-1');
      expect(job?.progress).toBe(0); // Unchanged
    });

    it('should ignore progress for unknown job', () => {
      // Should not throw
      dispatcher.handleJobProgress(
        { jobId: 'unknown', progress: 30, currentStep: 'step1', timestamp: Date.now(), deviceId: 'd1' },
        'worker-1'
      );
    });
  });

  // ================================================================
  // Job Completion
  // ================================================================

  describe('handleJobComplete', () => {
    it('should mark job as completed on success', async () => {
      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});

      const completeData: EvtJobComplete = {
        jobId: 'job-1',
        success: true,
        completedAt: Date.now(),
        durationMs: 5000,
        result: { views: 100 },
      };

      dispatcher.handleJobComplete(completeData, 'worker-1');

      const job = dispatcher.getJob('job-1');
      expect(job?.status).toBe('completed');
      expect(job?.progress).toBe(100);
      expect(job?.result).toEqual({ views: 100 });
    });

    it('should mark job as failed on failure', async () => {
      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});

      const completeData: EvtJobComplete = {
        jobId: 'job-1',
        success: false,
        completedAt: Date.now(),
        durationMs: 3000,
        error: { code: 'TIMEOUT', message: 'Timed out', recoverable: true },
      };

      dispatcher.handleJobComplete(completeData, 'worker-1');

      const job = dispatcher.getJob('job-1');
      expect(job?.status).toBe('failed');
      expect(job?.error?.code).toBe('TIMEOUT');
    });

    it('should emit job:complete event on success', async () => {
      const completeListener = vi.fn();
      dispatcher.on('job:complete', completeListener);

      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});
      dispatcher.handleJobComplete(
        { jobId: 'job-1', success: true, completedAt: Date.now(), durationMs: 1000 },
        'worker-1'
      );

      expect(completeListener).toHaveBeenCalledOnce();
    });

    it('should emit job:failed event on failure', async () => {
      const failListener = vi.fn();
      dispatcher.on('job:failed', failListener);

      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});
      dispatcher.handleJobComplete(
        {
          jobId: 'job-1',
          success: false,
          completedAt: Date.now(),
          durationMs: 1000,
          error: { code: 'ERR', message: 'fail', recoverable: false },
        },
        'worker-1'
      );

      expect(failListener).toHaveBeenCalledOnce();
    });
  });

  // ================================================================
  // Cancellation
  // ================================================================

  describe('cancelJob', () => {
    it('should cancel a dispatched job', async () => {
      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});

      const cancelled = await dispatcher.cancelJob('job-1', 'user request');

      expect(cancelled).toBe(true);
      expect(dispatcher.getJob('job-1')?.status).toBe('cancelled');
      expect(socket.emit).toHaveBeenCalledWith('cmd:cancel_job', expect.objectContaining({
        jobId: 'job-1',
        reason: 'user request',
      }));
    });

    it('should return false for unknown job', async () => {
      const cancelled = await dispatcher.cancelJob('unknown');
      expect(cancelled).toBe(false);
    });

    it('should not cancel already completed job', async () => {
      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});
      dispatcher.handleJobComplete(
        { jobId: 'job-1', success: true, completedAt: Date.now(), durationMs: 1000 },
        'worker-1'
      );

      const cancelled = await dispatcher.cancelJob('job-1');
      expect(cancelled).toBe(false);
    });

    it('should emit job:cancelled event', async () => {
      const listener = vi.fn();
      dispatcher.on('job:cancelled', listener);

      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});
      await dispatcher.cancelJob('job-1');

      expect(listener).toHaveBeenCalledOnce();
    });

    it('should cancel even if worker is not found', async () => {
      await dispatcher.dispatchJob('job-1', 'youtube_watch', {});
      registry.clear(); // Remove all workers

      const cancelled = await dispatcher.cancelJob('job-1');
      expect(cancelled).toBe(true);
    });
  });

  // ================================================================
  // Queries
  // ================================================================

  describe('queries', () => {
    it('getActiveJobs should return non-terminal jobs', async () => {
      await dispatcher.dispatchJob('job-1', 'task1', {});
      await dispatcher.dispatchJob('job-2', 'task2', {});

      dispatcher.handleJobComplete(
        { jobId: 'job-1', success: true, completedAt: Date.now(), durationMs: 100 },
        'worker-1'
      );

      expect(dispatcher.getActiveJobs()).toHaveLength(1);
      expect(dispatcher.getActiveJobCount()).toBe(1);
    });

    it('getJobsByStatus should filter correctly', async () => {
      await dispatcher.dispatchJob('job-1', 'task1', {});
      dispatcher.handleJobComplete(
        { jobId: 'job-1', success: true, completedAt: Date.now(), durationMs: 100 },
        'worker-1'
      );

      expect(dispatcher.getJobsByStatus('completed')).toHaveLength(1);
      expect(dispatcher.getJobsByStatus('dispatched')).toHaveLength(0);
    });

    it('getJobsByWorker should filter correctly', async () => {
      await dispatcher.dispatchJob('job-1', 'task1', {});

      expect(dispatcher.getJobsByWorker('worker-1')).toHaveLength(1);
      expect(dispatcher.getJobsByWorker('other')).toHaveLength(0);
    });

    it('pruneOldJobs should remove old terminal jobs', async () => {
      await dispatcher.dispatchJob('job-1', 'task1', {});
      dispatcher.handleJobComplete(
        { jobId: 'job-1', success: true, completedAt: Date.now() - 10000, durationMs: 100 },
        'worker-1'
      );

      const pruned = dispatcher.pruneOldJobs(5000); // 5s max age
      expect(pruned).toBe(1);
      expect(dispatcher.getJob('job-1')).toBeUndefined();
    });

    it('clear should remove all jobs', async () => {
      await dispatcher.dispatchJob('job-1', 'task1', {});
      dispatcher.clear();
      expect(dispatcher.getAllJobs()).toHaveLength(0);
    });
  });
});
