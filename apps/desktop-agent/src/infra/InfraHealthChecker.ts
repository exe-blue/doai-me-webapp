/**
 * Infra Health Checker
 *
 * 5개 인프라 서비스 통합 헬스체크 오케스트레이터
 * - ADB, UIAutomator2, Appium, scrcpy, Backend
 */

import http from 'http';
import https from 'https';
import { getAdbController } from '../device/AdbController';
import { getAppiumController } from '../device/AppiumController';
import { getScrcpyController } from '../device/ScrcpyController';
import { logger } from '../utils/logger';

const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 30000; // 30초

export interface ServiceHealth {
  status: 'ok' | 'error' | 'missing';
  version?: string;
  error?: string;
  lastCheck: number;
}

export interface InfraHealthStatus {
  adb: ServiceHealth;
  uiautomator2: ServiceHealth;
  appium: ServiceHealth;
  scrcpy: ServiceHealth;
  backend: ServiceHealth;
}

/**
 * 인프라 헬스체크 오케스트레이터
 */
export class InfraHealthChecker {
  private cachedResult: InfraHealthStatus | null = null;
  private cachedAt = 0;
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * 통합 헬스체크 (30초 캐시)
   */
  async check(forceRefresh = false): Promise<InfraHealthStatus> {
    if (!forceRefresh && this.cachedResult && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cachedResult;
    }

    logger.info('Running infra health check');

    const [adb, uiautomator2, appium, scrcpy, backend] = await Promise.all([
      this.checkAdb(),
      this.checkUIAutomator2(),
      this.checkAppium(),
      this.checkScrcpy(),
      this.checkBackend(),
    ]);

    this.cachedResult = { adb, uiautomator2, appium, scrcpy, backend };
    this.cachedAt = Date.now();

    logger.info('Infra health check complete', {
      adb: adb.status,
      uiautomator2: uiautomator2.status,
      appium: appium.status,
      scrcpy: scrcpy.status,
      backend: backend.status,
    });

    return this.cachedResult;
  }

  /**
   * ADB 헬스체크
   */
  private async checkAdb(): Promise<ServiceHealth> {
    try {
      const adb = getAdbController();
      const version = await adb.getVersion();
      return { status: 'ok', version, lastCheck: Date.now() };
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === 'ENOENT') {
        return { status: 'missing', error: 'ADB not found', lastCheck: Date.now() };
      }
      return { status: 'error', error: err.message, lastCheck: Date.now() };
    }
  }

  /**
   * UIAutomator2 드라이버 헬스체크
   */
  private async checkUIAutomator2(): Promise<ServiceHealth> {
    try {
      const appium = getAppiumController();
      const result = await appium.isUiAutomator2Installed();
      if (result.installed) {
        return { status: 'ok', version: result.version, lastCheck: Date.now() };
      }
      return { status: 'missing', error: 'UIAutomator2 driver not installed', lastCheck: Date.now() };
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === 'ENOENT') {
        return { status: 'missing', error: 'Appium not found (required for UIAutomator2)', lastCheck: Date.now() };
      }
      return { status: 'error', error: err.message, lastCheck: Date.now() };
    }
  }

  /**
   * Appium 헬스체크
   */
  private async checkAppium(): Promise<ServiceHealth> {
    try {
      const appium = getAppiumController();
      return await appium.healthCheck();
    } catch (error) {
      return { status: 'error', error: (error as Error).message, lastCheck: Date.now() };
    }
  }

  /**
   * scrcpy 헬스체크
   */
  private async checkScrcpy(): Promise<ServiceHealth> {
    try {
      const scrcpy = getScrcpyController();
      const result = await scrcpy.healthCheck();
      return {
        status: result.status,
        version: result.version,
        error: result.error,
        lastCheck: result.lastCheck,
      };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, lastCheck: Date.now() };
    }
  }

  /**
   * Backend 서버 헬스체크
   */
  private async checkBackend(): Promise<ServiceHealth> {
    const url = `${this.serverUrl}/health`;

    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;

      const req = client.request(url, { method: 'GET', timeout: TIMEOUT_MS }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            resolve({ status: 'ok', version: data.trim().slice(0, 50) || undefined, lastCheck: Date.now() });
          } else {
            resolve({ status: 'error', error: `HTTP ${res.statusCode}`, lastCheck: Date.now() });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ status: 'error', error: err.message, lastCheck: Date.now() });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 'error', error: 'Connection timeout', lastCheck: Date.now() });
      });

      req.end();
    });
  }
}

// 싱글톤
let instance: InfraHealthChecker | null = null;

export function getInfraHealthChecker(serverUrl?: string): InfraHealthChecker {
  if (!instance) {
    instance = new InfraHealthChecker(serverUrl || 'https://api.doai.me');
  }
  return instance;
}

export default InfraHealthChecker;
