/**
 * Security Step
 * 
 * 보안 설정 해제: 잠금화면 비활성화, USB 디버깅 유지
 */

import { BaseStep, StepContext } from './BaseStep';

export class SecurityStep extends BaseStep {
  constructor() {
    super('security');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial } = context;

    const settings: Record<string, { setting: string; value: string; result: boolean }> = {};

    // 1. 잠금화면 비활성화
    try {
      // 화면 잠금 없음 설정
      await this.putSetting(deviceSerial, 'secure', 'lockscreen.disabled', '1');
      settings.lockscreenDisabled = { setting: 'lockscreen.disabled', value: '1', result: true };
    } catch {
      settings.lockscreenDisabled = { setting: 'lockscreen.disabled', value: '1', result: false };
    }

    // 2. 잠금화면 타임아웃 최대화
    await this.putSetting(deviceSerial, 'secure', 'lock_screen_lock_after_timeout', '2147483647');
    settings.lockTimeout = { setting: 'lock_screen_lock_after_timeout', value: 'max', result: true };

    // 3. USB 디버깅 유지
    await this.putSetting(deviceSerial, 'global', 'adb_enabled', '1');
    settings.adbEnabled = { setting: 'adb_enabled', value: '1', result: true };

    // 4. 알 수 없는 소스 허용 (APK 설치용)
    await this.putSetting(deviceSerial, 'secure', 'install_non_market_apps', '1');
    settings.unknownSources = { setting: 'install_non_market_apps', value: '1', result: true };

    // 5. 개발자 옵션 유지
    await this.putSetting(deviceSerial, 'global', 'development_settings_enabled', '1');
    settings.devOptions = { setting: 'development_settings_enabled', value: '1', result: true };

    // 6. USB 디버깅 권한 부여 자동 승인 (ADB 키 신뢰)
    // 참고: 이 설정은 일부 기기에서만 작동
    try {
      await this.putSetting(deviceSerial, 'global', 'adb_wifi_enabled', '1');
    } catch {
      // 무시
    }

    // 7. 배터리 최적화 비활성화 (AutoX.js용)
    try {
      await this.shell(deviceSerial, 'dumpsys deviceidle whitelist +org.autojs.autoxjs.v6');
    } catch {
      // 일부 기기에서 실패 가능
    }

    // 8. Doze 모드에서 제외
    try {
      await this.shell(deviceSerial, 'cmd appops set org.autojs.autoxjs.v6 RUN_IN_BACKGROUND allow');
    } catch {
      // 일부 기기에서 실패 가능
    }

    // 9. 화면 고정 비활성화 (자동화 방해 방지)
    await this.putSetting(deviceSerial, 'system', 'lock_to_app_enabled', '0');

    // 10. 검증
    const verifyAdb = await this.getSetting(deviceSerial, 'global', 'adb_enabled');
    const verifyDev = await this.getSetting(deviceSerial, 'global', 'development_settings_enabled');

    return {
      settings,
      verified: {
        adbEnabled: verifyAdb === '1',
        devOptionsEnabled: verifyDev === '1',
      },
    };
  }
}

export default SecurityStep;
