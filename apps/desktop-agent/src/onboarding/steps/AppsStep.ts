/**
 * Apps Step
 * 
 * 필수 앱 설치: AutoX.js, YouTube 등
 */

import { BaseStep, StepContext } from './BaseStep';
import { getResourcePath } from '../../config/AppConfig';
import * as fs from 'fs';
import * as path from 'path';

export class AppsStep extends BaseStep {
  constructor() {
    super('apps');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial, config } = context;
    const { apks } = config;

    const results: Record<string, { 
      installed: boolean; 
      alreadyInstalled: boolean;
      error?: string;
    }> = {};

    for (const apk of apks) {
      const apkName = apk.name;
      
      try {
        // 1. 이미 설치되어 있는지 확인
        const isInstalled = await this.isPackageInstalled(deviceSerial, apk.packageName);
        
        if (isInstalled) {
          results[apkName] = { installed: true, alreadyInstalled: true };
          continue;
        }

        // 2. APK 파일 존재 확인
        const apkPath = this.resolveApkPath(apk.path);
        
        if (!fs.existsSync(apkPath)) {
          if (apk.required) {
            throw new Error(`Required APK not found: ${apkPath}`);
          }
          results[apkName] = { installed: false, alreadyInstalled: false, error: 'APK file not found' };
          continue;
        }

        // 3. APK 설치
        await this.installApk(deviceSerial, apkPath);

        // 4. 설치 검증
        await this.sleep(2000); // 설치 완료 대기
        const verifyInstalled = await this.isPackageInstalled(deviceSerial, apk.packageName);

        if (!verifyInstalled && apk.required) {
          throw new Error(`Failed to install required app: ${apkName}`);
        }

        results[apkName] = { installed: verifyInstalled, alreadyInstalled: false };

        // 5. 필요한 권한 부여
        if (verifyInstalled) {
          await this.grantPermissions(deviceSerial, apk.packageName);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results[apkName] = { installed: false, alreadyInstalled: false, error: errorMsg };
        
        if (apk.required) {
          throw error;
        }
      }
    }

    // 설치된 앱 수 계산
    const installedCount = Object.values(results).filter(r => r.installed).length;
    const requiredCount = apks.filter(a => a.required).length;
    const requiredInstalled = apks
      .filter(a => a.required)
      .every(a => results[a.name]?.installed);

    return {
      results,
      summary: {
        total: apks.length,
        installed: installedCount,
        required: requiredCount,
        allRequiredInstalled: requiredInstalled,
      },
    };
  }

  /**
   * APK 경로 해석
   */
  private resolveApkPath(apkPath: string): string {
    // 절대 경로인 경우 그대로 사용
    if (path.isAbsolute(apkPath)) {
      return apkPath;
    }

    // 상대 경로인 경우 번들된 리소스 디렉토리 기준
    const resourcesDir = process.env.APK_DIR || getResourcePath('apks');
    return path.join(resourcesDir, path.basename(apkPath));
  }

  /**
   * APK 설치
   */
  private async installApk(deviceSerial: string, apkPath: string): Promise<void> {
    // -r: reinstall, -g: grant all permissions
    const output = await this.adb.execute(deviceSerial, `install -r -g '${apkPath}'`);
    
    if (output.toLowerCase().includes('failure')) {
      throw new Error(`APK installation failed: ${output}`);
    }
  }

  /**
   * 앱 권한 부여
   */
  private async grantPermissions(deviceSerial: string, packageName: string): Promise<void> {
    const permissions = [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ];

    for (const permission of permissions) {
      try {
        await this.shell(deviceSerial, `pm grant ${packageName} ${permission}`);
      } catch {
        // 일부 권한은 부여 불가 - 무시
      }
    }
  }
}

export default AppsStep;
