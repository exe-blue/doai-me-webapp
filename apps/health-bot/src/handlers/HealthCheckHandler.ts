// ============================================
// DoAi.Me Health Bot - Health Check Handler
// Performs comprehensive device health checks
// ============================================

import { JobHandler, JobContext, JobResult } from '@doai/worker-types';
import { AdbController, Logger, defaultLogger } from '@doai/worker-core';

export interface HealthCheckParams {
  checkBattery?: boolean;
  checkMemory?: boolean;
  checkNetwork?: boolean;
  checkScreen?: boolean;
  checkStorage?: boolean;
}

export interface HealthCheckResultData {
  battery: { level: number; temperature: number; isCharging: boolean } | null;
  memory: { totalMb: number; availableMb: number; usagePercent: number } | null;
  network: { connected: boolean; type: string } | null;
  screen: { isOn: boolean; brightness: number } | null;
  storage: { totalMb: number; availableMb: number; usagePercent: number } | null;
  overallHealthy: boolean;
  checkedAt: number;
}

export class HealthCheckHandler implements JobHandler {
  readonly name = 'health_check';
  readonly supportedWorkflows = ['health_check', 'device_health'];

  private adb: AdbController;
  private logger: Logger;

  constructor(adb: AdbController, logger?: Logger) {
    this.adb = adb;
    this.logger = logger ?? defaultLogger.child('HealthCheckHandler');
  }

  async execute(context: JobContext): Promise<JobResult> {
    const { deviceId, params, reportProgress, logger } = context;
    const checkParams = params as unknown as HealthCheckParams;
    const shouldCheckAll = !checkParams.checkBattery && !checkParams.checkMemory &&
                          !checkParams.checkNetwork && !checkParams.checkScreen && !checkParams.checkStorage;

    let healthy = true;
    const result: HealthCheckResultData = {
      battery: null, memory: null, network: null, screen: null, storage: null,
      overallHealthy: true, checkedAt: Date.now(),
    };

    try {
      // Battery check
      if (shouldCheckAll || checkParams.checkBattery) {
        reportProgress(10, 'Checking battery');
        try {
          const batteryOutput = await this.adb.executeShell(deviceId, 'dumpsys battery');
          const level = parseInt(batteryOutput.match(/level:\s*(\d+)/)?.[1] ?? '0', 10);
          const temp = parseInt(batteryOutput.match(/temperature:\s*(\d+)/)?.[1] ?? '0', 10) / 10;
          const isCharging = /status:\s*2/.test(batteryOutput) || /AC powered:\s*true/.test(batteryOutput);
          result.battery = { level, temperature: temp, isCharging };
          if (level < 15 && !isCharging) healthy = false;
        } catch (e) {
          logger.warn('Battery check failed', { error: String(e) });
        }
      }

      // Memory check
      if (shouldCheckAll || checkParams.checkMemory) {
        reportProgress(30, 'Checking memory');
        try {
          const memOutput = await this.adb.executeShell(deviceId, 'cat /proc/meminfo');
          const totalMatch = memOutput.match(/MemTotal:\s*(\d+)/);
          const availMatch = memOutput.match(/MemAvailable:\s*(\d+)/);
          if (totalMatch && availMatch) {
            const totalMb = Math.floor(parseInt(totalMatch[1], 10) / 1024);
            const availableMb = Math.floor(parseInt(availMatch[1], 10) / 1024);
            const usagePercent = Math.round(((totalMb - availableMb) / totalMb) * 100);
            result.memory = { totalMb, availableMb, usagePercent };
            if (usagePercent > 90) healthy = false;
          }
        } catch (e) {
          logger.warn('Memory check failed', { error: String(e) });
        }
      }

      // Network check
      if (shouldCheckAll || checkParams.checkNetwork) {
        reportProgress(50, 'Checking network');
        try {
          const pingOutput = await this.adb.executeShell(deviceId, 'ping -c 1 -W 3 8.8.8.8');
          const connected = pingOutput.includes('1 received');
          const wifiOutput = await this.adb.executeShell(deviceId, 'dumpsys wifi | grep "Wi-Fi is"');
          const type = wifiOutput.includes('enabled') ? 'wifi' : 'mobile';
          result.network = { connected, type };
          if (!connected) healthy = false;
        } catch (e) {
          result.network = { connected: false, type: 'none' };
          healthy = false;
        }
      }

      // Screen check
      if (shouldCheckAll || checkParams.checkScreen) {
        reportProgress(70, 'Checking screen');
        try {
          const displayOutput = await this.adb.executeShell(deviceId, 'dumpsys display | grep "mScreenState"');
          const isOn = displayOutput.includes('ON');
          const brightnessOutput = await this.adb.executeShell(deviceId, 'settings get system screen_brightness');
          const brightness = parseInt(brightnessOutput.trim(), 10) || 0;
          result.screen = { isOn, brightness };
        } catch (e) {
          logger.warn('Screen check failed', { error: String(e) });
        }
      }

      // Storage check
      if (shouldCheckAll || checkParams.checkStorage) {
        reportProgress(85, 'Checking storage');
        try {
          const dfOutput = await this.adb.executeShell(deviceId, 'df /data');
          const parts = dfOutput.split('\n')[1]?.split(/\s+/);
          if (parts && parts.length >= 4) {
            const totalMb = Math.floor(parseInt(parts[1], 10) / 1024);
            const usedMb = Math.floor(parseInt(parts[2], 10) / 1024);
            const availableMb = Math.floor(parseInt(parts[3], 10) / 1024);
            const usagePercent = Math.round((usedMb / totalMb) * 100);
            result.storage = { totalMb, availableMb, usagePercent };
            if (usagePercent > 95) healthy = false;
          }
        } catch (e) {
          logger.warn('Storage check failed', { error: String(e) });
        }
      }

      result.overallHealthy = healthy;
      reportProgress(100, healthy ? 'Device is healthy' : 'Health issues detected');

      return { success: true, data: result as unknown as Record<string, unknown> };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: { code: 'HEALTH_CHECK_FAILED', message: msg, recoverable: true },
      };
    }
  }
}
