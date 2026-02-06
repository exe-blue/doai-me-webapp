/**
 * WorkflowExecutionRepository
 * 
 * 워크플로우 실행 관리
 */

import { getSupabase } from '../supabase';
import type { 
  WorkflowExecution, 
  WorkflowExecutionInsert, 
  WorkflowExecutionUpdate,
  ExecutionStatus,
  ExecutionLog,
  ExecutionLogInsert,
  LogLevel,
  LogStatus,
  Workflow
} from '../types';

// 실행 + 워크플로우 + 디바이스 조인 타입
export interface ExecutionWithDetails extends WorkflowExecution {
  workflow?: Pick<Workflow, 'name'> | null;
  device?: { name: string | null; model: string | null } | null;
}

export class WorkflowExecutionRepository {
  private get db() {
    return getSupabase();
  }

  // ============================================
  // 조회
  // ============================================

  /**
   * ID로 실행 조회
   */
  async findById(id: string): Promise<WorkflowExecution | null> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /**
   * execution_id로 실행 조회
   */
  async findByExecutionId(executionId: string): Promise<WorkflowExecution | null> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .select('*')
      .eq('execution_id', executionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /**
   * 디바이스의 실행 이력 조회
   */
  async findByDeviceId(deviceId: string, limit: number = 50): Promise<WorkflowExecution[]> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * 상태별 실행 목록 조회
   */
  async findByStatus(status: ExecutionStatus): Promise<WorkflowExecution[]> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * 최근 실행 목록 조회 (상세 정보 포함)
   */
  async getRecent(limit: number = 100): Promise<ExecutionWithDetails[]> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .select(`
        *,
        workflow:workflows(name),
        device:devices(name, model)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as ExecutionWithDetails[];
  }

  /**
   * 실행 중인 워크플로우 조회
   */
  async findRunning(): Promise<WorkflowExecution[]> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .select('*')
      .in('status', ['running', 'pending'])
      .order('started_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ============================================
  // 생성
  // ============================================

  /**
   * 실행 레코드 생성
   */
  async create(execution: WorkflowExecutionInsert): Promise<WorkflowExecution> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .insert({
        ...execution,
        status: execution.status || 'queued',
        execution_id: execution.execution_id || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================
  // 상태 업데이트
  // ============================================

  /**
   * 실행 상태 업데이트
   */
  async updateStatus(
    id: string,
    status: ExecutionStatus,
    extra?: {
      current_step?: string;
      progress?: number;
      result?: unknown;
      error_message?: string;
      completed_devices?: number;
      failed_devices?: number;
      started_at?: string;
    }
  ): Promise<void> {
    const update: WorkflowExecutionUpdate = { status, ...extra };

    // 시작 시간 자동 설정
    if (status === 'running' && !extra?.started_at) {
      update.started_at = new Date().toISOString();
    }

    // 완료 시간 자동 설정
    if (['completed', 'failed', 'cancelled', 'partial'].includes(status)) {
      update.completed_at = new Date().toISOString();
    }

    const { error } = await this.db
      .from('workflow_executions')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * execution_id로 상태 업데이트
   */
  async updateStatusByExecutionId(
    executionId: string,
    status: ExecutionStatus,
    extra?: Partial<WorkflowExecutionUpdate>
  ): Promise<void> {
    const update: WorkflowExecutionUpdate = { status, ...extra };

    if (status === 'running') {
      update.started_at = new Date().toISOString();
    }
    if (['completed', 'failed', 'cancelled', 'partial'].includes(status)) {
      update.completed_at = new Date().toISOString();
    }

    const { error } = await this.db
      .from('workflow_executions')
      .update(update)
      .eq('execution_id', executionId);

    if (error) throw error;
  }

  /**
   * 진행률 업데이트
   */
  async updateProgress(
    id: string,
    progress: number,
    currentStep?: string
  ): Promise<void> {
    const update: WorkflowExecutionUpdate = { progress };
    if (currentStep) {
      update.current_step = currentStep;
    }

    const { error } = await this.db
      .from('workflow_executions')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 디바이스 완료/실패 카운트 증가 (atomic operation)
   * Uses atomic DB operation to avoid read-modify-write race conditions
   */
  async incrementDeviceCount(
    id: string,
    type: 'completed' | 'failed'
  ): Promise<void> {
    // Try RPC first for atomic increment with status calculation
    try {
      const { error: rpcError } = await this.db.rpc('increment_execution_device_count', {
        exec_id: id,
        count_type: type,
      });

      if (rpcError) {
        // Fallback to atomic SQL if RPC doesn't exist
        if (rpcError.code === '42883') { // function does not exist
          await this.incrementDeviceCountFallback(id, type);
        } else {
          throw rpcError;
        }
      }
    } catch (e) {
      // If RPC call throws, try fallback
      await this.incrementDeviceCountFallback(id, type);
    }
  }

  /**
   * Fallback atomic increment using raw SQL via Supabase
   * Single atomic UPDATE with conditional status change and retry on race condition
   */
  private async incrementDeviceCountFallback(
    id: string,
    type: 'completed' | 'failed',
    maxRetries: number = 3
  ): Promise<void> {
    const columnToIncrement = type === 'completed' ? 'completed_devices' : 'failed_devices';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Read current state
      const { data, error } = await this.db
        .from('workflow_executions')
        .select('total_devices, completed_devices, failed_devices')
        .eq('id', id)
        .single();

      if (error || !data) {
        if (error) throw error;
        return; // Record not found
      }

      // Recompute new values on each attempt
      const currentCompleted = data.completed_devices ?? 0;
      const currentFailed = data.failed_devices ?? 0;
      const newCompleted = type === 'completed' ? currentCompleted + 1 : currentCompleted;
      const newFailed = type === 'failed' ? currentFailed + 1 : currentFailed;
      const total = data.total_devices ?? 0;
      const currentValue = type === 'completed' ? currentCompleted : currentFailed;

      // Build atomic update
      const update: WorkflowExecutionUpdate = {
        [columnToIncrement]: type === 'completed' ? newCompleted : newFailed,
      };

      // Check if all devices are processed
      if (newCompleted + newFailed >= total && total > 0) {
        if (newFailed === 0) {
          update.status = 'completed';
        } else if (newCompleted === 0) {
          update.status = 'failed';
        } else {
          update.status = 'partial';
        }
        update.completed_at = new Date().toISOString();
      }

      // Attempt update with optimistic locking
      const { data: updateResult, error: updateError } = await this.db
        .from('workflow_executions')
        .update(update)
        .eq('id', id)
        .eq(columnToIncrement, currentValue)
        .select('id');

      if (updateError) {
        throw updateError;
      }

      // Check if update affected any rows (optimistic lock success)
      if (updateResult && updateResult.length > 0) {
        return; // Success
      }

      // No rows affected - race condition detected, retry
      if (attempt < maxRetries) {
        // Small delay before retry to reduce contention
        await new Promise(resolve => setTimeout(resolve, 10 * attempt));
      }
    }

    // Exhausted retries
    throw new Error(`Concurrency error: failed to increment ${columnToIncrement} after ${maxRetries} attempts`);
  }

  // ============================================
  // 삭제
  // ============================================

  /**
   * 실행 레코드 삭제
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from('workflow_executions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ============================================
  // 로그
  // ============================================

  /**
   * 실행 로그 추가
   */
  async addLog(
    executionId: string,
    level: LogLevel,
    message: string,
    options?: {
      step_id?: string;
      device_id?: string;
      workflow_id?: string;
      status?: LogStatus;
      data?: unknown;
    }
  ): Promise<void> {
    const log: ExecutionLogInsert = {
      execution_id: executionId,
      level,
      message,
      step_id: options?.step_id,
      device_id: options?.device_id,
      workflow_id: options?.workflow_id,
      status: options?.status,
      data: options?.data as never,
    };

    const { error } = await this.db
      .from('execution_logs')
      .insert(log);

    if (error) throw error;
  }

  /**
   * 실행 로그 조회
   */
  async getLogs(
    executionId: string,
    options?: { limit?: number; level?: LogLevel }
  ): Promise<ExecutionLog[]> {
    let query = this.db
      .from('execution_logs')
      .select('*')
      .eq('execution_id', executionId)
      .order('created_at', { ascending: true });

    if (options?.level) {
      query = query.eq('level', options.level);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * 디바이스별 최근 로그 조회
   */
  async getDeviceLogs(deviceId: string, limit: number = 100): Promise<ExecutionLog[]> {
    const { data, error } = await this.db
      .from('execution_logs')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  // ============================================
  // 통계
  // ============================================

  /**
   * 상태별 실행 수
   */
  async countByStatus(): Promise<Record<ExecutionStatus, number>> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .select('status');

    if (error) throw error;

    const counts: Record<ExecutionStatus, number> = {
      queued: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      partial: 0,
    };

    (data || []).forEach((e) => {
      const status = e.status as ExecutionStatus;
      if (status in counts) {
        counts[status]++;
      }
    });

    return counts;
  }

  /**
   * 기간별 실행 통계
   */
  async getStats(fromDate: Date, toDate: Date): Promise<{
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  }> {
    const { data, error } = await this.db
      .from('workflow_executions')
      .select('status')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    if (error) throw error;

    const total = data?.length || 0;
    const completed = data?.filter((e) => e.status === 'completed').length || 0;
    const failed = data?.filter((e) => e.status === 'failed').length || 0;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, failed, successRate };
  }
}

// 싱글톤 인스턴스
let instance: WorkflowExecutionRepository | null = null;

export function getWorkflowExecutionRepository(): WorkflowExecutionRepository {
  if (!instance) {
    instance = new WorkflowExecutionRepository();
  }
  return instance;
}
