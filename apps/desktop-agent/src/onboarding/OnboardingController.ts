/**
 * Onboarding Controller
 * 
 * 디바이스 온보딩 프로세스 관리
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { getAdbController } from '../device/AdbController';
import {
  OnboardingStep,
  OnboardingConfig,
  DeviceOnboardingState,
  StepResult,
  OnboardingProgress,
  BatchOnboardingRequest,
  BatchOnboardingResult,
  ONBOARDING_STEPS_ORDER,
  DEFAULT_ONBOARDING_CONFIG,
} from './types';
import { createStep, StepContext } from './steps';

/**
 * 온보딩 컨트롤러 클래스
 */
export class OnboardingController extends EventEmitter {
  private states: Map<string, DeviceOnboardingState> = new Map();
  private activeOnboardings: Map<string, AbortController> = new Map();
  private config: OnboardingConfig;

  constructor(nodeId: string, customConfig?: Partial<OnboardingConfig>) {
    super();
    this.config = {
      ...DEFAULT_ONBOARDING_CONFIG,
      nodeId,
      ...customConfig,
    };
  }

  /**
   * 단일 디바이스 온보딩 시작
   */
  async startOnboarding(
    deviceSerial: string,
    deviceIndex: number,
    options?: { fromStep?: OnboardingStep; skipSteps?: OnboardingStep[] }
  ): Promise<DeviceOnboardingState> {
    // 이미 진행 중인지 확인
    if (this.activeOnboardings.has(deviceSerial)) {
      throw new Error(`Onboarding already in progress for device: ${deviceSerial}`);
    }

    // 상태 초기화
    const state: DeviceOnboardingState = {
      deviceId: deviceSerial,
      serial: deviceSerial,
      nodeId: this.config.nodeId,
      status: 'in_progress',
      currentStep: null,
      completedSteps: [],
      stepResults: [],
      startedAt: Date.now(),
    };

    this.states.set(deviceSerial, state);

    // 중단 컨트롤러
    const abortController = new AbortController();
    this.activeOnboardings.set(deviceSerial, abortController);

    try {
      // 실행할 단계 결정
      let steps = [...ONBOARDING_STEPS_ORDER];
      
      // 시작 단계 지정
      if (options?.fromStep) {
        const startIndex = steps.indexOf(options.fromStep);
        if (startIndex > 0) {
          steps = steps.slice(startIndex);
        }
      }

      // 건너뛸 단계 제거
      const skipSteps = new Set([
        ...(options?.skipSteps || []),
        ...(this.config.skipSteps || []),
      ]);
      steps = steps.filter(s => !skipSteps.has(s));

      // 각 단계 실행
      for (const stepName of steps) {
        // 중단 확인
        if (abortController.signal.aborted) {
          state.status = 'failed';
          state.lastError = 'Onboarding cancelled';
          break;
        }

        state.currentStep = stepName;
        this.emitProgress(state);

        // 단계 실행
        const step = createStep(stepName);
        const context: StepContext = {
          deviceSerial,
          deviceIndex,
          config: this.config,
          previousResults: state.stepResults,
        };

        const result = await step.execute(context);
        state.stepResults.push(result);

        if (result.status === 'completed') {
          state.completedSteps.push(stepName);
        } else if (result.status === 'failed') {
          state.status = 'failed';
          state.lastError = result.error;
          break;
        }

        this.emitProgress(state);
      }

      // 완료 처리
      if (state.status !== 'failed') {
        state.status = 'completed';
        state.completedAt = Date.now();
        
        // 디바이스 정보 추출
        const readyResult = state.stepResults.find(r => r.step === 'ready');
        if (readyResult?.data?.deviceInfo) {
          state.deviceInfo = readyResult.data.deviceInfo as DeviceOnboardingState['deviceInfo'];
        }
      }

      logger.info('[Onboarding] Completed', {
        device: deviceSerial,
        status: state.status,
        duration: Date.now() - state.startedAt!,
      });

      this.emit('onboarding:complete', state);
      return state;

    } catch (error) {
      state.status = 'failed';
      state.lastError = error instanceof Error ? error.message : String(error);
      
      logger.error('[Onboarding] Failed', {
        device: deviceSerial,
        error: state.lastError,
      });

      this.emit('onboarding:failed', state);
      return state;

    } finally {
      this.activeOnboardings.delete(deviceSerial);
      state.currentStep = null;
    }
  }

  /**
   * 배치 온보딩
   */
  async startBatchOnboarding(request: BatchOnboardingRequest): Promise<BatchOnboardingResult> {
    const { deviceSerials, config, parallel = 1 } = request;

    // 설정 업데이트
    if (config) {
      Object.assign(this.config, config);
    }

    const results: DeviceOnboardingState[] = [];
    let completed = 0;
    let failed = 0;
    const skipped = 0;

    // 병렬 처리
    const chunks = this.chunkArray(deviceSerials, parallel);

    for (const chunk of chunks) {
      const promises = chunk.map(async (serial, indexInChunk) => {
        const deviceIndex = deviceSerials.indexOf(serial);
        
        try {
          const state = await this.startOnboarding(serial, deviceIndex);
          results.push(state);
          
          if (state.status === 'completed') {
            completed++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
          results.push({
            deviceId: serial,
            serial,
            nodeId: this.config.nodeId,
            status: 'failed',
            currentStep: null,
            completedSteps: [],
            stepResults: [],
            lastError: error instanceof Error ? error.message : String(error),
          });
        }
      });

      await Promise.all(promises);
    }

    return {
      total: deviceSerials.length,
      completed,
      failed,
      skipped,
      results,
    };
  }

  /**
   * 특정 단계만 실행
   */
  async runStep(
    deviceSerial: string,
    stepName: OnboardingStep,
    deviceIndex: number = 0
  ): Promise<StepResult> {
    const step = createStep(stepName);
    const context: StepContext = {
      deviceSerial,
      deviceIndex,
      config: this.config,
      previousResults: this.states.get(deviceSerial)?.stepResults || [],
    };

    const result = await step.execute(context);

    // 상태 업데이트
    const state = this.states.get(deviceSerial);
    if (state) {
      state.stepResults.push(result);
      if (result.status === 'completed') {
        state.completedSteps.push(stepName);
      }
    }

    return result;
  }

  /**
   * 온보딩 취소
   */
  cancelOnboarding(deviceSerial: string): boolean {
    const controller = this.activeOnboardings.get(deviceSerial);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * 진행률 조회
   */
  getProgress(deviceSerial: string): OnboardingProgress | null {
    const state = this.states.get(deviceSerial);
    if (!state) return null;

    const totalSteps = ONBOARDING_STEPS_ORDER.length;
    const completedSteps = state.completedSteps.length;
    const percentComplete = Math.round((completedSteps / totalSteps) * 100);

    return {
      deviceId: deviceSerial,
      totalSteps,
      completedSteps,
      currentStep: state.currentStep,
      percentComplete,
      status: state.status,
    };
  }

  /**
   * 상태 조회
   */
  getState(deviceSerial: string): DeviceOnboardingState | null {
    return this.states.get(deviceSerial) || null;
  }

  /**
   * 모든 상태 조회
   */
  getAllStates(): DeviceOnboardingState[] {
    return Array.from(this.states.values());
  }

  /**
   * 연결된 디바이스 자동 검색 및 온보딩
   */
  async discoverAndOnboard(options?: {
    parallel?: number;
    skipSteps?: OnboardingStep[];
  }): Promise<BatchOnboardingResult> {
    const adb = getAdbController();
    const devices = await adb.getConnectedDevices();

    if (devices.length === 0) {
      return {
        total: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
    }

    return this.startBatchOnboarding({
      deviceSerials: devices,
      config: this.config,
      parallel: options?.parallel || 3,
    });
  }

  /**
   * 진행률 이벤트 발생
   */
  private emitProgress(state: DeviceOnboardingState): void {
    const progress = this.getProgress(state.deviceId);
    if (progress) {
      this.emit('onboarding:progress', progress);
    }
  }

  /**
   * 배열을 청크로 분할
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// 싱글톤
let instance: OnboardingController | null = null;

export function getOnboardingController(nodeId?: string): OnboardingController {
  if (!instance) {
    if (!nodeId) {
      nodeId = process.env.NODE_ID || 'PC00';
    }
    instance = new OnboardingController(nodeId);
  }
  return instance;
}

export default OnboardingController;
