/**
 * Hardware Verification Step
 * 
 * 하드웨어 검증: ADB 연결, 모델 확인, 기본 상태 체크
 */

import { BaseStep, StepContext } from './BaseStep';

export class HardwareStep extends BaseStep {
  constructor() {
    super('hardware');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial } = context;

    // 1. 디바이스 속성 가져오기
    const model = await this.shell(deviceSerial, 'getprop ro.product.model');
    const manufacturer = await this.shell(deviceSerial, 'getprop ro.product.manufacturer');
    const androidVersion = await this.shell(deviceSerial, 'getprop ro.build.version.release');
    const sdkVersion = await this.shell(deviceSerial, 'getprop ro.build.version.sdk');
    const serialNo = await this.shell(deviceSerial, 'getprop ro.serialno');

    // 2. Galaxy S9 검증 (권장)
    const isGalaxyS9 = model.toLowerCase().includes('sm-g96') || 
                       model.toLowerCase().includes('star');
    
    if (!isGalaxyS9) {
      // 경고만 하고 계속 진행 (다른 기기도 허용)
      console.warn(`[Onboarding] Device is not Galaxy S9: ${model}`);
    }

    // 3. Android 버전 확인 (최소 8.0)
    const majorVersion = parseInt(androidVersion.split('.')[0], 10);
    if (majorVersion < 8) {
      throw new Error(`Android version too low: ${androidVersion} (minimum 8.0)`);
    }

    // 4. 배터리 상태
    const batteryOutput = await this.shell(deviceSerial, 'dumpsys battery');
    const batteryMatch = batteryOutput.match(/level:\s*(\d+)/);
    const batteryLevel = batteryMatch ? parseInt(batteryMatch[1], 10) : -1;

    if (batteryLevel < 20 && batteryLevel > 0) {
      throw new Error(`Battery too low: ${batteryLevel}% (minimum 20%)`);
    }

    // 5. 스토리지 확인
    const storageOutput = await this.shell(deviceSerial, 'df /data');
    const storageLine = storageOutput.split('\n')[1];
    let availableGb = 0;
    
    if (storageLine) {
      const parts = storageLine.trim().split(/\s+/);
      // Available is typically 4th column in KB
      const availableKb = parseInt(parts[3], 10) || 0;
      availableGb = Math.round(availableKb / 1024 / 1024 * 10) / 10;
    }

    if (availableGb < 1) {
      throw new Error(`Insufficient storage: ${availableGb}GB available (minimum 1GB)`);
    }

    // 6. USB 디버깅 확인
    const adbEnabled = await this.getSetting(deviceSerial, 'global', 'adb_enabled');
    
    return {
      model: model.trim(),
      manufacturer: manufacturer.trim(),
      androidVersion: androidVersion.trim(),
      sdkVersion: parseInt(sdkVersion.trim(), 10),
      serialNo: serialNo.trim(),
      isGalaxyS9,
      batteryLevel,
      availableStorageGb: availableGb,
      usbDebuggingEnabled: adbEnabled === '1',
    };
  }

  protected override async preValidate(context: StepContext): Promise<void> {
    // ADB 연결만 확인 (기본 검증)
    const devices = await this.adb.getConnectedDevices();
    if (!devices.includes(context.deviceSerial)) {
      throw new Error(`Device not connected via ADB: ${context.deviceSerial}`);
    }
  }
}

export default HardwareStep;
