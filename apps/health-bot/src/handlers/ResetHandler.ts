// ============================================
// DoAi.Me Health Bot - Reset Handler
// Performs device cleanup and reset operations
// ============================================

import { JobHandler, JobContext, JobResult } from '@doai/worker-types';
import { AdbController, Logger, defaultLogger } from '@doai/worker-core';

export interface ResetParams {
  clearAppCaches?: boolean;
  packagesToClear?: string[];
  killBackgroundApps?: boolean;
  reboot?: boolean;
  freeMemory?: boolean;
}

export interface ResetResultData {
  cachesCleared: string[];
  appsKilled: number;
  memoryFreedMb: number;
  rebooted: boolean;
  resetAt: number;
}

export class ResetHandler implements JobHandler {
  readonly name = 'daily_reset';
  readonly supportedWorkflows = ['daily_reset', 'device_reset', 'device_cleanup'];

  private adb: AdbController;
  private logger: Logger;

  constructor(adb: AdbController, logger?: Logger) {
    this.adb = adb;
    this.logger = logger ?? defaultLogger.child('ResetHandler');
  }

  async execute(context: JobContext): Promise<JobResult> {
    const { deviceId, params, reportProgress, logger } = context;
    const resetParams = params as unknown as ResetParams;
    const resultData: ResetResultData = {
      cachesCleared: [], appsKilled: 0, memoryFreedMb: 0, rebooted: false, resetAt: Date.now(),
    };

    try {
      // Get memory before cleanup
      let memBefore = 0;
      try {
        const memOutput = await this.adb.executeShell(deviceId, 'cat /proc/meminfo');
        const availMatch = memOutput.match(/MemAvailable:\s*(\d+)/);
        memBefore = availMatch ? parseInt(availMatch[1], 10) / 1024 : 0;
      } catch { /* ignore */ }

      // Clear app caches
      if (resetParams.clearAppCaches !== false) {
        reportProgress(10, 'Clearing app caches');
        const defaultPackages = ['com.google.android.youtube', 'com.android.chrome'];
        const packages = resetParams.packagesToClear ?? defaultPackages;
        for (const pkg of packages) {
          try {
            await this.adb.executeShell(deviceId, `pm clear --cache-only ${pkg}`);
            resultData.cachesCleared.push(pkg);
            logger.info(`Cleared cache for ${pkg}`);
          } catch {
            // Fallback: try clearing via rm
            try {
              await this.adb.executeShell(deviceId, `rm -rf /data/data/${pkg}/cache/*`);
              resultData.cachesCleared.push(pkg);
            } catch { logger.warn(`Failed to clear cache for ${pkg}`); }
          }
        }
      }

      // Kill background apps
      if (resetParams.killBackgroundApps !== false) {
        reportProgress(40, 'Killing background apps');
        try {
          const beforeOutput = await this.adb.executeShell(deviceId, 'ps -A | wc -l');
          await this.adb.executeShell(deviceId, 'am kill-all');
          const afterOutput = await this.adb.executeShell(deviceId, 'ps -A | wc -l');
          resultData.appsKilled = Math.max(0, parseInt(beforeOutput.trim(), 10) - parseInt(afterOutput.trim(), 10));
        } catch (e) {
          logger.warn('Failed to kill background apps', { error: String(e) });
        }
      }

      // Free memory
      if (resetParams.freeMemory) {
        reportProgress(60, 'Freeing memory');
        try {
          await this.adb.executeShell(deviceId, 'echo 3 > /proc/sys/vm/drop_caches');
        } catch { /* may need root */ }
      }

      // Calculate memory freed
      try {
        const memOutput = await this.adb.executeShell(deviceId, 'cat /proc/meminfo');
        const availMatch = memOutput.match(/MemAvailable:\s*(\d+)/);
        const memAfter = availMatch ? parseInt(availMatch[1], 10) / 1024 : 0;
        resultData.memoryFreedMb = Math.max(0, Math.floor(memAfter - memBefore));
      } catch { /* ignore */ }

      // Reboot if requested
      if (resetParams.reboot) {
        reportProgress(90, 'Rebooting device');
        try {
          await this.adb.executeShell(deviceId, 'reboot');
          resultData.rebooted = true;
        } catch (e) {
          logger.warn('Reboot failed', { error: String(e) });
        }
      }

      reportProgress(100, 'Reset complete');
      return { success: true, data: resultData as unknown as Record<string, unknown> };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: { code: 'RESET_FAILED', message: msg, recoverable: true },
      };
    }
  }
}
