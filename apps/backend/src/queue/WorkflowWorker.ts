/**
 * Workflow Worker (Backend)
 * 
 * BullMQ Worker로 Job을 처리하고 Socket.IO를 통해 Desktop Agent에 전달
 * 
 * 흐름:
 * 1. BullMQ Queue에서 Job 가져옴
 * 2. Socket.IO로 해당 노드의 Agent에 EXECUTE_WORKFLOW 이벤트 전송
 * 3. Agent로부터 진행/완료/에러 이벤트 수신
 * 4. Redis 상태 업데이트
 * 5. Supabase 로그 저장
 */

import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { EventEmitter } from 'node:events';
import { CeleryBridge, CeleryTaskResult } from './CeleryBridge';
import type { WorkflowStep } from '../db/types';

// Forward-declared to avoid circular dependency
import type { SupabaseSyncService } from './SupabaseSync';

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

export interface WorkflowJobResult {
  job_id: string;
  total: number;
  success: number;
  failed: number;
  duration_ms: number;
  device_results: DeviceResult[];
}

export interface DeviceResult {
  device_id: string;
  success: boolean;
  error?: string;
  duration_ms: number;
}

export interface WorkflowWorkerConfig {
  redisUrl: string;
  jobTimeout: number;
  agentResponseTimeout: number;
  celeryApiUrl: string;
}

// ============================================
// Socket.IO 이벤트 타입
// ============================================

// 서버 → 에이전트
export interface ExecuteWorkflowEvent {
  job_id: string;
  workflow_id: string;
  workflow: WorkflowDefinition;
  device_ids: string[];
  params: Record<string, unknown>;
}

// 에이전트 → 서버
export interface WorkflowProgressEvent {
  job_id: string;
  device_id: string;
  current_step: string;
  progress: number;
  message?: string;
}

export interface WorkflowCompleteEvent {
  job_id: string;
  device_id: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface WorkflowErrorEvent {
  job_id: string;
  device_id: string;
  step_id: string;
  error: string;
  error_code?: string;
  retry_count: number;
}

// ============================================
// 상수
// ============================================

const DEFAULT_CONFIG: WorkflowWorkerConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jobTimeout: 300000,        // 5분
  agentResponseTimeout: 30000, // 30초
  celeryApiUrl: process.env.CELERY_API_URL || 'http://localhost:8000',
};

const SOCKET_EVENTS = {
  // 서버 → 에이전트
  EXECUTE_WORKFLOW: 'EXECUTE_WORKFLOW',
  CANCEL_WORKFLOW: 'CANCEL_WORKFLOW',
  PING: 'PING',
  // 에이전트 → 서버
  REGISTER: 'REGISTER',
  DEVICE_STATUS: 'DEVICE_STATUS',
  WORKFLOW_PROGRESS: 'WORKFLOW_PROGRESS',
  WORKFLOW_COMPLETE: 'WORKFLOW_COMPLETE',
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  PONG: 'PONG',
} as const;

// ============================================
// WorkflowWorker 클래스
// ============================================

export class WorkflowWorker extends EventEmitter {
  private config: WorkflowWorkerConfig;
  private connection: Redis;
  private workers: Map<string, Worker> = new Map();
  private io: SocketIOServer | null = null;
  private celeryBridge: CeleryBridge;
  private supabaseSync: SupabaseSyncService | null = null;

  // 노드별 소켓 매핑
  private nodeSocketMap: Map<string, Socket> = new Map();

  // 진행 중인 Job 추적
  private pendingJobs: Map<string, {
    resolve: (result: WorkflowJobResult) => void;
    reject: (error: Error) => void;
    deviceResults: Map<string, DeviceResult>;
    totalDevices: number;
    completedDevices: number;
    startTime: number;
  }> = new Map();

  constructor(config: Partial<WorkflowWorkerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.connection = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.celeryBridge = new CeleryBridge({
      apiUrl: this.config.celeryApiUrl,
    });
  }

  /**
   * Socket.IO 서버 설정
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
    this.setupSocketHandlers();
  }

  /**
   * Socket.IO 이벤트 핸들러 설정
   */
  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      console.log(`[WorkflowWorker] Socket connected: ${socket.id}`);

      // 노드 등록
      socket.on(SOCKET_EVENTS.REGISTER, (data: { node_id: string }) => {
        const { node_id } = data;
        this.nodeSocketMap.set(node_id, socket);
        socket.data.nodeId = node_id;
        console.log(`[WorkflowWorker] Node registered: ${node_id}`);
        this.emit('node:registered', node_id);
      });

      // 워크플로우 진행 상황
      socket.on(SOCKET_EVENTS.WORKFLOW_PROGRESS, (data: WorkflowProgressEvent) => {
        this.handleWorkflowProgress(data);
      });

      // 워크플로우 완료
      socket.on(SOCKET_EVENTS.WORKFLOW_COMPLETE, (data: WorkflowCompleteEvent) => {
        this.handleWorkflowComplete(data);
      });

      // 워크플로우 에러
      socket.on(SOCKET_EVENTS.WORKFLOW_ERROR, (data: WorkflowErrorEvent) => {
        this.handleWorkflowError(data);
      });

      // 디바이스 상태
      socket.on(SOCKET_EVENTS.DEVICE_STATUS, (data) => {
        this.emit('device:status', data);
      });

      // 연결 해제
      socket.on('disconnect', () => {
        const nodeId = socket.data.nodeId;
        if (nodeId) {
          this.nodeSocketMap.delete(nodeId);
          console.log(`[WorkflowWorker] Node disconnected: ${nodeId}`);
          this.emit('node:disconnected', nodeId);
          
          // 해당 노드의 진행 중인 Job 실패 처리
          this.handleNodeDisconnect(nodeId);
        }
      });
    });
  }

  /**
   * 노드별 Worker 생성
   */
  createWorkerForNode(nodeId: string): Worker {
    const queueName = `workflow:${nodeId}`;
    
    const worker = new Worker<WorkflowJobData, WorkflowJobResult>(
      queueName,
      async (job) => this.processJob(job),
      {
        connection: this.connection.duplicate(),
        concurrency: 5, // 노드당 동시 Job 수
      }
    );

    worker.on('completed', (job, result) => {
      console.log(`[WorkflowWorker] Job ${job.id} completed:`, {
        success: result.success,
        failed: result.failed,
      });
    });

    worker.on('failed', (job, error) => {
      console.error(`[WorkflowWorker] Job ${job?.id} failed:`, error.message);
    });

    this.workers.set(nodeId, worker);
    console.log(`[WorkflowWorker] Worker created for node: ${nodeId}`);
    
    return worker;
  }

  /**
   * SupabaseSyncService 연결
   */
  setSupabaseSync(sync: SupabaseSyncService): void {
    this.supabaseSync = sync;
  }

  /**
   * CeleryBridge 인스턴스 반환
   */
  getCeleryBridge(): CeleryBridge {
    return this.celeryBridge;
  }

  /**
   * Job 처리 - Celery 스텝과 Agent 스텝 분리 실행
   */
  private async processJob(job: Job<WorkflowJobData, WorkflowJobResult>): Promise<WorkflowJobResult> {
    const { job_id, workflow_id, workflow, device_ids, node_id, params } = job.data;
    const startTime = Date.now();

    console.log(`[WorkflowWorker] Processing job ${job_id}: ${workflow_id} for ${device_ids.length} devices`);

    // 이벤트: 워크플로우 시작
    this.emit('workflow:start', { job_id, workflow_id, device_ids, node_id });

    // 스텝을 celery(+appium) / agent로 분리
    // 'appium' 스텝도 서버사이드 Celery를 통해 실행
    const celerySteps = workflow.steps.filter((s) => s.action === 'celery' || s.action === 'appium');
    const agentSteps = workflow.steps.filter((s) => s.action !== 'celery' && s.action !== 'appium');

    const celeryResults: Array<{ stepId: string; success: boolean; error?: string }> = [];

    // 1. Celery 스텝 순차 실행 (서버 직접 실행)
    for (const step of celerySteps) {
      try {
        this.emit('workflow:progress', {
          job_id,
          device_id: device_ids[0] || 'server',
          current_step: step.id,
          progress: 0,
          message: `Executing celery task: ${step.celery_task}`,
        });

        await this.executeCeleryStep(job_id, step, params);
        celeryResults.push({ stepId: step.id, success: true });

        this.emit('workflow:progress', {
          job_id,
          device_id: device_ids[0] || 'server',
          current_step: step.id,
          progress: 100,
          message: `Celery task completed: ${step.celery_task}`,
        });
      } catch (error) {
        const errorMsg = (error as Error).message;
        celeryResults.push({ stepId: step.id, success: false, error: errorMsg });

        this.emit('workflow:error', {
          job_id,
          device_id: device_ids[0] || 'server',
          step_id: step.id,
          error: errorMsg,
          retry_count: 0,
        });

        // onError 정책 적용
        if (step.onError === 'fail') {
          const result: WorkflowJobResult = {
            job_id,
            total: device_ids.length,
            success: 0,
            failed: device_ids.length,
            duration_ms: Date.now() - startTime,
            device_results: device_ids.map((id) => ({
              device_id: id,
              success: false,
              error: `Celery step ${step.id} failed: ${errorMsg}`,
              duration_ms: Date.now() - startTime,
            })),
          };
          this.emit('workflow:complete', result);
          return result;
        }
        // 'skip' → continue to next step
      }
    }

    // 2. Agent 스텝이 있으면 기존 Socket.IO 흐름
    if (agentSteps.length > 0) {
      const socket = this.nodeSocketMap.get(node_id);
      if (!socket || !socket.connected) {
        throw new Error(`Node ${node_id} not connected`);
      }

      // Agent에게 보내는 워크플로우에는 agent 스텝만 포함
      const agentWorkflow = { ...workflow, steps: agentSteps };

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingJobs.delete(job_id);
          reject(new Error(`Job timeout after ${this.config.jobTimeout}ms`));
        }, agentWorkflow.timeout || this.config.jobTimeout);

        this.pendingJobs.set(job_id, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
          deviceResults: new Map(),
          totalDevices: device_ids.length,
          completedDevices: 0,
          startTime,
        });

        const executeEvent: ExecuteWorkflowEvent = {
          job_id,
          workflow_id,
          workflow: agentWorkflow,
          device_ids,
          params,
        };

        socket.emit(SOCKET_EVENTS.EXECUTE_WORKFLOW, executeEvent, (ack: { received: boolean }) => {
          if (!ack?.received) {
            this.pendingJobs.delete(job_id);
            clearTimeout(timeout);
            reject(new Error('Agent did not acknowledge workflow execution'));
          }
        });

        console.log(`[WorkflowWorker] Sent EXECUTE_WORKFLOW to node ${node_id}`);
      });
    }

    // 3. Celery 스텝만 있으면 바로 결과 반환
    const allSuccess = celeryResults.every((r) => r.success);
    const failedCount = celeryResults.filter((r) => !r.success).length;

    const result: WorkflowJobResult = {
      job_id,
      total: device_ids.length,
      success: allSuccess ? device_ids.length : device_ids.length - failedCount,
      failed: allSuccess ? 0 : failedCount,
      duration_ms: Date.now() - startTime,
      device_results: device_ids.map((id) => ({
        device_id: id,
        success: allSuccess,
        error: allSuccess ? undefined : celeryResults.find((r) => !r.success)?.error,
        duration_ms: Date.now() - startTime,
      })),
    };

    this.emit('workflow:complete', result);
    return result;
  }

  /**
   * 단일 Celery/Appium 스텝 실행
   */
  private async executeCeleryStep(
    jobId: string,
    step: WorkflowStep,
    params: Record<string, unknown>,
  ): Promise<CeleryTaskResult> {
    // 'appium' 스텝은 appium_task를 celery_task로 매핑
    const taskName = step.action === 'appium'
      ? (step.appium_task || step.celery_task)
      : step.celery_task;

    if (!taskName) {
      throw new Error(
        `Step ${step.id} has action=${step.action} but no ${step.action === 'appium' ? 'appium_task' : 'celery_task'} specified`
      );
    }

    const stepParams = step.action === 'appium' ? step.appium_params : step.celery_params;
    const mergedParams = { ...params, ...stepParams };

    return this.celeryBridge.executeTask(taskName, mergedParams, {
      timeout: step.timeout || 300000,
      onProgress: (result) => {
        if (result.progress !== undefined) {
          this.emit('workflow:progress', {
            job_id: jobId,
            device_id: 'server',
            current_step: step.id,
            progress: result.progress,
            message: `${step.action} ${taskName}: ${result.status}`,
          });
        }
      },
    });
  }

  /**
   * 워크플로우 진행 상황 처리
   */
  private handleWorkflowProgress(data: WorkflowProgressEvent): void {
    const { job_id, device_id, current_step, progress, message } = data;
    
    console.log(`[WorkflowWorker] Progress - Job: ${job_id}, Device: ${device_id}, Step: ${current_step}, Progress: ${progress}%`);
    
    this.emit('workflow:progress', data);
    
    // TODO: Redis 상태 업데이트
  }

  /**
   * 워크플로우 완료 처리
   */
  private handleWorkflowComplete(data: WorkflowCompleteEvent): void {
    const { job_id, device_id, success, duration, error } = data;
    
    console.log(`[WorkflowWorker] Complete - Job: ${job_id}, Device: ${device_id}, Success: ${success}`);
    
    const pending = this.pendingJobs.get(job_id);
    if (!pending) {
      console.warn(`[WorkflowWorker] No pending job found: ${job_id}`);
      return;
    }

    // 디바이스 결과 저장
    pending.deviceResults.set(device_id, {
      device_id,
      success,
      error,
      duration_ms: duration,
    });
    pending.completedDevices++;

    // 모든 디바이스 완료 확인
    if (pending.completedDevices >= pending.totalDevices) {
      const deviceResults = Array.from(pending.deviceResults.values());
      const result: WorkflowJobResult = {
        job_id,
        total: pending.totalDevices,
        success: deviceResults.filter(r => r.success).length,
        failed: deviceResults.filter(r => !r.success).length,
        duration_ms: Date.now() - pending.startTime,
        device_results: deviceResults,
      };

      this.pendingJobs.delete(job_id);
      pending.resolve(result);
      
      this.emit('workflow:complete', result);
    }
  }

  /**
   * 워크플로우 에러 처리
   */
  private handleWorkflowError(data: WorkflowErrorEvent): void {
    const { job_id, device_id, step_id, error, retry_count } = data;
    
    console.error(`[WorkflowWorker] Error - Job: ${job_id}, Device: ${device_id}, Step: ${step_id}, Error: ${error}`);
    
    // 에러도 완료로 처리 (실패)
    this.handleWorkflowComplete({
      job_id,
      device_id,
      success: false,
      duration: 0,
      error: `Step ${step_id} failed: ${error} (retries: ${retry_count})`,
    });
    
    this.emit('workflow:error', data);
  }

  /**
   * 노드 연결 해제 처리
   */
  private handleNodeDisconnect(nodeId: string): void {
    // 해당 노드의 진행 중인 Job 찾기 및 실패 처리
    for (const [jobId, pending] of this.pendingJobs) {
      // Job이 해당 노드의 것인지 확인하기 어려우므로 
      // 여기서는 emit만 하고, 타임아웃으로 처리
      this.emit('node:job:orphaned', { nodeId, jobId });
    }
  }

  /**
   * 연결된 노드 목록
   */
  getConnectedNodes(): string[] {
    return Array.from(this.nodeSocketMap.keys());
  }

  /**
   * 노드 연결 상태 확인
   */
  isNodeConnected(nodeId: string): boolean {
    const socket = this.nodeSocketMap.get(nodeId);
    return socket?.connected ?? false;
  }

  /**
   * 워크플로우 취소
   */
  async cancelWorkflow(nodeId: string, jobId: string): Promise<boolean> {
    const socket = this.nodeSocketMap.get(nodeId);
    if (!socket?.connected) {
      return false;
    }

    return new Promise((resolve) => {
      socket.emit(SOCKET_EVENTS.CANCEL_WORKFLOW, { job_id: jobId }, (ack: { cancelled: boolean }) => {
        resolve(ack?.cancelled ?? false);
      });
    });
  }

  /**
   * Worker 중지
   */
  async stop(): Promise<void> {
    console.log('[WorkflowWorker] Stopping...');

    // 모든 Worker 종료
    for (const [nodeId, worker] of this.workers) {
      await worker.close();
      console.log(`[WorkflowWorker] Worker stopped for node: ${nodeId}`);
    }
    this.workers.clear();

    // Pending Jobs 정리
    for (const [jobId, pending] of this.pendingJobs) {
      pending.reject(new Error('Worker shutting down'));
    }
    this.pendingJobs.clear();

    // Redis 연결 종료
    await this.connection.quit();

    console.log('[WorkflowWorker] Stopped');
  }
}

export default WorkflowWorker;
