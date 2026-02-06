// ============================================
// DoAi.Me Worker Core - ADB Controller
// @devicefarmer/adbkit 기반 ADB 제어
// ============================================

import Adb from '@devicefarmer/adbkit';
import type { Client, Device } from '@devicefarmer/adbkit';
import { Readable } from 'stream';
import { Logger, defaultLogger } from './Logger';

/**
 * ADB 디바이스 정보 인터페이스
 */
export interface AdbDeviceInfo {
  /** ADB 시리얼 번호 */
  id: string;
  /** 디바이스 타입 (device, emulator, offline 등) */
  type: string;
}

/**
 * 디바이스 트래킹 이벤트 타입
 */
export type DeviceTrackEvent = 'add' | 'remove' | 'change' | 'end' | 'error';

/**
 * 디바이스 트래킹 콜백 타입
 */
export type DeviceTrackCallback = (device: AdbDeviceInfo) => void;

/**
 * 파일 전송 진행 콜백 타입
 */
export type TransferProgressCallback = (stats: TransferStats) => void;

/**
 * 파일 전송 통계 인터페이스
 */
export interface TransferStats {
  /** 전송된 바이트 수 */
  bytesTransferred: number;
}

/**
 * ADB Controller 설정 인터페이스
 */
export interface AdbControllerOptions {
  /** ADB 서버 호스트 (기본값: 'localhost') */
  host?: string;
  /** ADB 서버 포트 (기본값: 5037) */
  port?: number;
  /** Logger 인스턴스 */
  logger?: Logger;
}

/**
 * ADB Controller 클래스
 * @devicefarmer/adbkit를 사용한 ADB 디바이스 제어
 * 
 * @example
 * ```typescript
 * const adb = new AdbController();
 * 
 * // 디바이스 목록 조회
 * const devices = await adb.listDevices();
 * 
 * // 디바이스 트래킹
 * adb.trackDevices({
 *   onAdd: (device) => console.log('Connected:', device.id),
 *   onRemove: (device) => console.log('Disconnected:', device.id),
 * });
 * 
 * // 쉘 명령 실행
 * const output = await adb.executeShell('device-serial', 'pm list packages');
 * ```
 */
export class AdbController {
  private client: Client;
  private logger: Logger;
  private tracker: Awaited<ReturnType<Client['trackDevices']>> | null = null;

  constructor(options: AdbControllerOptions = {}) {
    this.client = Adb.createClient({
      host: options.host ?? 'localhost',
      port: options.port ?? 5037,
    });
    this.logger = options.logger ?? defaultLogger.child('AdbController');
  }

  /**
   * ADB 클라이언트 인스턴스 반환
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * 연결된 디바이스 목록 조회
   * @returns 디바이스 정보 배열
   */
  async listDevices(): Promise<AdbDeviceInfo[]> {
    try {
      const devices: Device[] = await this.client.listDevices();
      this.logger.debug('Listed devices', { count: devices.length });
      
      return devices.map((device) => ({
        id: device.id,
        type: device.type,
      }));
    } catch (error) {
      this.logger.errorWithStack('Failed to list devices', error as Error);
      throw error;
    }
  }

  /**
   * 디바이스 연결/해제 실시간 트래킹
   * @param callbacks 이벤트 콜백 함수들
   * @returns 트래킹 중지 함수
   * 
   * @example
   * ```typescript
   * const stopTracking = await adb.trackDevices({
   *   onAdd: (device) => console.log('Added:', device.id),
   *   onRemove: (device) => console.log('Removed:', device.id),
   *   onChange: (device) => console.log('Changed:', device.id),
   *   onError: (error) => console.error('Tracker error:', error),
   * });
   * 
   * // 트래킹 중지
   * stopTracking();
   * ```
   */
  async trackDevices(callbacks: {
    onAdd?: DeviceTrackCallback;
    onRemove?: DeviceTrackCallback;
    onChange?: DeviceTrackCallback;
    onError?: (error: Error) => void;
    onEnd?: () => void;
  }): Promise<() => void> {
    try {
      this.tracker = await this.client.trackDevices();
      
      this.tracker.on('add', (device: Device) => {
        const deviceInfo: AdbDeviceInfo = { id: device.id, type: device.type };
        this.logger.info('Device added', { deviceId: device.id, type: device.type });
        callbacks.onAdd?.(deviceInfo);
      });

      this.tracker.on('remove', (device: Device) => {
        const deviceInfo: AdbDeviceInfo = { id: device.id, type: device.type };
        this.logger.info('Device removed', { deviceId: device.id });
        callbacks.onRemove?.(deviceInfo);
      });

      this.tracker.on('change', (device: Device) => {
        const deviceInfo: AdbDeviceInfo = { id: device.id, type: device.type };
        this.logger.debug('Device changed', { deviceId: device.id, type: device.type });
        callbacks.onChange?.(deviceInfo);
      });

      this.tracker.on('end', () => {
        this.logger.warn('Device tracker ended');
        callbacks.onEnd?.();
      });

      this.tracker.on('error', (error: Error) => {
        this.logger.errorWithStack('Device tracker error', error);
        callbacks.onError?.(error);
      });

      this.logger.info('Device tracking started');

      // 트래킹 중지 함수 반환
      return () => {
        this.stopTracking();
      };
    } catch (error) {
      this.logger.errorWithStack('Failed to start device tracking', error as Error);
      throw error;
    }
  }

  /**
   * 디바이스 트래킹 중지
   */
  stopTracking(): void {
    if (this.tracker) {
      this.tracker.end();
      this.tracker = null;
      this.logger.info('Device tracking stopped');
    }
  }

  /**
   * APK 설치
   * @param serial 디바이스 시리얼 번호
   * @param apkPath APK 파일 경로
   */
  async install(serial: string, apkPath: string): Promise<void> {
    try {
      this.logger.info('Installing APK', { serial, apkPath });
      await this.client.getDevice(serial).install(apkPath);
      this.logger.info('APK installed successfully', { serial, apkPath });
    } catch (error) {
      this.logger.errorWithStack('Failed to install APK', error as Error, { serial, apkPath });
      throw error;
    }
  }

  /**
   * APK 제거
   * @param serial 디바이스 시리얼 번호
   * @param packageName 패키지 이름
   */
  async uninstall(serial: string, packageName: string): Promise<void> {
    try {
      this.logger.info('Uninstalling package', { serial, packageName });
      await this.client.getDevice(serial).uninstall(packageName);
      this.logger.info('Package uninstalled successfully', { serial, packageName });
    } catch (error) {
      this.logger.errorWithStack('Failed to uninstall package', error as Error, { serial, packageName });
      throw error;
    }
  }

  /**
   * 파일을 디바이스로 전송 (push)
   * @param serial 디바이스 시리얼 번호
   * @param localPath 로컬 파일 경로
   * @param remotePath 디바이스 내 대상 경로
   * @param onProgress 진행 콜백 (선택)
   */
  async push(
    serial: string,
    localPath: string,
    remotePath: string,
    onProgress?: TransferProgressCallback
  ): Promise<void> {
    try {
      this.logger.info('Pushing file to device', { serial, localPath, remotePath });
      
      const transfer = await this.client.getDevice(serial).push(localPath, remotePath);
      
      return new Promise((resolve, reject) => {
        if (onProgress) {
          transfer.on('progress', (stats: { bytesTransferred: number }) => {
            onProgress({ bytesTransferred: stats.bytesTransferred });
          });
        }

        transfer.on('end', () => {
          this.logger.info('File push completed', { serial, remotePath });
          resolve();
        });

        transfer.on('error', (error: Error) => {
          this.logger.errorWithStack('File push failed', error, { serial, remotePath });
          reject(error);
        });
      });
    } catch (error) {
      this.logger.errorWithStack('Failed to push file', error as Error, { serial, localPath, remotePath });
      throw error;
    }
  }

  /**
   * 디바이스에서 파일 가져오기 (pull)
   * @param serial 디바이스 시리얼 번호
   * @param remotePath 디바이스 내 파일 경로
   * @param localPath 로컬 저장 경로
   * @param onProgress 진행 콜백 (선택)
   */
  async pull(
    serial: string,
    remotePath: string,
    localPath: string,
    onProgress?: TransferProgressCallback
  ): Promise<void> {
    try {
      this.logger.info('Pulling file from device', { serial, remotePath, localPath });
      
      const transfer = await this.client.getDevice(serial).pull(remotePath);
      const fs = await import('fs');
      const writeStream = fs.createWriteStream(localPath);
      
      return new Promise((resolve, reject) => {
        let bytesTransferred = 0;
        
        transfer.on('data', (chunk: Buffer) => {
          bytesTransferred += chunk.length;
          if (onProgress) {
            onProgress({ bytesTransferred });
          }
        });

        transfer.on('end', () => {
          writeStream.end();
          this.logger.info('File pull completed', { serial, localPath });
          resolve();
        });

        transfer.on('error', (error: Error) => {
          writeStream.end();
          this.logger.errorWithStack('File pull failed', error, { serial, remotePath });
          reject(error);
        });

        transfer.pipe(writeStream);
      });
    } catch (error) {
      this.logger.errorWithStack('Failed to pull file', error as Error, { serial, remotePath, localPath });
      throw error;
    }
  }

  /**
   * 쉘 명령 실행
   * @param serial 디바이스 시리얼 번호
   * @param command 실행할 쉘 명령
   * @returns 명령 실행 결과 (stdout)
   */
  async executeShell(serial: string, command: string): Promise<string> {
    try {
      this.logger.debug('Executing shell command', { serial, command });
      
      const stream: Readable = await this.client.getDevice(serial).shell(command);
      
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on('end', () => {
          const output = Buffer.concat(chunks).toString('utf-8').trim();
          this.logger.debug('Shell command completed', { serial, outputLength: output.length });
          resolve(output);
        });

        stream.on('error', (error: Error) => {
          this.logger.errorWithStack('Shell command failed', error, { serial, command });
          reject(error);
        });
      });
    } catch (error) {
      this.logger.errorWithStack('Failed to execute shell command', error as Error, { serial, command });
      throw error;
    }
  }

  /**
   * 스크린샷 캡처
   * @param serial 디바이스 시리얼 번호
   * @returns PNG 이미지 Buffer
   */
  async screenshot(serial: string): Promise<Buffer> {
    try {
      this.logger.debug('Taking screenshot', { serial });
      
      const stream: Readable = await this.client.getDevice(serial).screencap();
      
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          this.logger.debug('Screenshot captured', { serial, size: buffer.length });
          resolve(buffer);
        });

        stream.on('error', (error: Error) => {
          this.logger.errorWithStack('Screenshot failed', error, { serial });
          reject(error);
        });
      });
    } catch (error) {
      this.logger.errorWithStack('Failed to capture screenshot', error as Error, { serial });
      throw error;
    }
  }

  /**
   * 디바이스 속성 조회
   * @param serial 디바이스 시리얼 번호
   * @returns 디바이스 속성 맵
   */
  async getProperties(serial: string): Promise<Map<string, string>> {
    try {
      this.logger.debug('Getting device properties', { serial });
      const properties = await this.client.getDevice(serial).getProperties();
      this.logger.debug('Device properties retrieved', { serial, count: properties.size });
      return properties;
    } catch (error) {
      this.logger.errorWithStack('Failed to get device properties', error as Error, { serial });
      throw error;
    }
  }

  /**
   * 디바이스 재부팅
   * @param serial 디바이스 시리얼 번호
   */
  async reboot(serial: string): Promise<void> {
    try {
      this.logger.info('Rebooting device', { serial });
      await this.client.getDevice(serial).reboot();
      this.logger.info('Device reboot initiated', { serial });
    } catch (error) {
      this.logger.errorWithStack('Failed to reboot device', error as Error, { serial });
      throw error;
    }
  }

  /**
   * TCP 포트 포워딩
   * @param serial 디바이스 시리얼 번호
   * @param localPort 로컬 포트
   * @param remotePort 디바이스 포트
   */
  async forward(serial: string, localPort: number, remotePort: number): Promise<void> {
    try {
      this.logger.debug('Setting up port forward', { serial, localPort, remotePort });
      await this.client.getDevice(serial).forward(`tcp:${localPort}`, `tcp:${remotePort}`);
      this.logger.debug('Port forward established', { serial, localPort, remotePort });
    } catch (error) {
      this.logger.errorWithStack('Failed to forward port', error as Error, { serial, localPort, remotePort });
      throw error;
    }
  }

  /**
   * 디바이스가 온라인 상태인지 확인
   * @param serial 디바이스 시리얼 번호
   * @returns 온라인 여부
   */
  async isOnline(serial: string): Promise<boolean> {
    try {
      const devices = await this.listDevices();
      const device = devices.find((d) => d.id === serial);
      return device?.type === 'device';
    } catch {
      return false;
    }
  }
}

export default AdbController;
