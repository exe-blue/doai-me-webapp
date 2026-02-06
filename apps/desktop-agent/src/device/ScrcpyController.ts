/**
 * scrcpy Controller
 *
 * scrcpy 스트림 관리 및 헬스체크
 */

import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 5000;

/** 플랫폼별 바이너리 이름 */
const SCRCPY_BIN = process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy';

export interface ScrcpyHealthResult {
  status: 'ok' | 'error' | 'missing';
  version?: string;
  activeStreams: number;
  error?: string;
  lastCheck: number;
}

export interface ScrcpyStreamInfo {
  deviceId: string;
  pid: number | undefined;
  startedAt: number;
}

export interface ScrcpyStreamOptions {
  maxSize?: number;       // --max-size (해상도 제한)
  bitRate?: string;       // --bit-rate (비트레이트)
  noDisplay?: boolean;    // --no-display (화면 미표시, 녹화용)
  record?: string;        // --record (파일 경로)
}

/**
 * scrcpy 컨트롤러
 */
export class ScrcpyController {
  private streams: Map<string, { process: ChildProcess; startedAt: number }> = new Map();

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
   * 헬스체크 - scrcpy --version 실행
   */
  async healthCheck(): Promise<ScrcpyHealthResult> {
    try {
      const version = await this.getVersion();
      return {
        status: 'ok',
        version,
        activeStreams: this.streams.size,
        lastCheck: Date.now(),
      };
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === 'ENOENT') {
        return {
          status: 'missing',
          error: 'scrcpy not found',
          activeStreams: 0,
          lastCheck: Date.now(),
        };
      }
      return {
        status: 'error',
        error: err.message,
        activeStreams: this.streams.size,
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * 버전 조회
   */
  async getVersion(): Promise<string> {
    const { stdout } = await execFileAsync(SCRCPY_BIN, ['--version'], {
      timeout: TIMEOUT_MS,
      windowsHide: true,
    });
    // scrcpy --version 출력: "scrcpy 2.x" 또는 "scrcpy v2.x"
    const match = stdout.match(/scrcpy\s+v?([\d.]+)/i);
    return match ? match[1] : stdout.trim().split('\n')[0];
  }

  /**
   * 스트림 시작
   */
  startStream(deviceId: string, options?: ScrcpyStreamOptions): void {
    const safeDeviceId = this.sanitizeInput(deviceId);

    if (this.streams.has(safeDeviceId)) {
      logger.warn('scrcpy stream already running for device', { deviceId: safeDeviceId });
      return;
    }

    const args = ['-s', safeDeviceId];

    if (options?.maxSize) {
      args.push('--max-size', String(options.maxSize));
    }
    if (options?.bitRate) {
      args.push('--bit-rate', options.bitRate);
    }
    if (options?.noDisplay) {
      args.push('--no-display');
    }
    if (options?.record) {
      args.push('--record', options.record);
    }

    logger.info('Starting scrcpy stream', { deviceId: safeDeviceId, args });

    const proc = spawn(SCRCPY_BIN, args, {
      windowsHide: true,
      stdio: 'ignore',
    });

    const entry = { process: proc, startedAt: Date.now() };
    this.streams.set(safeDeviceId, entry);

    proc.on('error', (err) => {
      logger.error('scrcpy process error', { deviceId: safeDeviceId, error: err.message });
      this.streams.delete(safeDeviceId);
    });

    proc.on('exit', (code) => {
      logger.info('scrcpy process exited', { deviceId: safeDeviceId, code });
      this.streams.delete(safeDeviceId);
    });
  }

  /**
   * 특정 기기 스트림 종료
   */
  stopStream(deviceId: string): void {
    const safeDeviceId = this.sanitizeInput(deviceId);
    const entry = this.streams.get(safeDeviceId);
    if (!entry) return;

    logger.info('Stopping scrcpy stream', { deviceId: safeDeviceId });
    entry.process.kill();
    this.streams.delete(safeDeviceId);
  }

  /**
   * 모든 스트림 종료
   */
  stopAllStreams(): void {
    logger.info('Stopping all scrcpy streams', { count: this.streams.size });
    for (const [deviceId, entry] of this.streams) {
      entry.process.kill();
      logger.debug('Stopped scrcpy stream', { deviceId });
    }
    this.streams.clear();
  }

  /**
   * 특정 기기 스트림 여부
   */
  isStreaming(deviceId: string): boolean {
    return this.streams.has(deviceId);
  }

  /**
   * 모든 활성 스트림 정보
   */
  getAllStreams(): ScrcpyStreamInfo[] {
    const result: ScrcpyStreamInfo[] = [];
    for (const [deviceId, entry] of this.streams) {
      result.push({
        deviceId,
        pid: entry.process.pid,
        startedAt: entry.startedAt,
      });
    }
    return result;
  }
}

// 싱글톤
let instance: ScrcpyController | null = null;

export function getScrcpyController(): ScrcpyController {
  if (!instance) {
    instance = new ScrcpyController();
  }
  return instance;
}

export default ScrcpyController;
