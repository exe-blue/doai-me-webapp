/**
 * Device Manager
 * 
 * 연결된 Android 디바이스 관리
 */

import { EventEmitter } from 'events';
import { AdbController, AdbDevice, getAdbController } from './AdbController';
import { logger } from '../utils/logger';

/**
 * 디바이스 상태
 */
export type DeviceState = 'DISCONNECTED' | 'IDLE' | 'QUEUED' | 'RUNNING' | 'ERROR' | 'QUARANTINE';

/**
 * 관리되는 디바이스 정보
 */
export interface ManagedDevice {
  id: string;
  serial: string;
  state: DeviceState;
  model?: string;
  battery?: number;
  lastSeen: number;
  currentWorkflowId?: string;
  errorCount: number;
  lastError?: string;
}

/**
 * 디바이스 매니저 옵션
 */
interface DeviceManagerOptions {
  monitorIntervalMs?: number;
  batteryCheckIntervalMs?: number;
}

/**
 * 디바이스 매니저 클래스
 */
export class DeviceManager extends EventEmitter {
  private adb: AdbController;
  private devices: Map<string, ManagedDevice> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private batteryCheckInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  // 설정
  private readonly MONITOR_INTERVAL_MS: number;
  private readonly BATTERY_CHECK_INTERVAL_MS: number;

  constructor(options: DeviceManagerOptions = {}) {
    super();
    this.adb = getAdbController();
    this.MONITOR_INTERVAL_MS = options.monitorIntervalMs ?? 10000; // 10초
    this.BATTERY_CHECK_INTERVAL_MS = options.batteryCheckIntervalMs ?? 60000; // 1분
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing device manager');

    try {
      // ADB 버전 확인
      const adbVersion = await this.adb.getVersion();
      logger.info('ADB version', { version: adbVersion });

      // 초기 디바이스 스캔
      await this.scanDevices();

      this.initialized = true;
      logger.info('Device manager initialized', {
        deviceCount: this.devices.size,
      });
    } catch (error) {
      logger.error('Failed to initialize device manager', { error });
      throw error;
    }
  }

  /**
   * 모니터링 시작 (idempotent - safe to call multiple times)
   */
  startMonitoring(): void {
    // Guard: prevent duplicate intervals
    if (this.monitorInterval !== null || this.batteryCheckInterval !== null) {
      logger.warn('Device monitoring already started, skipping duplicate start');
      return;
    }

    logger.info('Starting device monitoring', {
      interval: this.MONITOR_INTERVAL_MS,
    });

    // 디바이스 스캔
    this.monitorInterval = setInterval(
      () => this.scanDevices(),
      this.MONITOR_INTERVAL_MS
    );

    // 배터리 체크
    this.batteryCheckInterval = setInterval(
      () => this.checkBatteryLevels(),
      this.BATTERY_CHECK_INTERVAL_MS
    );
  }

  /**
   * 모니터링 중지
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.batteryCheckInterval) {
      clearInterval(this.batteryCheckInterval);
      this.batteryCheckInterval = null;
    }

    logger.info('Device monitoring stopped');
  }

  /**
   * 디바이스 스캔
   */
  async scanDevices(): Promise<void> {
    try {
      const adbDevices = await this.adb.getDevicesInfo();
      const currentSerials = new Set<string>();

      // 새 디바이스 또는 업데이트
      for (const adbDevice of adbDevices) {
        if (adbDevice.state !== 'device') continue;

        currentSerials.add(adbDevice.serial);
        const existing = this.devices.get(adbDevice.serial);

        if (existing) {
          // 기존 디바이스 업데이트
          existing.lastSeen = Date.now();
          
          if (existing.state === 'DISCONNECTED') {
            existing.state = 'IDLE';
            existing.errorCount = 0;
            this.emit('device:reconnected', existing);
          }
        } else {
          // 새 디바이스
          const newDevice: ManagedDevice = {
            id: adbDevice.serial,
            serial: adbDevice.serial,
            state: 'IDLE',
            model: adbDevice.model,
            lastSeen: Date.now(),
            errorCount: 0,
          };

          this.devices.set(adbDevice.serial, newDevice);
          logger.info('New device connected', { device: newDevice });
          this.emit('device:connected', newDevice);
        }
      }

      // 연결 해제된 디바이스
      for (const [serial, device] of this.devices) {
        if (!currentSerials.has(serial) && device.state !== 'DISCONNECTED') {
          device.state = 'DISCONNECTED';
          logger.warn('Device disconnected', { serial });
          this.emit('device:disconnected', device);
        }
      }
    } catch (error) {
      logger.error('Device scan failed', { error });
    }
  }

  /**
   * 배터리 레벨 체크
   */
  private async checkBatteryLevels(): Promise<void> {
    for (const [serial, device] of this.devices) {
      if (device.state === 'DISCONNECTED') continue;

      try {
        const battery = await this.adb.getBatteryLevel(serial);
        device.battery = battery;

        // 배터리 부족 경고
        if (battery > 0 && battery < 20) {
          logger.warn('Low battery', { serial, battery });
          this.emit('device:lowBattery', { device, battery });
        }
      } catch {
        // 무시
      }
    }
  }

  /**
   * 연결된 디바이스 ID 목록
   */
  getConnectedDevices(): string[] {
    const connected: string[] = [];
    
    for (const [serial, device] of this.devices) {
      if (device.state !== 'DISCONNECTED') {
        connected.push(serial);
      }
    }

    return connected;
  }

  /**
   * 모든 디바이스 정보
   */
  getAllDevices(): ManagedDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * 특정 디바이스 정보
   */
  getDevice(serial: string): ManagedDevice | undefined {
    return this.devices.get(serial);
  }

  /**
   * 디바이스 상태 업데이트
   */
  updateState(serial: string, state: DeviceState, extra?: Partial<ManagedDevice>): void {
    const device = this.devices.get(serial);
    if (!device) return;

    device.state = state;
    device.lastSeen = Date.now();

    if (extra) {
      Object.assign(device, extra);
    }

    this.emit('device:stateChanged', device);
  }

  /**
   * IDLE 디바이스 목록
   */
  getIdleDevices(): ManagedDevice[] {
    const idle: ManagedDevice[] = [];

    for (const device of this.devices.values()) {
      if (device.state === 'IDLE') {
        idle.push(device);
      }
    }

    return idle;
  }

  /**
   * 모든 상태 조회
   */
  getAllStates(): Record<string, { state: DeviceState; lastSeen: number }> {
    const states: Record<string, { state: DeviceState; lastSeen: number }> = {};

    for (const [serial, device] of this.devices) {
      states[serial] = {
        state: device.state,
        lastSeen: device.lastSeen,
      };
    }

    return states;
  }

  /**
   * ADB 컨트롤러 반환
   */
  getAdb(): AdbController {
    return this.adb;
  }
}

// 싱글톤
let instance: DeviceManager | null = null;

export function getDeviceManager(options?: DeviceManagerOptions): DeviceManager {
  if (!instance) {
    instance = new DeviceManager(options);
  }
  return instance;
}

export default DeviceManager;
