/**
 * Appium Controller
 *
 * Appium 서버 관리 및 헬스체크
 */

import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 5000;

/** 플랫폼별 바이너리 이름 */
const APPIUM_BIN = process.platform === 'win32' ? 'appium.cmd' : 'appium';

export interface AppiumHealthResult {
  status: 'ok' | 'error' | 'missing';
  version?: string;
  error?: string;
  lastCheck: number;
}

/**
 * Appium 컨트롤러
 */
export class AppiumController {
  private serverProcess: ChildProcess | null = null;
  private serverPort = 4723;

  /**
   * Validate input to prevent command injection
   */
  private sanitizeInput(input: string): string {
    if (!/^[\w\s\-.:/']+$/i.test(input)) {
      throw new Error(`Invalid input contains disallowed characters: ${input}`);
    }
    const dangerousPatterns = /[;&|`$(){}[\]<>\\!]/;
    if (dangerousPatterns.test(input)) {
      throw new Error(`Input contains potentially dangerous characters: ${input}`);
    }
    return input;
  }

  /**
   * 헬스체크 - appium --version 실행
   */
  async healthCheck(): Promise<AppiumHealthResult> {
    try {
      const version = await this.getVersion();
      return { status: 'ok', version, lastCheck: Date.now() };
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === 'ENOENT') {
        return { status: 'missing', error: 'Appium not found', lastCheck: Date.now() };
      }
      return { status: 'error', error: err.message, lastCheck: Date.now() };
    }
  }

  /**
   * 버전 조회
   */
  async getVersion(): Promise<string> {
    const { stdout } = await execFileAsync(APPIUM_BIN, ['--version'], {
      timeout: TIMEOUT_MS,
      windowsHide: true,
    });
    return stdout.trim();
  }

  /**
   * Appium 서버 시작
   */
  async startServer(port = 4723): Promise<void> {
    if (this.serverProcess) {
      logger.warn('Appium server already running', { port: this.serverPort });
      return;
    }

    this.serverPort = port;
    logger.info('Starting Appium server', { port });

    this.serverProcess = spawn(APPIUM_BIN, ['--port', String(port)], {
      windowsHide: true,
      stdio: 'ignore',
    });

    this.serverProcess.on('error', (err) => {
      logger.error('Appium server process error', { error: err.message });
      this.serverProcess = null;
    });

    this.serverProcess.on('exit', (code) => {
      logger.info('Appium server exited', { code });
      this.serverProcess = null;
    });

    // 서버가 준비될 때까지 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Appium 서버 중지
   */
  stopServer(): void {
    if (!this.serverProcess) return;

    logger.info('Stopping Appium server');
    this.serverProcess.kill();
    this.serverProcess = null;
  }

  /**
   * 서버 실행 여부
   */
  isServerRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }

  /**
   * Appium 세션 생성
   */
  async createSession(
    deviceSerial: string,
    capabilities?: Record<string, unknown>
  ): Promise<{ sessionId: string }> {
    const safeSerial = this.sanitizeInput(deviceSerial);

    const body = JSON.stringify({
      capabilities: {
        alwaysMatch: {
          platformName: 'Android',
          'appium:automationName': 'UiAutomator2',
          'appium:udid': safeSerial,
          ...capabilities,
        },
      },
    });

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.serverPort,
          path: '/session',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: TIMEOUT_MS,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.value?.sessionId) {
                resolve({ sessionId: parsed.value.sessionId });
              } else {
                reject(new Error(parsed.value?.error || 'Failed to create session'));
              }
            } catch {
              reject(new Error('Invalid response from Appium'));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Appium session creation timeout'));
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * Appium 세션 삭제
   */
  async deleteSession(sessionId: string): Promise<void> {
    const safeId = this.sanitizeInput(sessionId);

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.serverPort,
          path: `/session/${safeId}`,
          method: 'DELETE',
          timeout: TIMEOUT_MS,
        },
        (res) => {
          // Drain response
          res.on('data', () => {});
          res.on('end', () => resolve());
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Appium session deletion timeout'));
      });
      req.end();
    });
  }

  /**
   * UIAutomator2 드라이버 설치 여부 확인
   */
  async isUiAutomator2Installed(): Promise<{ installed: boolean; version?: string }> {
    try {
      const { stdout } = await execFileAsync(APPIUM_BIN, ['driver', 'list', '--json'], {
        timeout: TIMEOUT_MS,
        windowsHide: true,
      });

      const parsed = JSON.parse(stdout);
      // Appium 2.x 형식: { uiautomator2: { installed: true, version: "..." } }
      const ua2 = parsed?.uiautomator2;
      if (ua2?.installed) {
        return { installed: true, version: ua2.version };
      }
      return { installed: false };
    } catch {
      return { installed: false };
    }
  }
}

// 싱글톤
let instance: AppiumController | null = null;

export function getAppiumController(): AppiumController {
  if (!instance) {
    instance = new AppiumController();
  }
  return instance;
}

export default AppiumController;
