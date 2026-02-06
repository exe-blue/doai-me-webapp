// ============================================
// InternalQueue - 디바이스별 우선순위 작업 대기열
// 봇 내부에서 디바이스가 busy일 때 작업을 버퍼링
// ============================================

import { EventEmitter } from 'events';
import type { InternalQueueStore, StoredJob } from './InternalQueueStore';

/**
 * Job to be queued
 */
export interface QueuedJob {
  /** Unique job ID */
  id: string;
  /** Target device serial/ID */
  deviceId: string;
  /** Workflow ID to execute */
  workflowId: string;
  /** Job parameters */
  params: Record<string, unknown>;
  /** Priority (higher = executed first, default: 0) */
  priority: number;
  /** When the job was enqueued */
  enqueuedAt: number;
  /** Optional timeout in ms */
  timeoutMs?: number;
}

/**
 * InternalQueue events
 */
export interface InternalQueueEvents {
  'job:enqueued': (job: QueuedJob) => void;
  'job:dequeued': (job: QueuedJob) => void;
  'job:removed': (jobId: string) => void;
  'queue:empty': (deviceId: string) => void;
}

/**
 * Enqueue options
 */
export interface EnqueueOptions {
  id: string;
  deviceId: string;
  workflowId: string;
  params: Record<string, unknown>;
  priority?: number;
  timeoutMs?: number;
}

/**
 * InternalQueue
 * Device-level priority queue for buffering jobs when devices are busy
 */
export class InternalQueue extends EventEmitter {
  private queues: Map<string, QueuedJob[]> = new Map();
  private store: InternalQueueStore | null;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly saveDebounceMs: number;

  constructor(options?: {
    store?: InternalQueueStore;
    saveDebounceMs?: number;
  }) {
    super();
    this.store = options?.store ?? null;
    this.saveDebounceMs = options?.saveDebounceMs ?? 1000;
  }

  /**
   * Initialize: restore queues from persistent storage
   */
  async initialize(): Promise<void> {
    if (!this.store) return;

    const stored = await this.store.load();
    for (const [deviceId, jobs] of stored) {
      this.queues.set(deviceId, jobs.map(j => ({
        id: j.id,
        deviceId: j.deviceId,
        workflowId: j.workflowId,
        params: j.params,
        priority: j.priority,
        enqueuedAt: j.enqueuedAt,
        timeoutMs: j.timeoutMs,
      })));
    }
  }

  /**
   * Enqueue a job for a specific device
   * Jobs are sorted by priority (desc), then by enqueue time (asc)
   */
  async enqueue(options: EnqueueOptions): Promise<QueuedJob> {
    const job: QueuedJob = {
      id: options.id,
      deviceId: options.deviceId,
      workflowId: options.workflowId,
      params: options.params,
      priority: options.priority ?? 0,
      enqueuedAt: Date.now(),
      timeoutMs: options.timeoutMs,
    };

    let queue = this.queues.get(options.deviceId);
    if (!queue) {
      queue = [];
      this.queues.set(options.deviceId, queue);
    }

    queue.push(job);
    // Sort: higher priority first, earlier enqueue time first (for same priority)
    queue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });

    this.emit('job:enqueued', job);
    this.scheduleSave();

    return job;
  }

  /**
   * Dequeue the next job for a specific device
   * Returns null if no jobs are queued for the device
   */
  async dequeue(deviceId: string): Promise<QueuedJob | null> {
    const queue = this.queues.get(deviceId);
    if (!queue || queue.length === 0) {
      return null;
    }

    const job = queue.shift()!;

    if (queue.length === 0) {
      this.queues.delete(deviceId);
      this.emit('queue:empty', deviceId);
    }

    this.emit('job:dequeued', job);
    this.scheduleSave();

    return job;
  }

  /**
   * Peek at the next job for a device without removing it
   */
  peek(deviceId: string): QueuedJob | null {
    const queue = this.queues.get(deviceId);
    if (!queue || queue.length === 0) return null;
    return queue[0];
  }

  /**
   * Remove a specific job by ID
   */
  async removeJob(jobId: string): Promise<boolean> {
    for (const [deviceId, queue] of this.queues) {
      const idx = queue.findIndex(j => j.id === jobId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        if (queue.length === 0) {
          this.queues.delete(deviceId);
          this.emit('queue:empty', deviceId);
        }
        this.emit('job:removed', jobId);
        this.scheduleSave();
        return true;
      }
    }
    return false;
  }

  /**
   * Get queue depth for a specific device
   */
  getQueueDepth(deviceId: string): number {
    return this.queues.get(deviceId)?.length ?? 0;
  }

  /**
   * Get total number of queued jobs across all devices
   */
  getTotalQueuedJobs(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Get all device IDs that have queued jobs
   */
  getDevicesWithJobs(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get all jobs for a device (read-only copy)
   */
  getJobs(deviceId: string): readonly QueuedJob[] {
    return this.queues.get(deviceId) ?? [];
  }

  /**
   * Clear all jobs for a specific device
   */
  async clearDevice(deviceId: string): Promise<number> {
    const queue = this.queues.get(deviceId);
    if (!queue) return 0;

    const count = queue.length;
    this.queues.delete(deviceId);
    this.emit('queue:empty', deviceId);
    this.scheduleSave();
    return count;
  }

  /**
   * Clear all queues
   */
  async clearAll(): Promise<void> {
    this.queues.clear();
    if (this.store) {
      await this.store.clear();
    }
  }

  /**
   * Debounced save to persistent storage
   */
  private scheduleSave(): void {
    if (!this.store) return;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      await this.persistNow();
    }, this.saveDebounceMs);
  }

  /**
   * Force immediate persist (useful before shutdown)
   */
  async persistNow(): Promise<void> {
    if (!this.store) return;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    const toStore = new Map<string, StoredJob[]>();
    for (const [deviceId, jobs] of this.queues) {
      toStore.set(deviceId, jobs.map(j => ({
        id: j.id,
        deviceId: j.deviceId,
        workflowId: j.workflowId,
        params: j.params,
        priority: j.priority,
        enqueuedAt: j.enqueuedAt,
        timeoutMs: j.timeoutMs,
      })));
    }

    await this.store.save(toStore);
  }

  /**
   * Type-safe event listener registration
   */
  on<K extends keyof InternalQueueEvents>(
    event: K,
    listener: InternalQueueEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof InternalQueueEvents>(
    event: K,
    ...args: Parameters<InternalQueueEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
