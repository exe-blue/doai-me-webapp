/**
 * 워크플로우 러너 (Desktop Agent)
 * 
 * 워크플로우 Step별 실행 로직
 * - 서버에서 받은 워크플로우 정의 실행
 * - Step별 AdbController 호출
 * - 진행률 콜백 (SocketClient가 서버에 보고)
 * - 에러 처리 및 재시도
 * 
 * 수정된 아키텍처:
 * - Redis 직접 연결 제거
 * - Socket.IO를 통해 상태 보고 (SocketClient에서 처리)
 * - 서버에서 전달받은 워크플로우 정의 직접 사용
 */

import { AdbController, getAdbController } from '../device/AdbController';
import { logger } from '../utils/logger';

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
// 실행 중인 워크플로우 추적
// ============================================

interface RunningWorkflow {
  workflowId: string;
  executionId: string;
  deviceId: string;
  currentStep?: string;
  progress: number;
  startedAt: number;
  params?: Record<string, unknown>;
  abortController: AbortController;
}

// ============================================
// WorkflowRunner 클래스
// ============================================

export class WorkflowRunner {
  private nodeId: string;
  private adbController: AdbController;
  private runningWorkflows: Map<string, RunningWorkflow> = new Map();

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.adbController = getAdbController();
  }

  /**
   * 실행 중인 워크플로우 목록 반환
   */
  getRunningWorkflows(): RunningWorkflow[] {
    return Array.from(this.runningWorkflows.values());
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
    workflowDefinition?: Workflow,
    executionId?: string
  ): Promise<void> {
    // 워크플로우 정의: 서버에서 전달받은 것 우선, 없으면 로컬 fallback
    const workflow = workflowDefinition || DEFAULT_WORKFLOWS[workflowId];
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const execId = executionId || `exec_${Date.now()}`;
    const abortController = new AbortController();
    
    logger.info('Executing workflow', {
      workflowId: workflow.id,
      version: workflow.version,
      deviceId,
      executionId: execId,
    });

    // 실행 중 워크플로우 등록
    this.runningWorkflows.set(execId, {
      workflowId: workflow.id,
      executionId: execId,
      deviceId,
      progress: 0,
      startedAt: Date.now(),
      params,
      abortController,
    });

    const context: ExecutionContext = {
      workflow,
      device_id: deviceId,
      params,
      variables: {},
      startedAt: Date.now(),
      currentStep: 0,
    };

    try {
      // Step 순차 실행
      for (let i = 0; i < workflow.steps.length; i++) {
        // Check for cancellation before each step
        if (abortController.signal.aborted) {
          logger.info('Workflow cancelled', { executionId: execId, step: i });
          throw new Error('Workflow cancelled');
        }
        
        const step = workflow.steps[i];
        context.currentStep = i;

        // 진행률 계산
        const progress = Math.round(((i + 1) / workflow.steps.length) * 100);

        // 실행 중 워크플로우 업데이트
        const running = this.runningWorkflows.get(execId);
        if (running) {
          running.progress = progress;
          running.currentStep = step.id;
        }

        // 콜백 호출 (SocketClient가 서버에 WORKFLOW_PROGRESS 전송)
        if (options.onProgress) {
          await options.onProgress(progress, step.id);
        }

        logger.debug('Executing step', {
          deviceId,
          step: `${i + 1}/${workflow.steps.length}`,
          stepId: step.id,
        });

        try {
          await this.executeStep(step, context);
          logger.debug('Step completed', { stepId: step.id });
        } catch (error) {
          const stepError = error as Error;
          logger.error('Step failed', { stepId: step.id, error: stepError.message });

          // onError 정책 처리
          switch (step.onError) {
            case 'skip':
              logger.info('Step skipped', { stepId: step.id });
              continue;

            case 'goto':
              if (step.nextOnError) {
                const targetIndex = workflow.steps.findIndex(s => s.id === step.nextOnError);
                if (targetIndex >= 0) {
                  logger.info('Goto step', { stepId: step.id, target: step.nextOnError });
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

      logger.info('Workflow completed', { deviceId, executionId: execId });
    } finally {
      // 실행 완료 후 제거
      this.runningWorkflows.delete(execId);
    }
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

          logger.warn('Step failed, retrying', {
            stepId: step.id,
            attempt: attempt + 1,
            delay,
          });

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
    _timeout: number
  ): Promise<void> {
    switch (action) {
      case 'autox': {
        // AutoX 스크립트 실행
        logger.info('AutoX script execution', { deviceId, script: script?.substring(0, 100) });
        await this.executeAutoxScript(deviceId, script, _timeout);
        break;
      }

      case 'adb': {
        const cmd = command || script;
        const result = await this.adbController.execute(deviceId, cmd.startsWith('shell') ? cmd : `shell ${cmd}`);
        logger.debug('ADB result', { result });
        break;
      }

      case 'wait': {
        const duration = parseInt(script) || 1000;
        await this.sleep(duration);
        break;
      }

      case 'condition': {
        // 조건 평가 로직
        logger.debug('Condition evaluation', { script });
        const conditionResult = await this.evaluateCondition(deviceId, script);
        if (!conditionResult) {
          throw new Error(`Condition failed: ${script}`);
        }
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
   * AutoX 스크립트 실행
   * 
   * 흐름:
   * 1. 스크립트와 파라미터를 디바이스에 푸시
   * 2. Intent Broadcast로 AutoX.js 실행
   * 3. completion.json 파일 폴링으로 완료 대기
   */
  private async executeAutoxScript(
    deviceId: string,
    scriptContent: string,
    timeout: number
  ): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    // 원격 경로
    const remoteDir = '/sdcard/DoAiScript';
    const scriptRemotePath = `${remoteDir}/script.js`;
    const jobConfigPath = `${remoteDir}/job.json`;
    const completionPath = `${remoteDir}/completion.json`;

    try {
      // 1. 디렉토리 생성 확인
      await this.adbController.execute(deviceId, `shell mkdir -p ${remoteDir}`);

      // 2. 기존 completion 파일 삭제
      await this.adbController.execute(deviceId, `shell rm -f ${completionPath}`);

      // 3. 스크립트 파일 푸시 (로컬 스크립트 파일 경로가 있다면)
      // 현재 컨텍스트에서 params를 사용할 수 없으므로 스크립트를 직접 처리
      if (scriptContent && scriptContent.startsWith('/')) {
        // 스크립트 경로인 경우
        await this.adbController.execute(deviceId, `push "${scriptContent}" "${scriptRemotePath}"`);
      } else {
        // 인라인 스크립트인 경우 - 임시 파일 생성
        const tempScriptPath = path.default.join(os.default.tmpdir(), `autox_script_${Date.now()}.js`);
        fs.default.writeFileSync(tempScriptPath, scriptContent || '// empty script');
        await this.adbController.execute(deviceId, `push "${tempScriptPath}" "${scriptRemotePath}"`);
        fs.default.unlinkSync(tempScriptPath);
      }

      // 4. Intent Broadcast로 AutoX.js 실행
      const intentAction = 'com.stardust.autojs.action.RUN_SCRIPT';
      const broadcastCmd = `shell am broadcast -a ${intentAction} --es path "${scriptRemotePath}"`;
      
      logger.info('Executing AutoX broadcast', { deviceId, cmd: broadcastCmd });
      await this.adbController.execute(deviceId, broadcastCmd);

      // 5. 완료 대기 (polling)
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        try {
          const result = await this.adbController.execute(deviceId, `shell cat "${completionPath}"`);
          
          if (result && result.trim()) {
            const parsed = JSON.parse(result.trim());
            
            if (parsed.status === 'completed') {
              logger.info('AutoX script completed', { deviceId, data: parsed.data });
              // 완료 파일 삭제
              await this.adbController.execute(deviceId, `shell rm -f ${completionPath}`);
              return;
            }
            
            if (parsed.status === 'failed') {
              await this.adbController.execute(deviceId, `shell rm -f ${completionPath}`);
              throw new Error(`AutoX script failed: ${parsed.error || 'Unknown error'}`);
            }
          }
        } catch (err) {
          // 파일이 없거나 파싱 실패 - 계속 대기
          if (err instanceof SyntaxError) {
            // JSON 파싱 실패 - 파일이 아직 완성되지 않음
          } else if (err instanceof Error && err.message.includes('failed')) {
            throw err;
          }
        }

        await this.sleep(pollInterval);
      }

      throw new Error(`AutoX script timeout after ${timeout}ms`);
    } catch (err) {
      logger.error('AutoX script execution failed', { deviceId, error: err });
      throw err;
    }
  }

  /**
   * 조건 평가
   * 
   * 지원 조건:
   * - battery > N: 배터리 레벨
   * - screen_on: 화면 상태
   * - app_running:package: 앱 실행 상태
   */
  private async evaluateCondition(deviceId: string, condition: string): Promise<boolean> {
    logger.debug('Evaluating condition', { deviceId, condition });

    try {
      // battery > N
      const batteryMatch = condition.match(/battery\s*([><=]+)\s*(\d+)/);
      if (batteryMatch) {
        const operator = batteryMatch[1];
        const threshold = parseInt(batteryMatch[2]);
        const batteryLevel = await this.getBatteryLevel(deviceId);
        
        switch (operator) {
          case '>': return batteryLevel > threshold;
          case '>=': return batteryLevel >= threshold;
          case '<': return batteryLevel < threshold;
          case '<=': return batteryLevel <= threshold;
          case '=':
          case '==': return batteryLevel === threshold;
          default: return false;
        }
      }

      // screen_on
      if (condition === 'screen_on') {
        const result = await this.adbController.execute(
          deviceId,
          'shell dumpsys power | grep "mWakefulness="'
        );
        return result.includes('Awake');
      }

      // app_running:package.name
      const appMatch = condition.match(/app_running:(.+)/);
      if (appMatch) {
        const packageName = appMatch[1].trim();
        const result = await this.adbController.execute(
          deviceId,
          `shell dumpsys activity activities | grep "${packageName}"`
        );
        return result.length > 0;
      }

      logger.warn('Unknown condition format', { condition });
      return true; // 기본값: 조건 통과
    } catch (err) {
      logger.error('Condition evaluation failed', { deviceId, condition, error: err });
      return false;
    }
  }

  /**
   * 배터리 레벨 조회
   */
  private async getBatteryLevel(deviceId: string): Promise<number> {
    try {
      const result = await this.adbController.execute(
        deviceId,
        'shell dumpsys battery | grep level'
      );
      const match = result.match(/level:\s*(\d+)/);
      return match ? parseInt(match[1]) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 시스템 액션 실행
   */
  private async executeSystemAction(action: string): Promise<void> {
    logger.debug('System action', { action });

    switch (action) {
      case 'report_completion':
        // 완료 보고는 SocketClient에서 처리
        break;
      
      default:
        logger.warn('Unknown system action', { action });
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
   * 워크플로우 실행 취소
   */
  cancelWorkflow(executionId: string): boolean {
    const running = this.runningWorkflows.get(executionId);
    if (running) {
      // Signal cancellation via AbortController
      running.abortController.abort();
      logger.info('Workflow cancellation signaled', { executionId });
      // Note: The workflow loop will check the abort signal and clean up
      return true;
    }
    return false;
  }

  /**
   * 정리
   */
  async cleanup(): Promise<void> {
    // 실행 중인 워크플로우 정리
    for (const [execId] of this.runningWorkflows) {
      logger.info('Cancelling running workflow', { executionId: execId });
    }
    this.runningWorkflows.clear();
    logger.info('WorkflowRunner cleanup completed');
  }
}

export default WorkflowRunner;
