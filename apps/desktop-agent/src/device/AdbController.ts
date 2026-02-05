/**
 * ADB Controller
 * 
 * Android Debug Bridge 명령 실행
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

/**
 * ADB 실행 옵션
 */
interface AdbOptions {
  adbPath?: string;
  timeout?: number;
}

/**
 * 디바이스 정보
 */
export interface AdbDevice {
  serial: string;
  state: 'device' | 'offline' | 'unauthorized' | 'no permissions';
  model?: string;
  product?: string;
}

/**
 * ADB 컨트롤러 클래스
 */
export class AdbController {
  private adbPath: string;
  private timeout: number;

  constructor(options: AdbOptions = {}) {
    this.adbPath = options.adbPath || process.env.ADB_PATH || 'adb';
    this.timeout = options.timeout || 30000; // 30초
  }

  /**
   * Validate and sanitize input to prevent command injection
   */
  private sanitizeInput(input: string): string {
    // Allow only alphanumeric, dashes, underscores, colons, dots, spaces, and slashes
    // This covers device serials (e.g., "192.168.1.1:5555", "emulator-5554", "R58M12345")
    // and common ADB commands
    if (!/^[\w\s\-.:/']+$/i.test(input)) {
      throw new Error(`Invalid input contains disallowed characters: ${input}`);
    }
    // Block shell injection patterns
    const dangerousPatterns = /[;&|`$(){}[\]<>\\!]/;
    if (dangerousPatterns.test(input)) {
      throw new Error(`Input contains potentially dangerous characters: ${input}`);
    }
    return input;
  }

  /**
   * ADB 명령 실행 (uses execFile to avoid shell injection)
   */
  async execute(deviceId: string, command: string): Promise<string> {
    // Sanitize inputs to prevent command injection
    const safeDeviceId = deviceId ? this.sanitizeInput(deviceId) : '';
    const safeCommand = this.sanitizeInput(command);
    
    // Build arguments array instead of shell string
    const args: string[] = [];
    
    if (safeDeviceId) {
      args.push('-s', safeDeviceId);
    }
    
    // Split command into arguments, respecting quoted strings
    const commandArgs = this.parseCommandArgs(safeCommand);
    args.push(...commandArgs);

    logger.debug('Executing ADB command', { deviceId: safeDeviceId, command: safeCommand, args });

    try {
      // Use execFile instead of exec to avoid shell interpretation
      const { stdout, stderr } = await execFileAsync(this.adbPath, args, {
        timeout: this.timeout,
        windowsHide: true,
      });

      if (stderr && !stderr.includes('daemon')) {
        logger.warn('ADB stderr', { stderr: stderr.trim() });
      }

      return stdout.trim();
    } catch (error) {
      const err = error as Error & { code?: number; killed?: boolean };
      
      if (err.killed) {
        throw new Error(`ADB command timeout: ${command}`);
      }

      logger.error('ADB command failed', {
        deviceId,
        command,
        error: err.message,
      });
      
      throw error;
    }
  }

  /**
   * Parse command string into arguments array, respecting quoted strings
   */
  private parseCommandArgs(command: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      
      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && char === ' ') {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current) {
      args.push(current);
    }
    
    return args;
  }

  /**
   * 연결된 디바이스 목록
   */
  async getConnectedDevices(): Promise<string[]> {
    try {
      const output = await this.execute('', 'devices');
      const lines = output.split('\n').slice(1); // 첫 줄은 헤더

      const devices: string[] = [];
      
      for (const line of lines) {
        const [serial, state] = line.trim().split(/\s+/);
        if (serial && state === 'device') {
          devices.push(serial);
        }
      }

      return devices;
    } catch (error) {
      logger.error('Failed to get connected devices', { error });
      return [];
    }
  }

  /**
   * 상세 디바이스 정보
   */
  async getDevicesInfo(): Promise<AdbDevice[]> {
    try {
      const output = await this.execute('', 'devices -l');
      const lines = output.split('\n').slice(1);

      const devices: AdbDevice[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.trim().split(/\s+/);
        const serial = parts[0];
        const state = parts[1] as AdbDevice['state'];

        if (!serial || serial === '*') continue;

        const device: AdbDevice = { serial, state };

        // 추가 정보 파싱
        for (const part of parts.slice(2)) {
          const [key, value] = part.split(':');
          if (key === 'model') device.model = value;
          if (key === 'product') device.product = value;
        }

        devices.push(device);
      }

      return devices;
    } catch (error) {
      logger.error('Failed to get devices info', { error });
      return [];
    }
  }

  /**
   * 디바이스 재연결
   */
  async reconnect(deviceId: string): Promise<void> {
    logger.info('Reconnecting device', { deviceId });
    
    try {
      // USB 재연결
      await this.execute(deviceId, 'reconnect');
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 연결 확인
      const devices = await this.getConnectedDevices();
      if (!devices.includes(deviceId)) {
        throw new Error('Device not found after reconnect');
      }

      logger.info('Device reconnected successfully', { deviceId });
    } catch (error) {
      logger.error('Reconnect failed', { deviceId, error });
      throw error;
    }
  }

  /**
   * 디바이스 배터리 정보
   */
  async getBatteryLevel(deviceId: string): Promise<number> {
    try {
      const output = await this.execute(deviceId, 'shell dumpsys battery | grep level');
      const match = output.match(/level:\s*(\d+)/);
      return match ? parseInt(match[1], 10) : -1;
    } catch {
      return -1;
    }
  }

  /**
   * 화면 상태 확인
   */
  async isScreenOn(deviceId: string): Promise<boolean> {
    try {
      const output = await this.execute(deviceId, 'shell dumpsys display | grep mScreenState');
      return output.includes('ON');
    } catch {
      return false;
    }
  }

  /**
   * 화면 켜기
   */
  async wakeUp(deviceId: string): Promise<void> {
    await this.execute(deviceId, 'shell input keyevent KEYCODE_WAKEUP');
  }

  /**
   * 화면 끄기
   */
  async sleep(deviceId: string): Promise<void> {
    await this.execute(deviceId, 'shell input keyevent KEYCODE_SLEEP');
  }

  /**
   * 스크린샷 캡처
   */
  async screenshot(deviceId: string, localPath: string): Promise<void> {
    const remotePath = '/sdcard/screenshot.png';
    
    await this.execute(deviceId, `shell screencap -p ${remotePath}`);
    await this.execute(deviceId, `pull ${remotePath} "${localPath}"`);
    await this.execute(deviceId, `shell rm ${remotePath}`);
  }

  /**
   * ADB 서버 재시작
   */
  async restartServer(): Promise<void> {
    logger.info('Restarting ADB server');
    
    try {
      await this.execute('', 'kill-server');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.execute('', 'start-server');
      
      logger.info('ADB server restarted');
    } catch (error) {
      logger.error('Failed to restart ADB server', { error });
      throw error;
    }
  }

  /**
   * ADB 버전 확인
   */
  async getVersion(): Promise<string> {
    const output = await this.execute('', 'version');
    const match = output.match(/version ([\d.]+)/);
    return match ? match[1] : 'unknown';
  }
}

// 싱글톤
let instance: AdbController | null = null;

export function getAdbController(options?: AdbOptions): AdbController {
  if (!instance) {
    instance = new AdbController(options);
  }
  return instance;
}

export default AdbController;
