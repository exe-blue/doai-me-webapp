/**
 * Workflow Socket.IO 이벤트 핸들러
 * 
 * 에이전트 → 서버 이벤트 처리:
 * - WORKFLOW_PROGRESS: 진행 상황
 * - WORKFLOW_COMPLETE: 완료
 * - WORKFLOW_ERROR: 에러
 */

import { Socket } from 'socket.io';
import type { StateManager } from '../types';

// ============================================
// 타입 정의
// ============================================

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
  retry_count: number;
}

// ============================================
// 핸들러 등록
// ============================================

export function registerWorkflowHandlers(
  socket: Socket,
  stateManager: StateManager,
  callbacks: {
    onProgress?: (data: WorkflowProgressEvent) => void;
    onComplete?: (data: WorkflowCompleteEvent) => void;
    onError?: (data: WorkflowErrorEvent) => void;
  } = {}
): void {
  const nodeId = socket.data.nodeId;

  /**
   * 워크플로우 진행 상황
   */
  socket.on('WORKFLOW_PROGRESS', async (data: WorkflowProgressEvent) => {
    const { job_id, device_id, current_step, progress, message } = data;

    console.log(
      `[WorkflowHandler] Progress - Node: ${nodeId}, Job: ${job_id}, ` +
      `Device: ${device_id}, Step: ${current_step}, Progress: ${progress}%`
    );

    try {
      // Redis 상태 업데이트
      await stateManager.updateDeviceState(device_id, {
        state: 'RUNNING',
        workflow_id: job_id,
        current_step,
        progress,
      });

      // 콜백 호출
      callbacks.onProgress?.(data);
    } catch (error) {
      console.error('[WorkflowHandler] Failed to update progress:', error);
    }
  });

  /**
   * 워크플로우 완료
   */
  socket.on('WORKFLOW_COMPLETE', async (data: WorkflowCompleteEvent) => {
    const { job_id, device_id, success, duration, error } = data;

    console.log(
      `[WorkflowHandler] Complete - Node: ${nodeId}, Job: ${job_id}, ` +
      `Device: ${device_id}, Success: ${success}, Duration: ${duration}ms`
    );

    try {
      // Redis 상태 업데이트
      if (success) {
        await stateManager.updateDeviceState(device_id, {
          state: 'COMPLETED',
          workflow_id: undefined,
          current_step: undefined,
          progress: 100,
        });

        // 1초 후 IDLE로 전이
        setTimeout(async () => {
          try {
            await stateManager.updateDeviceState(device_id, {
              state: 'IDLE',
            });
          } catch (e) {
            console.error('[WorkflowHandler] Failed to set IDLE:', e);
          }
        }, 1000);
      } else {
        await stateManager.updateDeviceState(device_id, {
          state: 'ERROR',
          error_message: error,
        });
      }

      // 콜백 호출
      callbacks.onComplete?.(data);
    } catch (err) {
      console.error('[WorkflowHandler] Failed to update complete status:', err);
    }
  });

  /**
   * 워크플로우 에러
   */
  socket.on('WORKFLOW_ERROR', async (data: WorkflowErrorEvent) => {
    const { job_id, device_id, step_id, error, retry_count } = data;

    console.error(
      `[WorkflowHandler] Error - Node: ${nodeId}, Job: ${job_id}, ` +
      `Device: ${device_id}, Step: ${step_id}, Error: ${error}, Retries: ${retry_count}`
    );

    try {
      // Redis 상태 업데이트
      await stateManager.updateDeviceState(device_id, {
        state: 'ERROR',
        error_message: `Step ${step_id}: ${error}`,
        error_count: retry_count,
      });

      // 콜백 호출
      callbacks.onError?.(data);
    } catch (err) {
      console.error('[WorkflowHandler] Failed to update error status:', err);
    }
  });

  console.log(`[WorkflowHandler] Registered handlers for node: ${nodeId}`);
}

export default registerWorkflowHandlers;
