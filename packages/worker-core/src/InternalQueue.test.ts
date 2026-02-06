import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InternalQueue, type QueuedJob } from './InternalQueue';
import { MemoryQueueStore, type StoredJob } from './InternalQueueStore';

describe('InternalQueue', () => {
  let queue: InternalQueue;

  beforeEach(() => {
    queue = new InternalQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------------
  // enqueue()
  // ----------------------------------------------------------------
  describe('enqueue()', () => {
    it('adds a job and returns a QueuedJob with correct fields', async () => {
      const job = await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-100',
        params: { key: 'value' },
        priority: 5,
        timeoutMs: 30000,
      });

      expect(job).toMatchObject({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-100',
        params: { key: 'value' },
        priority: 5,
        timeoutMs: 30000,
      });
      expect(typeof job.enqueuedAt).toBe('number');
      expect(job.enqueuedAt).toBeGreaterThan(0);
    });

    it('defaults priority to 0 when not specified', async () => {
      const job = await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });

      expect(job.priority).toBe(0);
    });

    it('defaults timeoutMs to undefined when not specified', async () => {
      const job = await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });

      expect(job.timeoutMs).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // dequeue()
  // ----------------------------------------------------------------
  describe('dequeue()', () => {
    it('returns null on empty queue', async () => {
      const result = await queue.dequeue('device-A');
      expect(result).toBeNull();
    });

    it('returns null for a device with no jobs', async () => {
      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });

      const result = await queue.dequeue('device-B');
      expect(result).toBeNull();
    });

    it('returns the job and removes it from the queue', async () => {
      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });

      const job = await queue.dequeue('device-A');
      expect(job).not.toBeNull();
      expect(job!.id).toBe('job-1');

      // Queue should now be empty
      const next = await queue.dequeue('device-A');
      expect(next).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // Priority ordering
  // ----------------------------------------------------------------
  describe('priority ordering', () => {
    it('dequeues higher priority jobs first', async () => {
      await queue.enqueue({
        id: 'low',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 1,
      });
      await queue.enqueue({
        id: 'high',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 10,
      });
      await queue.enqueue({
        id: 'medium',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 5,
      });

      const first = await queue.dequeue('device-A');
      const second = await queue.dequeue('device-A');
      const third = await queue.dequeue('device-A');

      expect(first!.id).toBe('high');
      expect(second!.id).toBe('medium');
      expect(third!.id).toBe('low');
    });
  });

  // ----------------------------------------------------------------
  // FIFO ordering (same priority)
  // ----------------------------------------------------------------
  describe('FIFO ordering for same priority', () => {
    it('dequeues in enqueue order when priorities are equal', async () => {
      // Use explicit enqueuedAt override by spying on Date.now
      let now = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      await queue.enqueue({
        id: 'first',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 0,
      });

      now = 2000;
      await queue.enqueue({
        id: 'second',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 0,
      });

      now = 3000;
      await queue.enqueue({
        id: 'third',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 0,
      });

      const a = await queue.dequeue('device-A');
      const b = await queue.dequeue('device-A');
      const c = await queue.dequeue('device-A');

      expect(a!.id).toBe('first');
      expect(b!.id).toBe('second');
      expect(c!.id).toBe('third');
    });
  });

  // ----------------------------------------------------------------
  // peek()
  // ----------------------------------------------------------------
  describe('peek()', () => {
    it('returns null for an empty device queue', () => {
      expect(queue.peek('device-A')).toBeNull();
    });

    it('returns the next job without removing it', async () => {
      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });

      const peeked = queue.peek('device-A');
      expect(peeked).not.toBeNull();
      expect(peeked!.id).toBe('job-1');

      // Should still be there after peek
      const dequeued = await queue.dequeue('device-A');
      expect(dequeued!.id).toBe('job-1');
    });

    it('returns the highest-priority job', async () => {
      await queue.enqueue({
        id: 'low',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 1,
      });
      await queue.enqueue({
        id: 'high',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 10,
      });

      expect(queue.peek('device-A')!.id).toBe('high');
    });
  });

  // ----------------------------------------------------------------
  // removeJob()
  // ----------------------------------------------------------------
  describe('removeJob()', () => {
    it('removes a specific job by ID and returns true', async () => {
      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      await queue.enqueue({
        id: 'job-2',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });

      const removed = await queue.removeJob('job-1');
      expect(removed).toBe(true);

      // Only job-2 should remain
      expect(queue.getQueueDepth('device-A')).toBe(1);
      const next = await queue.dequeue('device-A');
      expect(next!.id).toBe('job-2');
    });

    it('returns false when job ID is not found', async () => {
      const removed = await queue.removeJob('nonexistent');
      expect(removed).toBe(false);
    });

    it('removes job from correct device queue', async () => {
      await queue.enqueue({
        id: 'job-A',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      await queue.enqueue({
        id: 'job-B',
        deviceId: 'device-B',
        workflowId: 'wf-1',
        params: {},
      });

      await queue.removeJob('job-A');
      expect(queue.getQueueDepth('device-A')).toBe(0);
      expect(queue.getQueueDepth('device-B')).toBe(1);
    });
  });

  // ----------------------------------------------------------------
  // getQueueDepth()
  // ----------------------------------------------------------------
  describe('getQueueDepth()', () => {
    it('returns 0 for unknown device', () => {
      expect(queue.getQueueDepth('unknown')).toBe(0);
    });

    it('returns correct count per device', async () => {
      await queue.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j2', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j3', deviceId: 'B', workflowId: 'wf', params: {} });

      expect(queue.getQueueDepth('A')).toBe(2);
      expect(queue.getQueueDepth('B')).toBe(1);
    });
  });

  // ----------------------------------------------------------------
  // getTotalQueuedJobs()
  // ----------------------------------------------------------------
  describe('getTotalQueuedJobs()', () => {
    it('returns 0 when empty', () => {
      expect(queue.getTotalQueuedJobs()).toBe(0);
    });

    it('returns total across all devices', async () => {
      await queue.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j2', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j3', deviceId: 'B', workflowId: 'wf', params: {} });

      expect(queue.getTotalQueuedJobs()).toBe(3);
    });
  });

  // ----------------------------------------------------------------
  // getDevicesWithJobs()
  // ----------------------------------------------------------------
  describe('getDevicesWithJobs()', () => {
    it('returns empty array when no jobs', () => {
      expect(queue.getDevicesWithJobs()).toEqual([]);
    });

    it('returns device IDs with pending jobs', async () => {
      await queue.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j2', deviceId: 'B', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j3', deviceId: 'C', workflowId: 'wf', params: {} });

      const devices = queue.getDevicesWithJobs();
      expect(devices).toHaveLength(3);
      expect(devices).toContain('A');
      expect(devices).toContain('B');
      expect(devices).toContain('C');
    });
  });

  // ----------------------------------------------------------------
  // clearDevice()
  // ----------------------------------------------------------------
  describe('clearDevice()', () => {
    it('clears all jobs for a device and returns count', async () => {
      await queue.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j2', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j3', deviceId: 'B', workflowId: 'wf', params: {} });

      const count = await queue.clearDevice('A');
      expect(count).toBe(2);
      expect(queue.getQueueDepth('A')).toBe(0);
      expect(queue.getQueueDepth('B')).toBe(1);
    });

    it('returns 0 for unknown device', async () => {
      const count = await queue.clearDevice('unknown');
      expect(count).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // clearAll()
  // ----------------------------------------------------------------
  describe('clearAll()', () => {
    it('clears everything', async () => {
      await queue.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j2', deviceId: 'B', workflowId: 'wf', params: {} });

      await queue.clearAll();
      expect(queue.getTotalQueuedJobs()).toBe(0);
      expect(queue.getDevicesWithJobs()).toEqual([]);
    });

    it('calls store.clear() when store is provided', async () => {
      const store = new MemoryQueueStore();
      const clearSpy = vi.spyOn(store, 'clear');
      const queueWithStore = new InternalQueue({ store });

      await queueWithStore.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });
      await queueWithStore.clearAll();

      expect(clearSpy).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  describe('events', () => {
    it('emits "job:enqueued" when a job is enqueued', async () => {
      const handler = vi.fn();
      queue.on('job:enqueued', handler);

      const job = await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(job);
    });

    it('emits "job:dequeued" when a job is dequeued', async () => {
      const handler = vi.fn();
      queue.on('job:dequeued', handler);

      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      const job = await queue.dequeue('device-A');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(job);
    });

    it('emits "job:removed" when a job is removed', async () => {
      const handler = vi.fn();
      queue.on('job:removed', handler);

      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      await queue.removeJob('job-1');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('job-1');
    });

    it('emits "queue:empty" when last job is dequeued from a device', async () => {
      const handler = vi.fn();
      queue.on('queue:empty', handler);

      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      await queue.dequeue('device-A');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('device-A');
    });

    it('emits "queue:empty" when last job is removed from a device', async () => {
      const handler = vi.fn();
      queue.on('queue:empty', handler);

      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      await queue.removeJob('job-1');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('device-A');
    });

    it('does NOT emit "queue:empty" when there are still jobs remaining', async () => {
      const handler = vi.fn();
      queue.on('queue:empty', handler);

      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      await queue.enqueue({
        id: 'job-2',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      await queue.dequeue('device-A');

      expect(handler).not.toHaveBeenCalled();
    });

    it('emits "queue:empty" when clearDevice() empties a device queue', async () => {
      const handler = vi.fn();
      queue.on('queue:empty', handler);

      await queue.enqueue({
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
      });
      await queue.clearDevice('device-A');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('device-A');
    });
  });

  // ----------------------------------------------------------------
  // Persistence with MemoryQueueStore
  // ----------------------------------------------------------------
  describe('persistence', () => {
    it('initialize() restores jobs from store', async () => {
      const store = new MemoryQueueStore();
      const storedJobs: StoredJob[] = [
        {
          id: 'restored-1',
          deviceId: 'device-A',
          workflowId: 'wf-1',
          params: { foo: 'bar' },
          priority: 5,
          enqueuedAt: 1000,
        },
        {
          id: 'restored-2',
          deviceId: 'device-A',
          workflowId: 'wf-2',
          params: {},
          priority: 10,
          enqueuedAt: 2000,
        },
      ];
      await store.save(new Map([['device-A', storedJobs]]));

      const queueWithStore = new InternalQueue({ store });
      await queueWithStore.initialize();

      expect(queueWithStore.getQueueDepth('device-A')).toBe(2);
      expect(queueWithStore.getTotalQueuedJobs()).toBe(2);

      // Verify the restored jobs are accessible
      const peeked = queueWithStore.peek('device-A');
      expect(peeked).not.toBeNull();
      expect(peeked!.id).toBe('restored-1');
    });

    it('initialize() does nothing when no store is provided', async () => {
      const noStoreQueue = new InternalQueue();
      // Should not throw
      await noStoreQueue.initialize();
      expect(noStoreQueue.getTotalQueuedJobs()).toBe(0);
    });

    it('scheduleSave debounces persistence', async () => {
      vi.useFakeTimers();

      const store = new MemoryQueueStore();
      const saveSpy = vi.spyOn(store, 'save');
      const queueWithStore = new InternalQueue({ store, saveDebounceMs: 500 });

      await queueWithStore.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });
      await queueWithStore.enqueue({ id: 'j2', deviceId: 'A', workflowId: 'wf', params: {} });

      // Save should not have been called yet (debounced)
      expect(saveSpy).not.toHaveBeenCalled();

      // Advance past debounce period
      await vi.advanceTimersByTimeAsync(600);

      // Should only be called once due to debouncing
      expect(saveSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('persistNow() flushes immediately', async () => {
      const store = new MemoryQueueStore();
      const saveSpy = vi.spyOn(store, 'save');
      const queueWithStore = new InternalQueue({ store, saveDebounceMs: 5000 });

      await queueWithStore.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });

      // Force save immediately without waiting for debounce
      await queueWithStore.persistNow();

      expect(saveSpy).toHaveBeenCalledTimes(1);
      const savedMap = saveSpy.mock.calls[0][0];
      expect(savedMap.get('A')).toHaveLength(1);
      expect(savedMap.get('A')![0].id).toBe('j1');
    });
  });

  // ----------------------------------------------------------------
  // getJobs()
  // ----------------------------------------------------------------
  describe('getJobs()', () => {
    it('returns empty array for unknown device', () => {
      expect(queue.getJobs('unknown')).toEqual([]);
    });

    it('returns read-only copy of jobs', async () => {
      await queue.enqueue({ id: 'j1', deviceId: 'A', workflowId: 'wf', params: {} });
      await queue.enqueue({ id: 'j2', deviceId: 'A', workflowId: 'wf', params: {} });

      const jobs = queue.getJobs('A');
      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe('j1');
      expect(jobs[1].id).toBe('j2');
    });
  });
});
