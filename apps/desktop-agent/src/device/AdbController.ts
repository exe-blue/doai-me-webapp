/**
 * ADB Controller
 * 
 * Android Debug Bridge 명령 실행
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { getResourcePath } from '../config/AppConfig';
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
 * 번들된 ADB 바이너리 경로 탐색
 * resources/platform-tools/ 에 포함된 ADB를 찾습니다.
 */
function findBundledAdb(): string | null {
  try {
    const bundled = getResourcePath(
      process.platform === 'win32' ? 'platform-tools/adb.exe' : 'platform-tools/adb'
    );
    return fs.existsSync(bundled) ? bundled : null;
  } catch {
    // app이 아직 ready 상태가 아닐 수 있음
    return null;
  }
}

/**
 * ADB 컨트롤러 클래스
 */
export class AdbController {
  private adbPath: string;
  private timeout: number;

  constructor(options: AdbOptions = {}) {
    // 우선순위: 명시적 옵션 → 환경변수 → 번들된 바이너리 → 시스템 PATH
    this.adbPath = options.adbPath || process.env.ADB_PATH || findBundledAdb() || 'adb';
    this.timeout = options.timeout || 30000; // 30초

    logger.info('[AdbController] ADB path resolved', { adbPath: this.adbPath });
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
   * Note: Uses separate ADB call without pipe to avoid sanitizeInput rejection
   */
  async getBatteryLevel(deviceId: string): Promise<number> {
    try {
      const output = await this.execute(deviceId, 'shell dumpsys battery');
      // Filter for level line in JavaScript instead of using shell pipe
      const match = output.match(/level:\s*(\d+)/);
      return match ? parseInt(match[1], 10) : -1;
    } catch {
      return -1;
    }
  }

  /**
   * 화면 상태 확인
   * Note: Uses separate ADB call without pipe to avoid sanitizeInput rejection
   */
  async isScreenOn(deviceId: string): Promise<boolean> {
    try {
      const output = await this.execute(deviceId, 'shell dumpsys display');
      // Filter for mScreenState in JavaScript instead of using shell pipe
      return output.includes('mScreenState=ON');
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
   * Note: Uses single quotes for localPath to pass sanitizeInput validation
   */
  async screenshot(deviceId: string, localPath: string): Promise<void> {
    const remotePath = '/sdcard/screenshot.png';
    
    await this.execute(deviceId, `shell screencap -p ${remotePath}`);
    // Use single quotes instead of double quotes to satisfy sanitizeInput
    await this.execute(deviceId, `pull ${remotePath} '${localPath}'`);
    await this.execute(deviceId, `shell rm ${remotePath}`);
  }

  /**
   * WiFi ADB 활성화
   * USB 연결된 디바이스를 TCP/IP 모드로 전환하고 WiFi IP로 연결
   *
   * @returns WiFi ADB 연결 정보 { ip, port } 또는 실패 시 null
   */
  async enableWifiAdb(serial: string, port: number = 5555): Promise<{ ip: string; port: number } | null> {
    try {
      // 1. TCP/IP 모드 활성화
      logger.info('Enabling WiFi ADB', { serial, port });
      await this.execute(serial, `tcpip ${port}`);

      // 잠시 대기 (TCP/IP 전환 시간)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. WiFi IP 주소 추출
      const ip = await this.getDeviceWifiIp(serial);
      if (!ip) {
        logger.warn('Could not determine device WiFi IP', { serial });
        return null;
      }

      // 3. WiFi 주소로 연결
      const connectAddr = `${ip}:${port}`;
      try {
        await this.execute('', `connect ${connectAddr}`);
        logger.info('WiFi ADB connected', { serial, address: connectAddr });
      } catch (err) {
        logger.warn('WiFi ADB connect attempt returned error (may still succeed)', {
          serial,
          address: connectAddr,
          error: (err as Error).message,
        });
      }

      return { ip, port };
    } catch (error) {
      logger.error('Failed to enable WiFi ADB', { serial, error });
      return null;
    }
  }

  /**
   * 디바이스 WiFi IP 주소 조회
   */
  async getDeviceWifiIp(serial: string): Promise<string | null> {
    try {
      const output = await this.execute(serial, 'shell ip route');
      // "... src 192.168.x.x ..." 패턴에서 IP 추출
      const match = output.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match) return match[1];

      // fallback: wlan0 인터페이스에서 추출
      const ifconfig = await this.execute(serial, 'shell ifconfig wlan0');
      const ipMatch = ifconfig.match(/inet\s+addr:(\d+\.\d+\.\d+\.\d+)/);
      return ipMatch ? ipMatch[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * WiFi ADB 재연결 (연결 끊김 시)
   */
  async reconnectWifiAdb(ip: string, port: number = 5555): Promise<boolean> {
    const address = `${ip}:${port}`;
    try {
      const result = await this.execute('', `connect ${address}`);
      const connected = result.includes('connected') || result.includes('already');
      if (connected) {
        logger.info('WiFi ADB reconnected', { address });
      } else {
        logger.warn('WiFi ADB reconnect unclear result', { address, result });
      }
      return connected;
    } catch (error) {
      logger.error('WiFi ADB reconnect failed', { address, error });
      return false;
    }
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
   * 모든 USB 디바이스에 WiFi ADB 활성화 (부팅 시 호출)
   *
   * @returns 성공한 디바이스 목록 [{serial, ip, port}]
   */
  async enableWifiAdbForAll(): Promise<Array<{ serial: string; ip: string; port: number }>> {
    const devices = await this.getConnectedDevices();
    const results: Array<{ serial: string; ip: string; port: number }> = [];

    for (const serial of devices) {
      // WiFi 주소 형식(ip:port) 디바이스는 스킵
      if (serial.includes(':')) continue;

      const result = await this.enableWifiAdb(serial);
      if (result) {
        results.push({ serial, ...result });
      }
    }

    logger.info(`WiFi ADB enabled for ${results.length}/${devices.length} devices`);
    return results;
  }

  /**
   * WiFi ADB 연결 상태 모니터링 + 자동 재연결
   *
   * @param knownDevices 이전에 연결 성공한 디바이스 목록
   * @returns 재연결 성공한 디바이스 수
   */
  async monitorAndReconnectWifiAdb(
    knownDevices: Array<{ serial: string; ip: string; port: number }>
  ): Promise<number> {
    const connectedDevices = await this.getConnectedDevices();
    let reconnected = 0;

    for (const device of knownDevices) {
      const wifiAddr = `${device.ip}:${device.port}`;

      // 이미 연결되어 있으면 스킵
      if (connectedDevices.includes(wifiAddr)) continue;

      // 재연결 시도
      logger.info('WiFi ADB disconnected, reconnecting', { device: wifiAddr });
      const success = await this.reconnectWifiAdb(device.ip, device.port);
      if (success) {
        reconnected++;
      }
    }

    return reconnected;
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
let storedOptions: AdbOptions | undefined = undefined;

function areOptionsEqual(a?: AdbOptions, b?: AdbOptions): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.adbPath === b.adbPath && a.timeout === b.timeout;
}

export function getAdbController(options?: AdbOptions): AdbController {
  // If options differ from stored options, recreate the singleton
  if (instance && options && !areOptionsEqual(options, storedOptions)) {
    logger.info('Recreating AdbController singleton due to options change', {
      oldOptions: storedOptions,
      newOptions: options,
    });
    instance = new AdbController(options);
    storedOptions = options;
  } else if (!instance) {
    instance = new AdbController(options);
    storedOptions = options;
  }
  return instance;
}

export default AdbController;
