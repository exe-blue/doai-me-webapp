import { JobHandler, JobContext, JobResult } from '@doai/worker-types';
import { AdbController, Logger, defaultLogger } from '@doai/worker-core';

export interface UninstallJobParams {
  packageName: string;
  keepData?: boolean;
}

export interface UninstallJobResultData {
  packageName: string;
  uninstalledAt: number;
  dataKept: boolean;
}

export class UninstallHandler implements JobHandler {
  readonly name = 'app_uninstall';
  readonly supportedWorkflows = ['app_uninstall', 'app_remove'];

  private adb: AdbController;
  private logger: Logger;

  constructor(adb: AdbController, logger?: Logger) {
    this.adb = adb;
    this.logger = logger ?? defaultLogger.child('UninstallHandler');
  }

  validate(params: Record<string, unknown>): boolean | string {
    const p = params as unknown as UninstallJobParams;
    if (!p.packageName) return 'packageName is required';
    return true;
  }

  async execute(context: JobContext): Promise<JobResult> {
    const { deviceId, params, reportProgress, logger } = context;
    const uninstallParams = params as unknown as UninstallJobParams;

    try {
      reportProgress(10, 'Checking package exists');

      // Verify package exists
      const listOutput = await this.adb.executeShell(deviceId, `pm list packages ${uninstallParams.packageName}`);
      if (!listOutput.includes(uninstallParams.packageName)) {
        return {
          success: false,
          error: { code: 'PACKAGE_NOT_FOUND', message: `Package ${uninstallParams.packageName} not found`, recoverable: false },
        };
      }

      reportProgress(30, `Uninstalling ${uninstallParams.packageName}`);
      const cmd = uninstallParams.keepData
        ? `pm uninstall -k ${uninstallParams.packageName}`
        : `pm uninstall ${uninstallParams.packageName}`;
      await this.adb.executeShell(deviceId, cmd);

      reportProgress(80, 'Verifying removal');
      const verifyOutput = await this.adb.executeShell(deviceId, `pm list packages ${uninstallParams.packageName}`);
      if (verifyOutput.includes(uninstallParams.packageName)) {
        return {
          success: false,
          error: { code: 'UNINSTALL_FAILED', message: 'Package still exists after uninstall', recoverable: true },
        };
      }

      reportProgress(100, 'Uninstall complete');
      const resultData: UninstallJobResultData = {
        packageName: uninstallParams.packageName,
        uninstalledAt: Date.now(),
        dataKept: uninstallParams.keepData ?? false,
      };

      return { success: true, data: resultData as unknown as Record<string, unknown> };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Uninstallation failed', { error: msg });
      return {
        success: false,
        error: { code: 'UNINSTALL_FAILED', message: msg, recoverable: true },
      };
    }
  }
}
