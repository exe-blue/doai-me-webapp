/**
 * Queue Manager (Backend)
 * 
 * BullMQ Queue 관리 및 Job 추가/조회
 * WorkflowWorker와 함께 사용
 * 
 * 사용법:
 *   const qm = new QueueManager(redisUrl);
 *   await qm.addWorkflowJob('node-1', { ... });
 */

import { Queue, QueueEvents, Job, JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { EventEmitter } from 'node:events';
import type { WorkflowStep } from '../db/types';

// ============================================
// 타입 정의
// ============================================

export type { WorkflowStep };

export interface WorkflowJobData {
  job_id: string;
  workflow_id: string;
  workflow: WorkflowDefinition;
  device_ids: string[];
  node_id: string;
  params: Record<string, unknown>;
  priority?: number;
  job_assignment_id?: string;
  created_at: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  timeout: number;
  steps: WorkflowStep[];
}

export interface VideoExecutionJobData {
  execution_id: string;
  video_id: string;
  youtube_id: string;
  target_watch_seconds: number;
  priority: number;
  node_id?: string;
  device_id?: string;
  params: {
    like_probability?: number;
    comment_probability?: number;
    subscribe_probability?: number;
    comment_text?: string;
  };
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

// ============================================
// Queue Names
// ============================================

export const QUEUE_NAMES = {
  WORKFLOW: (nodeId: string) => `workflow:${nodeId}`,
  VIDEO_EXECUTION: 'video-execution',
  DEVICE_COMMAND: 'device-command',
  SCHEDULED_TASK: 'scheduled-task',
  CLEANUP: 'cleanup',
} as const;

// ============================================
// Default Job Options
// ============================================

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600, // 24시간
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600, // 7일
  },
};

// ============================================
// QueueManager Class
// ============================================

export class QueueManager extends EventEmitter {
  private connection: Redis;
  private queues: Map<string, Queue> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private isShuttingDown = false;

  constructor(config: string | { redisUrl: string }) {
    super();
    const redisUrl = typeof config === 'string' ? config : config.redisUrl;

    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // BullMQ 필수
      enableReadyCheck: false,
      lazyConnect: true,
    });

    this.connection.on('error', (err) => {
      console.error('[QueueManager] Redis connection error:', err.message);
      this.emit('error', err);
    });

    this.connection.on('connect', () => {
      console.log('[QueueManager] Redis connected');
      this.emit('connected');
    });
  }

  /**
   * 연결 초기화
   */
  async connect(): Promise<void> {
    await this.connection.connect();
  }

  /**
   * 워크플로우 Job 추가
   *
   * 호출 방법:
   *   addWorkflowJob(nodeId, jobData, options?)
   *   addWorkflowJob(jobDataWithNodeId)
   */
  async addWorkflowJob(
    nodeIdOrData: string | Omit<Partial<WorkflowJobData>, 'created_at'> & { node_id: string; workflow_id: string; device_ids: string[] },
    jobData?: WorkflowJobData,
    options?: Partial<JobsOptions>
  ): Promise<Job<WorkflowJobData>> {
    let nodeId: string;
    let data: WorkflowJobData;

    if (typeof nodeIdOrData === 'string') {
      nodeId = nodeIdOrData;
      data = jobData!;
    } else {
      // 단일 객체 호출 패턴 (server.ts 호환)
      nodeId = nodeIdOrData.node_id;
      data = {
        job_id: nodeIdOrData.job_id ?? `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        workflow_id: nodeIdOrData.workflow_id,
        workflow: nodeIdOrData.workflow as WorkflowDefinition,
        device_ids: nodeIdOrData.device_ids,
        node_id: nodeId,
        params: nodeIdOrData.params ?? {},
        priority: nodeIdOrData.priority,
        created_at: Date.now(),
      };
    }

    const queueName = QUEUE_NAMES.WORKFLOW(nodeId);
    const queue = this.getOrCreateQueue(queueName);

    const jobOptions: JobsOptions = {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
      priority: data.priority || 0,
      jobId: data.job_id,
    };

    const job = await queue.add('workflow', data, jobOptions);

    console.log(`[QueueManager] Job added: ${job.id} to queue ${queueName}`);
    this.emit('job:added', { queueName, jobId: job.id, nodeId });

    return job;
  }

  /**
   * 비디오 실행 Job 추가
   */
  async addVideoExecutionJob(
    jobData: VideoExecutionJobData,
    options?: Partial<JobsOptions>
  ): Promise<Job<VideoExecutionJobData>> {
    const queue = this.getOrCreateQueue(QUEUE_NAMES.VIDEO_EXECUTION);

    const jobOptions: JobsOptions = {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
      priority: jobData.priority,
      jobId: jobData.execution_id,
    };

    const job = await queue.add('video-execution', jobData, jobOptions);
    
    console.log(`[QueueManager] Video execution job added: ${job.id}`);
    this.emit('job:added', { queueName: QUEUE_NAMES.VIDEO_EXECUTION, jobId: job.id });
    
    return job;
  }

  /**
   * Job 상태 조회
   */
  async getJobStatus(jobId: string, queueName?: string): Promise<string | null> {
    if (queueName) {
      const queue = this.queues.get(queueName);
      if (!queue) return null;
      const job = await queue.getJob(jobId);
      if (!job) return null;
      return await job.getState();
    }

    // queueName 미지정 시 모든 큐에서 검색
    for (const [, queue] of this.queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        return await job.getState();
      }
    }
    return null;
  }

  /**
   * Job 조회
   */
  async getJob<T = unknown>(jobId: string, queueName: string): Promise<Job<T> | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    return await queue.getJob(jobId) as Job<T> | null;
  }

  /**
   * Job 취소
   */
  async cancelJob(jobId: string, queueName: string): Promise<boolean> {
    const job = await this.getJob(jobId, queueName);
    if (!job) return false;

    const state = await job.getState();
    
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      console.log(`[QueueManager] Job removed: ${jobId}`);
      return true;
    }
    
    if (state === 'active') {
      // Active job은 Worker에서 처리해야 함
      // 취소 요청 이벤트 발생
      this.emit('job:cancel-request', { jobId, queueName });
      return true;
    }

    return false;
  }

  /**
   * Queue 통계 조회
   */
  async getQueueStats(queueName: string): Promise<QueueStats | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    const { waiting, active, completed, failed, delayed, paused } = counts;

    return { waiting, active, completed, failed, delayed, paused };
  }

  /**
   * 모든 Queue 통계 조회
   */
  async getAllQueueStats(): Promise<Map<string, QueueStats>> {
    const stats = new Map<string, QueueStats>();
    
    for (const [name, queue] of this.queues) {
      const queueStats = await this.getQueueStats(name);
      if (queueStats) {
        stats.set(name, queueStats);
      }
    }

    return stats;
  }

  /**
   * Queue 일시 정지
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.pause();
      console.log(`[QueueManager] Queue paused: ${queueName}`);
    }
  }

  /**
   * Queue 재개
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.resume();
      console.log(`[QueueManager] Queue resumed: ${queueName}`);
    }
  }

  /**
   * 대기 중인 Job 목록 조회
   */
  async getWaitingJobs<T = unknown>(
    queueName: string,
    start = 0,
    end = 100
  ): Promise<Job<T>[]> {
    const queue = this.queues.get(queueName);
    if (!queue) return [];

    return await queue.getWaiting(start, end) as Job<T>[];
  }

  /**
   * 실패한 Job 재시도
   */
  async retryFailedJobs(queueName: string, count = 100): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) return 0;

    const failedJobs = await queue.getFailed(0, count);
    let retried = 0;

    for (const job of failedJobs) {
      try {
        await job.retry();
        retried++;
      } catch (err) {
        console.error(`[QueueManager] Failed to retry job ${job.id}:`, err);
      }
    }

    console.log(`[QueueManager] Retried ${retried} failed jobs in ${queueName}`);
    return retried;
  }

  /**
   * Queue 정리 (오래된 완료/실패 Job 삭제)
   */
  async cleanQueue(
    queueName: string,
    grace = 24 * 3600 * 1000, // 24시간
    limit = 1000
  ): Promise<number[]> {
    const queue = this.queues.get(queueName);
    if (!queue) return [0, 0];

    const [cleanedCompleted, cleanedFailed] = await Promise.all([
      queue.clean(grace, limit, 'completed'),
      queue.clean(grace, limit, 'failed'),
    ]);

    console.log(`[QueueManager] Cleaned ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs from ${queueName}`);
    
    return [cleanedCompleted.length, cleanedFailed.length];
  }

  /**
   * Queue 가져오기 또는 생성
   */
  private getOrCreateQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: this.connection.duplicate(),
      });

      // Queue 이벤트 구독
      const events = new QueueEvents(queueName, {
        connection: this.connection.duplicate(),
      });

      events.on('completed', ({ jobId, returnvalue }) => {
        this.emit('job:completed', { queueName, jobId, result: returnvalue });
      });

      events.on('failed', ({ jobId, failedReason }) => {
        this.emit('job:failed', { queueName, jobId, reason: failedReason });
      });

      events.on('progress', ({ jobId, data }) => {
        this.emit('job:progress', { queueName, jobId, progress: data });
      });

      this.queues.set(queueName, queue);
      this.queueEvents.set(queueName, events);

      console.log(`[QueueManager] Queue created: ${queueName}`);
    }

    return this.queues.get(queueName)!;
  }

  /**
   * 종료
   */
  async close(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[QueueManager] Shutting down...');

    // Queue Events 종료
    for (const [name, events] of this.queueEvents) {
      try {
        await events.close();
        console.log(`[QueueManager] QueueEvents closed: ${name}`);
      } catch (err) {
        console.error(`[QueueManager] Error closing QueueEvents ${name}:`, err);
      }
    }

    // Queue 종료
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
        console.log(`[QueueManager] Queue closed: ${name}`);
      } catch (err) {
        console.error(`[QueueManager] Error closing queue ${name}:`, err);
      }
    }

    // Redis 연결 종료
    try {
      await this.connection.quit();
      console.log('[QueueManager] Redis connection closed');
    } catch (err) {
      console.error('[QueueManager] Error closing Redis:', err);
    }

    this.queues.clear();
    this.queueEvents.clear();

    console.log('[QueueManager] Shutdown complete');
  }
}

// ============================================
// Singleton Export
// ============================================

let instance: QueueManager | null = null;

export function getQueueManager(config?: string | { redisUrl: string }): QueueManager {
  if (!instance) {
    instance = new QueueManager(config ?? process.env.REDIS_URL ?? 'redis://localhost:6379');
  }
  return instance;
}

export default QueueManager;
