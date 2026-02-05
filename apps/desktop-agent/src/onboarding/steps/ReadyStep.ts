/**
 * Ready Step
 * 
 * 최종 검증: 모든 설정 확인 및 준비 완료 표시
 */

import { BaseStep, StepContext } from './BaseStep';

export class ReadyStep extends BaseStep {
  constructor() {
    super('ready');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial, config, previousResults } = context;

    const checks: Record<string, { passed: boolean; detail?: string }> = {};

    // 1. ADB 연결 확인
    const devices = await this.adb.getConnectedDevices();
    checks.adbConnection = {
      passed: devices.includes(deviceSerial),
      detail: devices.includes(deviceSerial) ? 'Connected' : 'Not connected',
    };

    // 2. 해상도 확인
    const size = await this.shell(deviceSerial, 'wm size');
    const targetSize = `${config.resolution.width}x${config.resolution.height}`;
    checks.resolution = {
      passed: size.includes(targetSize),
      detail: size.trim(),
    };

    // 3. 접근성 서비스 확인
    const accessibilityEnabled = await this.getSetting(deviceSerial, 'secure', 'accessibility_enabled');
    checks.accessibility = {
      passed: accessibilityEnabled === '1',
      detail: accessibilityEnabled === '1' ? 'Enabled' : 'Disabled',
    };

    // 4. USB 디버깅 확인
    const adbEnabled = await this.getSetting(deviceSerial, 'global', 'adb_enabled');
    checks.usbDebugging = {
      passed: adbEnabled === '1',
      detail: adbEnabled === '1' ? 'Enabled' : 'Disabled',
    };

    // 5. 필수 앱 설치 확인
    const requiredApps = config.apks.filter(a => a.required);
    const appChecks: Record<string, boolean> = {};
    
    for (const app of requiredApps) {
      const installed = await this.isPackageInstalled(deviceSerial, app.packageName);
      appChecks[app.name] = installed;
    }
    
    const allAppsInstalled = Object.values(appChecks).every(v => v);
    checks.requiredApps = {
      passed: allAppsInstalled,
      detail: JSON.stringify(appChecks),
    };

    // 6. 배터리 확인
    const batteryOutput = await this.shell(deviceSerial, 'dumpsys battery');
    const batteryMatch = batteryOutput.match(/level:\s*(\d+)/);
    const batteryLevel = batteryMatch ? parseInt(batteryMatch[1], 10) : -1;
    checks.battery = {
      passed: batteryLevel >= 20,
      detail: `${batteryLevel}%`,
    };

    // 7. 화면 상태 확인
    const isScreenOn = await this.adb.isScreenOn(deviceSerial);
    checks.screenState = {
      passed: true, // 화면 상태는 필수 조건 아님
      detail: isScreenOn ? 'On' : 'Off',
    };

    // 8. 인터넷 연결 확인
    try {
      const ping = await this.shell(deviceSerial, 'ping -c 1 -W 3 8.8.8.8');
      checks.internet = {
        passed: ping.includes('1 received'),
        detail: ping.includes('1 received') ? 'Connected' : 'No connection',
      };
    } catch {
      checks.internet = { passed: false, detail: 'Ping failed' };
    }

    // 9. 이전 단계 결과 요약
    const stepsSummary = previousResults.map(r => ({
      step: r.step,
      status: r.status,
      durationMs: r.durationMs,
    }));

    // 10. 최종 상태 결정
    const criticalChecks = ['adbConnection', 'resolution', 'accessibility', 'usbDebugging', 'requiredApps'];
    const allCriticalPassed = criticalChecks.every(key => checks[key]?.passed);
    const totalChecks = Object.keys(checks).length;
    const passedChecks = Object.values(checks).filter(c => c.passed).length;

    // 11. 디바이스 정보 수집
    const model = await this.shell(deviceSerial, 'getprop ro.product.model');
    const androidVersion = await this.shell(deviceSerial, 'getprop ro.build.version.release');
    const deviceName = await this.getSetting(deviceSerial, 'secure', 'bluetooth_name');

    const deviceInfo = {
      serial: deviceSerial,
      model: model.trim(),
      androidVersion: androidVersion.trim(),
      assignedName: deviceName.trim(),
      nodeId: config.nodeId,
    };

    return {
      checks,
      summary: {
        total: totalChecks,
        passed: passedChecks,
        failed: totalChecks - passedChecks,
        allCriticalPassed,
      },
      stepsSummary,
      deviceInfo,
      ready: allCriticalPassed,
      timestamp: new Date().toISOString(),
    };
  }

  protected override async postValidate(context: StepContext): Promise<void> {
    const { deviceSerial } = context;
    
    // 최종 ADB 연결 확인
    const devices = await this.adb.getConnectedDevices();
    if (!devices.includes(deviceSerial)) {
      throw new Error('Device disconnected during final verification');
    }
  }
}

export default ReadyStep;
