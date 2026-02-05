/**
 * Base Step
 * 
 * 온보딩 단계의 기본 클래스
 */

import { AdbController, getAdbController } from '../../device/AdbController';
import { logger } from '../../utils/logger';
import {
  OnboardingStep,
  StepResult,
  OnboardingConfig,
} from '../types';

/**
 * 단계 실행 컨텍스트
 */
export interface StepContext {
  deviceSerial: string;
  deviceIndex: number;
  config: OnboardingConfig;
  previousResults: StepResult[];
}

/**
 * 기본 단계 클래스
 */
export abstract class BaseStep {
  protected adb: AdbController;
  protected stepName: OnboardingStep;

  constructor(stepName: OnboardingStep) {
    this.stepName = stepName;
    this.adb = getAdbController();
  }

  /**
   * 단계 실행
   */
  async execute(context: StepContext): Promise<StepResult> {
    const startedAt = Date.now();
    
    logger.info(`[Onboarding] Starting step: ${this.stepName}`, {
      device: context.deviceSerial,
    });

    try {
      // 사전 검증
      await this.preValidate(context);
      
      // 실행
      const data = await this.run(context);
      
      // 사후 검증
      await this.postValidate(context);

      const completedAt = Date.now();
      
      logger.info(`[Onboarding] Step completed: ${this.stepName}`, {
        device: context.deviceSerial,
        durationMs: completedAt - startedAt,
      });

      return {
        step: this.stepName,
        status: 'completed',
        data,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
      };
    } catch (error) {
      const completedAt = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`[Onboarding] Step failed: ${this.stepName}`, {
        device: context.deviceSerial,
        error: errorMessage,
      });

      return {
        step: this.stepName,
        status: 'failed',
        error: errorMessage,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
      };
    }
  }

  /**
   * 사전 검증 (오버라이드 가능)
   */
  protected async preValidate(context: StepContext): Promise<void> {
    // 기본: ADB 연결 확인
    const devices = await this.adb.getConnectedDevices();
    if (!devices.includes(context.deviceSerial)) {
      throw new Error(`Device not connected: ${context.deviceSerial}`);
    }
  }

  /**
   * 사후 검증 (오버라이드 가능)
   */
  protected async postValidate(_context: StepContext): Promise<void> {
    // 기본 구현 없음
  }

  /**
   * 실제 단계 실행 (서브클래스에서 구현)
   */
  protected abstract run(context: StepContext): Promise<Record<string, unknown>>;

  /**
   * ADB shell 명령 실행 (편의 메서드)
   */
  protected async shell(deviceSerial: string, command: string): Promise<string> {
    return this.adb.execute(deviceSerial, `shell ${command}`);
  }

  /**
   * 설정값 가져오기
   */
  protected async getSetting(deviceSerial: string, namespace: string, key: string): Promise<string> {
    return this.shell(deviceSerial, `settings get ${namespace} ${key}`);
  }

  /**
   * 설정값 설정하기
   */
  protected async putSetting(deviceSerial: string, namespace: string, key: string, value: string): Promise<void> {
    await this.shell(deviceSerial, `settings put ${namespace} ${key} ${value}`);
  }

  /**
   * 패키지 설치 여부 확인
   */
  protected async isPackageInstalled(deviceSerial: string, packageName: string): Promise<boolean> {
    try {
      const result = await this.shell(deviceSerial, `pm list packages ${packageName}`);
      return result.includes(packageName);
    } catch {
      return false;
    }
  }

  /**
   * 대기
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default BaseStep;
