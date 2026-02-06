/**
 * Accessibility Step
 * 
 * 접근성 서비스 활성화: AutoX.js 등 자동화 도구 권한
 */

import { BaseStep, StepContext } from './BaseStep';

export class AccessibilityStep extends BaseStep {
  constructor() {
    super('accessibility');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial } = context;

    const enabledServices: string[] = [];
    const failedServices: string[] = [];

    // 접근성 서비스 목록 (패키지명/서비스명)
    const accessibilityServices = [
      'org.autojs.autoxjs.v6/org.autojs.autojs.core.accessibility.AccessibilityService',
      'org.autojs.autoxjs.v6/org.autojs.autojs.core.accessibility.AccessibilityServiceUseDSL',
    ];

    // 1. 현재 활성화된 접근성 서비스 확인
    const currentServices = await this.getSetting(deviceSerial, 'secure', 'enabled_accessibility_services');
    const currentList = currentServices ? currentServices.split(':').filter(Boolean) : [];

    // 2. 필요한 서비스 추가
    const newServices = [...new Set([...currentList, ...accessibilityServices])];
    const servicesString = newServices.join(':');

    // 3. 접근성 서비스 활성화
    await this.putSetting(deviceSerial, 'secure', 'enabled_accessibility_services', servicesString);
    
    // 4. 접근성 기능 전역 활성화
    await this.putSetting(deviceSerial, 'secure', 'accessibility_enabled', '1');

    // 5. 각 서비스 개별 활성화 시도 (일부 기기에서 필요)
    for (const service of accessibilityServices) {
      try {
        // 서비스 컴포넌트 활성화
        const packageName = service.split('/')[0];
        await this.shell(deviceSerial, `pm grant ${packageName} android.permission.BIND_ACCESSIBILITY_SERVICE`);
        enabledServices.push(service);
      } catch {
        // 권한 부여 실패는 무시 (이미 활성화되어 있을 수 있음)
        failedServices.push(service);
      }
    }

    // 6. 추가 권한 부여
    const permissions = [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.WRITE_SECURE_SETTINGS',
    ];

    for (const permission of permissions) {
      try {
        await this.shell(deviceSerial, `pm grant org.autojs.autoxjs.v6 ${permission}`);
      } catch {
        // 일부 권한은 부여 불가 - 무시
      }
    }

    // 7. 검증
    await this.sleep(1000); // 설정 적용 대기
    const verifyServices = await this.getSetting(deviceSerial, 'secure', 'enabled_accessibility_services');
    const verifyEnabled = await this.getSetting(deviceSerial, 'secure', 'accessibility_enabled');

    return {
      enabledServices,
      failedServices,
      totalServices: newServices.length,
      accessibilityEnabled: verifyEnabled === '1',
      verified: accessibilityServices.every(s => verifyServices.includes(s)),
    };
  }

  protected override async postValidate(context: StepContext): Promise<void> {
    const { deviceSerial } = context;
    
    const enabled = await this.getSetting(deviceSerial, 'secure', 'accessibility_enabled');
    if (enabled !== '1') {
      throw new Error('Accessibility not enabled');
    }
  }
}

export default AccessibilityStep;
