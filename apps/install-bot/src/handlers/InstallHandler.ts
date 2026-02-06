import { JobHandler, JobContext, JobResult } from '@doai/worker-types';
import { AdbController, Logger, defaultLogger } from '@doai/worker-core';

export interface InstallJobParams {
  apkPath?: string;
  apkUrl?: string;
  packageName: string;
  reinstall?: boolean;
  grantPermissions?: boolean;
  permissionsToGrant?: string[];
}

export interface InstallJobResultData {
  packageName: string;
  versionName: string;
  versionCode: number;
  installedAt: number;
  permissionsGranted: string[];
}

export class InstallHandler implements JobHandler {
  readonly name = 'app_install';
  readonly supportedWorkflows = ['app_install', 'app_update'];

  private adb: AdbController;
  private logger: Logger;

  constructor(adb: AdbController, logger?: Logger) {
    this.adb = adb;
    this.logger = logger ?? defaultLogger.child('InstallHandler');
  }

  validate(params: Record<string, unknown>): boolean | string {
    const p = params as unknown as InstallJobParams;
    if (!p.packageName) return 'packageName is required';
    if (!p.apkPath && !p.apkUrl) return 'Either apkPath or apkUrl is required';
    return true;
  }

  async execute(context: JobContext): Promise<JobResult> {
    const { deviceId, params, reportProgress, logger } = context;
    const installParams = params as unknown as InstallJobParams;

    try {
      reportProgress(10, 'Preparing installation');

      // Step 1: Install APK
      reportProgress(20, `Installing ${installParams.packageName}`);
      if (installParams.apkPath) {
        const cmd = installParams.reinstall
          ? `pm install -r "${installParams.apkPath}"`
          : `pm install "${installParams.apkPath}"`;
        await this.adb.executeShell(deviceId, cmd);
      }

      reportProgress(60, 'Installation complete, verifying');

      // Step 2: Verify installation
      const versionOutput = await this.adb.executeShell(deviceId,
        `dumpsys package ${installParams.packageName} | grep -E "versionName|versionCode"`);

      const versionName = versionOutput.match(/versionName=([^\s]+)/)?.[1] ?? 'unknown';
      const versionCode = parseInt(versionOutput.match(/versionCode=(\d+)/)?.[1] ?? '0', 10);

      // Step 3: Grant permissions if requested
      const permissionsGranted: string[] = [];
      if (installParams.grantPermissions) {
        reportProgress(75, 'Granting permissions');
        const defaultPermissions = [
          'android.permission.POST_NOTIFICATIONS',
          'android.permission.SYSTEM_ALERT_WINDOW',
        ];
        const permsToGrant = installParams.permissionsToGrant ?? defaultPermissions;

        for (const perm of permsToGrant) {
          try {
            await this.adb.executeShell(deviceId, `pm grant ${installParams.packageName} ${perm}`);
            permissionsGranted.push(perm);
            logger.info(`Granted permission: ${perm}`);
          } catch {
            logger.warn(`Failed to grant permission: ${perm}`);
          }
        }
      }

      reportProgress(100, 'Install complete');

      const resultData: InstallJobResultData = {
        packageName: installParams.packageName,
        versionName,
        versionCode,
        installedAt: Date.now(),
        permissionsGranted,
      };

      return { success: true, data: resultData as unknown as Record<string, unknown> };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Installation failed', { error: msg });
      return {
        success: false,
        error: { code: 'INSTALL_FAILED', message: msg, recoverable: true },
      };
    }
  }

  async cleanup(context: JobContext): Promise<void> {
    // Press home to exit any install dialogs
    try {
      await this.adb.executeShell(context.deviceId, 'input keyevent 3');
    } catch { /* ignore */ }
  }
}
