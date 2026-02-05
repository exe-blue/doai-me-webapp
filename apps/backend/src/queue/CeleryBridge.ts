/**
 * CeleryBridge
 *
 * FastAPI HTTP API를 통해 Celery 태스크 dispatch + polling
 *
 * 흐름:
 *  1. dispatchTask() → POST /api/tasks/{endpoint}
 *  2. pollTaskStatus() → GET /api/tasks/{task_id} (2초 간격)
 *  3. executeTask() → dispatch + poll 결합, 완료까지 대기
 */

import { EventEmitter } from 'node:events';

// ============================================
// 타입 정의
// ============================================

export interface CeleryTaskResult {
  task_id: string;
  celery_task_id: string;
  status: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'REVOKED' | 'RETRY';
  result?: unknown;
  error?: string;
  progress?: number;
}

export interface CeleryDispatchResponse {
  task_id: string;
  celery_task_id: string;
}

export interface CeleryBridgeConfig {
  apiUrl: string;
  pollIntervalMs: number;
  maxRetries: number;
  requestTimeoutMs: number;
}

// ============================================
// 태스크 → 엔드포인트 매핑
// ============================================

const TASK_ENDPOINT_MAP: Record<string, string> = {
  install_apk: '/api/tasks/install',
  health_check: '/api/tasks/health-check',
  run_youtube_bot: '/api/tasks/run-bot',
  stop_bot: '/api/tasks/stop-bot',
  scan_devices: '/api/tasks/scan-devices',
  batch_install: '/api/tasks/batch-install',
  batch_health_check: '/api/tasks/batch-health-check',
};

// ============================================
// CeleryBridge 클래스
// ============================================

const DEFAULT_CONFIG: CeleryBridgeConfig = {
  apiUrl: process.env.CELERY_API_URL || 'http://localhost:8000',
  pollIntervalMs: 2000,
  maxRetries: 3,
  requestTimeoutMs: 30000,
};

export class CeleryBridge extends EventEmitter {
  private config: CeleryBridgeConfig;

  constructor(config: Partial<CeleryBridgeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Celery 태스크 디스패치 (HTTP POST)
   */
  async dispatchTask(
    taskName: string,
    params: Record<string, unknown> = {},
  ): Promise<CeleryDispatchResponse> {
    const endpoint = TASK_ENDPOINT_MAP[taskName];
    if (!endpoint) {
      throw new Error(`Unknown celery task: ${taskName}. Available: ${Object.keys(TASK_ENDPOINT_MAP).join(', ')}`);
    }

    const url = `${this.config.apiUrl}${endpoint}`;

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      throw new Error(`Celery dispatch failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as CeleryDispatchResponse;
    console.log(`[CeleryBridge] Task dispatched: ${taskName} → ${data.task_id}`);
    this.emit('task:dispatched', { taskName, ...data });

    return data;
  }

  /**
   * 태스크 상태 폴링 (GET)
   */
  async pollTaskStatus(taskId: string): Promise<CeleryTaskResult> {
    const url = `${this.config.apiUrl}/api/tasks/${taskId}`;

    const response = await this.fetchWithRetry(url, { method: 'GET' });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      throw new Error(`Celery poll failed (${response.status}): ${errorBody}`);
    }

    return await response.json() as CeleryTaskResult;
  }

  /**
   * 태스크 실행: dispatch + poll until completion
   */
  async executeTask(
    taskName: string,
    params: Record<string, unknown> = {},
    options: { timeout?: number; onProgress?: (result: CeleryTaskResult) => void } = {},
  ): Promise<CeleryTaskResult> {
    const { timeout = 300000, onProgress } = options;

    // 1. Dispatch
    const dispatched = await this.dispatchTask(taskName, params);
    const taskId = dispatched.task_id;

    // 2. Poll until done or timeout
    const startTime = Date.now();
    let lastStatus = '';

    while (Date.now() - startTime < timeout) {
      await this.sleep(this.config.pollIntervalMs);

      let result: CeleryTaskResult;
      try {
        result = await this.pollTaskStatus(taskId);
      } catch (pollError) {
        console.warn(`[CeleryBridge] Poll error for ${taskId}:`, (pollError as Error).message);
        continue; // 폴링 실패는 재시도
      }

      // 상태 변경 시 이벤트 발행
      if (result.status !== lastStatus) {
        lastStatus = result.status;
        this.emit('task:status', { taskId, taskName, ...result });
        onProgress?.(result);
      }

      // 완료 상태 확인
      if (result.status === 'SUCCESS') {
        console.log(`[CeleryBridge] Task completed: ${taskName} (${taskId})`);
        this.emit('task:completed', { taskId, taskName, result: result.result });
        return result;
      }

      if (result.status === 'FAILURE') {
        const errorMsg = result.error || 'Task failed without error message';
        console.error(`[CeleryBridge] Task failed: ${taskName} (${taskId}): ${errorMsg}`);
        this.emit('task:failed', { taskId, taskName, error: errorMsg });
        throw new Error(`Celery task ${taskName} failed: ${errorMsg}`);
      }

      if (result.status === 'REVOKED') {
        console.warn(`[CeleryBridge] Task revoked: ${taskName} (${taskId})`);
        this.emit('task:revoked', { taskId, taskName });
        throw new Error(`Celery task ${taskName} was revoked`);
      }
    }

    // Timeout
    console.error(`[CeleryBridge] Task timeout: ${taskName} (${taskId}) after ${timeout}ms`);
    this.emit('task:timeout', { taskId, taskName, timeout });
    throw new Error(`Celery task ${taskName} timed out after ${timeout}ms`);
  }

  /**
   * fetch with exponential backoff retry
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    retries: number = this.config.maxRetries,
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.warn(`[CeleryBridge] Retry ${attempt + 1}/${retries} in ${delay}ms: ${lastError.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`CeleryBridge request failed after ${retries + 1} attempts: ${lastError?.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default CeleryBridge;
