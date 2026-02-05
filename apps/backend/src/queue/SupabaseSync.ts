/**
 * SupabaseSyncService
 *
 * WorkflowWorker / QueueManager 이벤트를 리스닝하여 Supabase 자동 동기화
 *
 * Fire-and-forget 패턴: 동기화 실패 시 로깅만, 워크플로우 차단 안 함
 *
 * 동기화 대상:
 *  - workflow_executions — 상태 (running/completed/failed/partial)
 *  - execution_logs — 스텝별 진행/에러 로그
 *  - devices — 디바이스 상태 (RUNNING/IDLE/ERROR)
 *  - job_assignments — 연결된 경우 상태 업데이트
 */

import { getSupabase } from '../db/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/types';
import type { WorkflowWorker, WorkflowJobResult, WorkflowProgressEvent, WorkflowErrorEvent } from './WorkflowWorker';
import type { QueueManager } from './QueueManager';
import type { CeleryBridge } from './CeleryBridge';

// ============================================
// 타입
// ============================================

interface WorkflowStartEvent {
  job_id: string;
  workflow_id: string;
  device_ids: string[];
  node_id: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

// ============================================
// SupabaseSyncService
// ============================================

export class SupabaseSyncService {
  private db: SupabaseClient<Database>;

  constructor() {
    this.db = getSupabase();
  }

  /**
   * WorkflowWorker + QueueManager 이벤트 리스너 등록
   */
  attach(worker: WorkflowWorker, queueManager: QueueManager): void {
    // WorkflowWorker 이벤트
    worker.on('workflow:start', (data: WorkflowStartEvent) => {
      this.onWorkflowStart(data);
    });

    worker.on('workflow:progress', (data: WorkflowProgressEvent) => {
      this.onWorkflowProgress(data);
    });

    worker.on('workflow:complete', (data: WorkflowJobResult) => {
      this.onWorkflowComplete(data);
    });

    worker.on('workflow:error', (data: WorkflowErrorEvent) => {
      this.onWorkflowError(data);
    });

    // QueueManager 이벤트
    queueManager.on('job:failed', (data: { queueName: string; jobId: string; reason: string }) => {
      this.onJobFailed(data);
    });

    console.log('[SupabaseSync] Attached to WorkflowWorker and QueueManager');
  }

  /**
   * CeleryBridge 이벤트 리스너 등록
   */
  attachCeleryBridge(bridge: CeleryBridge): void {
    bridge.on('task:completed', (data: { taskId: string; taskName: string; result: unknown }) => {
      this.safeExec('celery:completed log', async () => {
        await this.db.from('execution_logs').insert({
          step_id: data.taskName,
          level: 'info',
          status: 'completed',
          message: `Celery task ${data.taskName} completed`,
          data: { task_id: data.taskId, result: data.result },
        } as AnyRecord);
      });
    });

    bridge.on('task:failed', (data: { taskId: string; taskName: string; error: string }) => {
      this.safeExec('celery:failed log', async () => {
        await this.db.from('execution_logs').insert({
          step_id: data.taskName,
          level: 'error',
          status: 'failed',
          message: `Celery task ${data.taskName} failed: ${data.error}`,
          data: { task_id: data.taskId },
        } as AnyRecord);
      });
    });

    console.log('[SupabaseSync] Attached to CeleryBridge');
  }

  // ============================================
  // 이벤트 핸들러
  // ============================================

  private onWorkflowStart(data: WorkflowStartEvent): void {
    this.safeExec('workflow:start', async () => {
      // workflow_executions INSERT
      await this.db.from('workflow_executions').insert({
        execution_id: data.job_id,
        workflow_id: data.workflow_id,
        device_ids: data.device_ids,
        node_id: data.node_id,
        node_ids: [data.node_id],
        status: 'running',
        total_devices: data.device_ids.length,
        started_at: new Date().toISOString(),
      } as AnyRecord);

      // execution_logs INSERT
      await this.db.from('execution_logs').insert({
        execution_id: data.job_id,
        workflow_id: data.workflow_id,
        level: 'info',
        status: 'started',
        message: `Workflow ${data.workflow_id} started for ${data.device_ids.length} device(s)`,
      } as AnyRecord);

      // devices UPDATE → RUNNING
      if (data.device_ids.length > 0) {
        await this.db
          .from('devices')
          .update({ state: 'RUNNING', last_workflow_id: data.workflow_id } as AnyRecord)
          .in('id', data.device_ids);
      }
    });
  }

  private onWorkflowProgress(data: WorkflowProgressEvent): void {
    this.safeExec('workflow:progress', async () => {
      // workflow_executions UPDATE
      await this.db
        .from('workflow_executions')
        .update({
          current_step: data.current_step,
          progress: data.progress,
        } as AnyRecord)
        .eq('execution_id', data.job_id);

      // execution_logs INSERT
      await this.db.from('execution_logs').insert({
        execution_id: data.job_id,
        device_id: data.device_id,
        step_id: data.current_step,
        level: 'info',
        status: 'progress',
        message: data.message || `Progress: ${data.progress}%`,
      } as AnyRecord);
    });
  }

  private onWorkflowComplete(data: WorkflowJobResult): void {
    this.safeExec('workflow:complete', async () => {
      const status = data.failed === 0
        ? 'completed'
        : data.success === 0
          ? 'failed'
          : 'partial';

      // workflow_executions UPDATE
      await this.db
        .from('workflow_executions')
        .update({
          status,
          completed_devices: data.success,
          failed_devices: data.failed,
          progress: 100,
          completed_at: new Date().toISOString(),
          result: { device_results: data.device_results, duration_ms: data.duration_ms },
        } as AnyRecord)
        .eq('execution_id', data.job_id);

      // execution_logs INSERT
      await this.db.from('execution_logs').insert({
        execution_id: data.job_id,
        level: 'info',
        status: 'completed',
        message: `Workflow completed: ${data.success} success, ${data.failed} failed (${data.duration_ms}ms)`,
      } as AnyRecord);

      // devices UPDATE → IDLE or ERROR
      const successDevices = data.device_results.filter((r) => r.success).map((r) => r.device_id);
      const failedDevices = data.device_results.filter((r) => !r.success).map((r) => r.device_id);

      if (successDevices.length > 0) {
        await this.db
          .from('devices')
          .update({ state: 'IDLE' } as AnyRecord)
          .in('id', successDevices);
      }

      if (failedDevices.length > 0) {
        await this.db
          .from('devices')
          .update({ state: 'ERROR' } as AnyRecord)
          .in('id', failedDevices);
      }
    });
  }

  private onWorkflowError(data: WorkflowErrorEvent): void {
    this.safeExec('workflow:error', async () => {
      // execution_logs INSERT
      await this.db.from('execution_logs').insert({
        execution_id: data.job_id,
        device_id: data.device_id,
        step_id: data.step_id,
        level: 'error',
        status: 'failed',
        message: data.error,
        data: { retry_count: data.retry_count },
      } as AnyRecord);

      // device → ERROR
      if (data.device_id && data.device_id !== 'server') {
        await this.db
          .from('devices')
          .update({ state: 'ERROR', last_error: data.error } as AnyRecord)
          .eq('id', data.device_id);
      }
    });
  }

  private onJobFailed(data: { queueName: string; jobId: string; reason: string }): void {
    this.safeExec('job:failed', async () => {
      await this.db
        .from('workflow_executions')
        .update({
          status: 'failed',
          error_message: data.reason,
          completed_at: new Date().toISOString(),
        } as AnyRecord)
        .eq('execution_id', data.jobId);
    });
  }

  // ============================================
  // 유틸
  // ============================================

  /**
   * Fire-and-forget: 에러 발생 시 로그만 출력, 절대 throw하지 않음
   */
  private safeExec(label: string, fn: () => Promise<void>): void {
    fn().catch((err) => {
      console.error(`[SupabaseSync] ${label} sync failed:`, (err as Error).message);
    });
  }
}

export default SupabaseSyncService;
