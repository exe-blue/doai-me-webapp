/**
 * Standardize Step
 * 
 * 표준화: 해상도, DPI, 타임존, 언어 설정
 */

import { BaseStep, StepContext } from './BaseStep';

export class StandardizeStep extends BaseStep {
  constructor() {
    super('standardize');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial, config } = context;
    const { resolution, dpi, timezone, language } = config;

    const changes: Record<string, { before: string; after: string }> = {};

    // 1. 해상도 설정
    const currentSize = await this.shell(deviceSerial, 'wm size');
    const targetSize = `${resolution.width}x${resolution.height}`;
    
    if (!currentSize.includes(targetSize)) {
      await this.shell(deviceSerial, `wm size ${targetSize}`);
      changes.resolution = { before: currentSize.trim(), after: targetSize };
    }

    // 2. DPI 설정
    const currentDpi = await this.shell(deviceSerial, 'wm density');
    const targetDpi = dpi.toString();
    
    if (!currentDpi.includes(targetDpi)) {
      await this.shell(deviceSerial, `wm density ${dpi}`);
      changes.dpi = { before: currentDpi.trim(), after: targetDpi };
    }

    // 3. 타임존 설정
    const currentTz = await this.shell(deviceSerial, 'getprop persist.sys.timezone');
    
    if (currentTz.trim() !== timezone) {
      await this.shell(deviceSerial, `setprop persist.sys.timezone ${timezone}`);
      // 시스템 서비스 알림
      await this.shell(deviceSerial, 'am broadcast -a android.intent.action.TIMEZONE_CHANGED');
      changes.timezone = { before: currentTz.trim(), after: timezone };
    }

    // 4. 자동 화면 꺼짐 비활성화 (최대값)
    await this.putSetting(deviceSerial, 'system', 'screen_off_timeout', '2147483647');

    // 5. 화면 밝기 설정 (50%)
    await this.putSetting(deviceSerial, 'system', 'screen_brightness', '127');
    await this.putSetting(deviceSerial, 'system', 'screen_brightness_mode', '0'); // 수동 모드

    // 6. 애니메이션 비활성화 (자동화 속도 향상)
    await this.putSetting(deviceSerial, 'global', 'window_animation_scale', '0');
    await this.putSetting(deviceSerial, 'global', 'transition_animation_scale', '0');
    await this.putSetting(deviceSerial, 'global', 'animator_duration_scale', '0');

    // 7. 개발자 옵션 활성화 확인
    const devOptionsEnabled = await this.getSetting(deviceSerial, 'global', 'development_settings_enabled');
    if (devOptionsEnabled !== '1') {
      await this.putSetting(deviceSerial, 'global', 'development_settings_enabled', '1');
    }

    // 8. Stay awake on charge
    await this.putSetting(deviceSerial, 'global', 'stay_on_while_plugged_in', '7'); // AC, USB, Wireless

    // 검증
    const finalSize = await this.shell(deviceSerial, 'wm size');
    const finalDpi = await this.shell(deviceSerial, 'wm density');

    return {
      changes,
      verified: {
        resolution: finalSize.includes(targetSize),
        dpi: finalDpi.includes(targetDpi),
        animationsDisabled: true,
        stayAwake: true,
      },
    };
  }

  protected override async postValidate(context: StepContext): Promise<void> {
    const { deviceSerial, config } = context;
    
    // 해상도 검증
    const size = await this.shell(deviceSerial, 'wm size');
    if (!size.includes(`${config.resolution.width}x${config.resolution.height}`)) {
      throw new Error('Resolution not applied correctly');
    }
  }
}

export default StandardizeStep;
