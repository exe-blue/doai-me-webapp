/**
 * Naming Step
 * 
 * 디바이스 명명: PC{XX}-{YY} 형식
 */

import { BaseStep, StepContext } from './BaseStep';

export class NamingStep extends BaseStep {
  constructor() {
    super('naming');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial, deviceIndex, config } = context;
    const { nodeId, deviceIndexStart } = config;

    // 디바이스 이름 생성: PC{XX}-{YY}
    // nodeId: "PC01", deviceIndex: 0 → "PC01-00"
    const deviceNumber = (deviceIndexStart + deviceIndex).toString().padStart(2, '0');
    const deviceName = `${nodeId}-${deviceNumber}`;

    // 1. 디바이스 이름 설정 (Bluetooth 이름으로 사용됨)
    await this.putSetting(deviceSerial, 'secure', 'bluetooth_name', deviceName);
    await this.putSetting(deviceSerial, 'system', 'device_name', deviceName);
    
    // 2. 호스트명 설정 (일부 기기에서 지원)
    try {
      await this.shell(deviceSerial, `setprop net.hostname ${deviceName}`);
    } catch {
      // 일부 기기에서는 실패할 수 있음 - 무시
    }

    // 3. 기기 속성에 커스텀 이름 저장
    try {
      await this.shell(deviceSerial, `setprop persist.device.name ${deviceName}`);
    } catch {
      // 권한 문제로 실패할 수 있음 - 무시
    }

    // 4. 검증
    const verifyName = await this.getSetting(deviceSerial, 'secure', 'bluetooth_name');

    return {
      assignedName: deviceName,
      nodeId,
      deviceIndex: deviceIndexStart + deviceIndex,
      serial: deviceSerial,
      verified: verifyName.trim() === deviceName,
    };
  }
}

export default NamingStep;
