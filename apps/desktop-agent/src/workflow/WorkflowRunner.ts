/**
 * 워크플로우 러너 (Desktop Agent)
 * 
 * 워크플로우 Step별 실행 로직
 * - 서버에서 받은 워크플로우 정의 실행
 * - Step별 AdbController/AutoxController 호출
 * - 진행률 콜백 (SocketClient가 서버에 보고)
 * - 에러 처리 및 재시도
 * 
 * 수정된 아키텍처:
 * - Redis 직접 연결 제거
 * - Socket.IO를 통해 상태 보고 (SocketClient에서 처리)
 * - 서버에서 전달받은 워크플로우 정의 직접 사용
 */

import { AdbController } from '../device/AdbController';
import { AutoxController } from '../device/AutoxController';

// ============================================
// 타입 정의
// ============================================

export interface Workflow {
  id: string;
  name: string;
  version: number;
  timeout: number;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  action: 'autox' | 'adb' | 'system' | 'wait' | 'condition';
  script?: string;
  command?: string;
  timeout: number;
  retry: RetryConfig;
  onError: 'fail' | 'skip' | 'goto';
  nextOnError?: string;
}

export interface RetryConfig {
  attempts: number;
  delay: number;
  backoff: 'fixed' | 'exponential' | string;
}

export interface ExecutionContext {
  workflow: Workflow;
  device_id: string;
  params: Record<string, unknown>;
  variables: Record<string, unknown>;
  startedAt: number;
  currentStep: number;
}

export interface ExecutionOptions {
  onProgress?: (progress: number, stepId: string) => Promise<void>;
}

// ============================================
// 기본 워크플로우 정의 (fallback)
// ============================================

const DEFAULT_WORKFLOWS: Record<string, Workflow> = {
  youtube_watch: {
    id: 'youtube_watch',
    name: '유튜브 영상 시청',
    version: 2,
    timeout: 300000,
    steps: [
      {
        id: 'open_app',
        action: 'autox',
        script: 'launchApp("com.google.android.youtube");',
        timeout: 10000,
        retry: { attempts: 3, delay: 1000, backoff: 'exponential' },
        onError: 'fail',
      },
      {
        id: 'wait_load',
        action: 'wait',
        script: '2000',
        timeout: 3000,
        retry: { attempts: 1, delay: 0, backoff: 'fixed' },
        onError: 'skip',
      },
      {
        id: 'search',
        action: 'autox',
        script: `
          click(desc("Search").findOne(5000));
          sleep(500);
          let searchBox = className("EditText").findOne(3000);
          if (searchBox) searchBox.setText("{{keyword}}");
          sleep(300);
          KeyEvent("enter");
        `,
        timeout: 10000,
        retry: { attempts: 2, delay: 1000, backoff: 'fixed' },
        onError: 'fail',
      },
      {
        id: 'play_video',
        action: 'autox',
        script: `
          sleep(2000);
          let video = className("android.widget.TextView").textContains("{{keyword}}").findOne(5000);
          if (video) click(video);
        `,
        timeout: 10000,
        retry: { attempts: 3, delay: 2000, backoff: 'exponential' },
        onError: 'fail',
      },
      {
        id: 'watch_duration',
        action: 'wait',
        script: '{{duration}}',
        timeout: 600000,
        retry: { attempts: 1, delay: 0, backoff: 'fixed' },
        onError: 'skip',
      },
    ],
  },
};

// ============================================
// WorkflowRunner 클래스
// ============================================

export class WorkflowRunner {
  private nodeId: string;
  private adbController: AdbController;
  private autoxController: AutoxController;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.adbController = new AdbController();
    this.autoxController = new AutoxController();
  }

  /**
   * 워크플로우 실행
   * 
   * @param workflowId 워크플로우 ID
   * @param deviceId 디바이스 ID
   * @param params 실행 파라미터
   * @param options 실행 옵션 (진행률 콜백 등)
   * @param workflowDefinition 서버에서 전달받은 워크플로우 정의 (선택)
   */
  async executeWorkflow(
    workflowId: string,
    deviceId: string,
    params: Record<string, unknown>,
    options: ExecutionOptions = {},
    workflowDefinition?: Workflow
  ): Promise<void> {
    // 워크플로우 정의: 서버에서 전달받은 것 우선, 없으면 로컬 fallback
    const workflow = workflowDefinition || DEFAULT_WORKFLOWS[workflowId];
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    console.log(
      `[WorkflowRunner] Executing '${workflow.name}' (v${workflow.version}) on device ${deviceId}`
    );

    const context: ExecutionContext = {
      workflow,
      device_id: deviceId,
      params,
      variables: {},
      startedAt: Date.now(),
      currentStep: 0,
    };

    // Step 순차 실행
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      context.currentStep = i;

      // 진행률 계산
      const progress = Math.round(((i + 1) / workflow.steps.length) * 100);

      // 콜백 호출 (SocketClient가 서버에 WORKFLOW_PROGRESS 전송)
      if (options.onProgress) {
        await options.onProgress(progress, step.id);
      }

      console.log(
        `[WorkflowRunner] Device ${deviceId}: Step ${i + 1}/${workflow.steps.length} - ${step.id}`
      );

      try {
        await this.executeStep(step, context);
        console.log(`[WorkflowRunner] Step ${step.id}: success`);
      } catch (error) {
        const stepError = error as Error;
        console.error(`[WorkflowRunner] Step ${step.id} failed:`, stepError.message);

        // onError 정책 처리
        switch (step.onError) {
          case 'skip':
            console.log(`[WorkflowRunner] Step ${step.id}: skipped`);
            continue;

          case 'goto':
            if (step.nextOnError) {
              const targetIndex = workflow.steps.findIndex(s => s.id === step.nextOnError);
              if (targetIndex >= 0) {
                console.log(`[WorkflowRunner] Step ${step.id}: goto ${step.nextOnError}`);
                i = targetIndex - 1;
                continue;
              }
            }
            throw stepError;

          case 'fail':
          default:
            throw stepError;
        }
      }
    }

    console.log(`[WorkflowRunner] Device ${deviceId}: Workflow completed`);
  }

  /**
   * Step 실행
   */
  private async executeStep(step: WorkflowStep, context: ExecutionContext): Promise<void> {
    const { device_id, params, variables } = context;

    // 템플릿 변수 치환
    const script = this.interpolate(step.script || '', { ...params, ...variables });
    const command = this.interpolate(step.command || '', { ...params, ...variables });

    let lastError: Error | null = null;
    const maxAttempts = step.retry?.attempts ?? 0;

    // 재시도 루프
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        await this.executeAction(step.action, device_id, script, command, step.timeout);
        return; // 성공
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts) {
          const backoff = step.retry?.backoff || 'fixed';
          const baseDelay = step.retry?.delay ?? 1000;
          const delay = backoff === 'exponential'
            ? baseDelay * Math.pow(2, attempt)
            : baseDelay;

          console.log(
            `[WorkflowRunner] Step ${step.id} attempt ${attempt + 1} failed, ` +
            `retrying in ${delay}ms`
          );

          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error(`Step ${step.id} failed after retries`);
  }

  /**
   * 액션 실행
   */
  private async executeAction(
    action: WorkflowStep['action'],
    deviceId: string,
    script: string,
    command: string,
    timeout: number
  ): Promise<void> {
    switch (action) {
      case 'autox': {
        const result = await this.autoxController.runScript(deviceId, script, timeout);
        if (!result.success) {
          throw new Error(result.error || 'AutoX script failed');
        }
        break;
      }

      case 'adb': {
        const result = await this.adbController.shell(deviceId, command || script, timeout);
        if (!result.success) {
          throw new Error(result.stderr || 'ADB command failed');
        }
        break;
      }

      case 'wait': {
        const duration = parseInt(script) || 1000;
        await this.sleep(duration);
        break;
      }

      case 'condition': {
        // TODO: 조건 평가 로직
        console.log(`[WorkflowRunner] Condition: ${script}`);
        break;
      }

      case 'system': {
        await this.executeSystemAction(script);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * 시스템 액션 실행
   */
  private async executeSystemAction(action: string): Promise<void> {
    console.log(`[WorkflowRunner] System action: ${action}`);

    switch (action) {
      case 'report_completion':
        // 완료 보고는 SocketClient에서 처리
        break;
      
      default:
        console.warn(`[WorkflowRunner] Unknown system action: ${action}`);
    }
  }

  /**
   * 템플릿 변수 치환
   * {{variable}} 형식을 params 값으로 치환
   */
  private interpolate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = vars[key];
      return value !== undefined ? String(value) : '';
    });
  }

  /**
   * Sleep 유틸리티
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ADB Controller 접근
   */
  getAdbController(): AdbController {
    return this.adbController;
  }

  /**
   * AutoX Controller 접근
   */
  getAutoxController(): AutoxController {
    return this.autoxController;
  }

  /**
   * 정리
   */
  async cleanup(): Promise<void> {
    await this.autoxController.disconnectAll();
    await this.adbController.cleanup();
  }
}

export default WorkflowRunner;
