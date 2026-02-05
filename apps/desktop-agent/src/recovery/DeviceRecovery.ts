/**
 * Device Recovery
 * 
 * 디바이스 연결 상태 모니터링 및 자동 재연결
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import type { DeviceState } from '../device/DeviceManager';

/**
 * 디바이스 정보
 */
interface DeviceInfo {
  id: string;
  state: DeviceState;
  lastSeen: number;
  reconnectAttempts: number;
  lastError?: string;
  metadata?: Record<string, unknown>;
}

/**
 * ADB 컨트롤러 인터페이스
 */
interface AdbController {
  getConnectedDevices(): Promise<string[]>;
  reconnect(deviceId: string): Promise<void>;
  execute(deviceId: string, command: string): Promise<string>;
}

/**
 * 상태 리포터 인터페이스
 */
interface StateReporter {
  updateDeviceState(deviceId: string, state: DeviceState, extra?: Record<string, unknown>): Promise<void>;
}

/**
 * 복구 옵션
 */
interface DeviceRecoveryOptions {
  maxReconnectAttempts?: number;
  checkIntervalMs?: number;
  disconnectThresholdMs?: number;
  enableAutoRecovery?: boolean;
}

/**
 * 디바이스 복구 관리자
 */
export class DeviceRecovery extends EventEmitter {
  private adb: AdbController;
  private stateReporter: StateReporter | null;
  private devices: Map<string, DeviceInfo> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private pendingTimeouts: Set<NodeJS.Timeout> = new Set();  // Track pending timeouts
  private isCheckingDevices: boolean = false;  // Mutex guard for checkDevices

  // 설정
  private readonly MAX_RECONNECT_ATTEMPTS: number;
  private readonly CHECK_INTERVAL_MS: number;
  private readonly DISCONNECT_THRESHOLD_MS: number;
  private readonly ENABLE_AUTO_RECOVERY: boolean;

  constructor(
    adb: AdbController,
    stateReporter: StateReporter | null = null,
    options: DeviceRecoveryOptions = {}
  ) {
    super();
    this.adb = adb;
    this.stateReporter = stateReporter;

    // 옵션 설정
    this.MAX_RECONNECT_ATTEMPTS = options.maxReconnectAttempts ?? 3;
    this.CHECK_INTERVAL_MS = options.checkIntervalMs ?? 30000; // 30초
    this.DISCONNECT_THRESHOLD_MS = options.disconnectThresholdMs ?? 60000; // 60초
    this.ENABLE_AUTO_RECOVERY = options.enableAutoRecovery ?? true;
  }

  /**
   * 모니터링 시작
   */
  start(): void {
    logger.info('Starting device recovery monitor', {
      checkInterval: this.CHECK_INTERVAL_MS,
      maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
    });

    // 즉시 1회 실행
    this.checkDevices();

    // 주기적 체크
    this.checkInterval = setInterval(
      () => this.checkDevices(),
      this.CHECK_INTERVAL_MS
    );
  }

  /**
   * 모니터링 중지
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // Cancel all pending timeouts to prevent memory leaks and stale callbacks
    for (const timeout of this.pendingTimeouts) {
      clearTimeout(timeout);
    }
    this.pendingTimeouts.clear();
    
    logger.info('Device recovery monitor stopped', {
      clearedTimeouts: this.pendingTimeouts.size,
    });
  }

  /**
   * 디바이스 등록
   */
  registerDevice(deviceId: string, initialState: DeviceState = 'IDLE'): void {
    const existing = this.devices.get(deviceId);
    
    if (existing) {
      // 기존 디바이스 업데이트
      existing.lastSeen = Date.now();
      existing.state = initialState;
      existing.reconnectAttempts = 0;
    } else {
      // 새 디바이스 등록
      this.devices.set(deviceId, {
        id: deviceId,
        state: initialState,
        lastSeen: Date.now(),
        reconnectAttempts: 0,
      });
      logger.info('Device registered', { deviceId, state: initialState });
    }

    this.emit('device:registered', deviceId);
  }

  /**
   * 디바이스 등록 해제
   */
  unregisterDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    logger.info('Device unregistered', { deviceId });
    this.emit('device:unregistered', deviceId);
  }

  /**
   * 디바이스 하트비트 업데이트
   */
  updateHeartbeat(deviceId: string, state?: DeviceState): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
      device.reconnectAttempts = 0;
      if (state) {
        device.state = state;
      }
    }
  }

  /**
   * 디바이스 상태 업데이트
   */
  updateState(deviceId: string, state: DeviceState, extra?: Record<string, unknown>): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.state = state;
      device.lastSeen = Date.now();
      if (extra) {
        device.metadata = { ...device.metadata, ...extra };
      }
    }
  }

  /**
   * 디바이스 상태 조회
   */
  getDeviceState(deviceId: string): DeviceInfo | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * 모든 디바이스 상태 조회
   */
  getAllDevices(): Map<string, DeviceInfo> {
    return new Map(this.devices);
  }

  /**
   * 주기적 디바이스 체크 (with mutex to prevent reentrancy)
   */
  private async checkDevices(): Promise<void> {
    // Guard against concurrent execution
    if (this.isCheckingDevices) {
      logger.debug('checkDevices already in progress, skipping');
      return;
    }
    
    this.isCheckingDevices = true;
    
    try {
      // ADB로 현재 연결된 디바이스 목록
      const connectedDevices = await this.adb.getConnectedDevices();
      const connectedSet = new Set(connectedDevices);

      for (const [deviceId, info] of this.devices) {
        const isConnected = connectedSet.has(deviceId);
        const timeSinceLastSeen = Date.now() - info.lastSeen;

        if (!isConnected && info.state !== 'DISCONNECTED') {
          // 연결 끊김 감지
          await this.handleDisconnect(info);
        } else if (isConnected && info.state === 'DISCONNECTED') {
          // 재연결 감지
          await this.handleReconnect(info);
        } else if (isConnected && timeSinceLastSeen > this.DISCONNECT_THRESHOLD_MS) {
          // 연결은 되어있지만 응답 없음
          logger.warn('Device connected but not responding', {
            deviceId,
            timeSinceLastSeen,
          });
          
          if (this.ENABLE_AUTO_RECOVERY) {
            await this.attemptRecovery(info);
          }
        }
      }

      // 새로 연결된 디바이스 감지
      for (const deviceId of connectedDevices) {
        if (!this.devices.has(deviceId)) {
          logger.info('New device detected', { deviceId });
          this.registerDevice(deviceId, 'IDLE');
          this.emit('device:new', deviceId);
        }
      }

    } catch (error) {
      logger.error('Device check failed', { error: (error as Error).message });
    } finally {
      this.isCheckingDevices = false;
    }
  }

  /**
   * 연결 끊김 처리
   */
  private async handleDisconnect(device: DeviceInfo): Promise<void> {
    logger.warn('Device disconnected', { deviceId: device.id });

    if (device.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      // 재연결 시도
      device.reconnectAttempts++;
      logger.info('Attempting reconnect', {
        deviceId: device.id,
        attempt: device.reconnectAttempts,
        maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
      });

      try {
        await this.adb.reconnect(device.id);
        
        // 5초 후 재확인 (track the timeout for cleanup)
        const timeout = setTimeout(() => {
          this.pendingTimeouts.delete(timeout);
          this.checkSingleDevice(device.id);
        }, 5000);
        this.pendingTimeouts.add(timeout);
        
      } catch (error) {
        logger.error('Reconnect failed', {
          deviceId: device.id,
          error: (error as Error).message,
        });
        device.lastError = (error as Error).message;
      }
    } else {
      // 최대 시도 초과 → DISCONNECTED 확정
      device.state = 'DISCONNECTED';
      
      if (this.stateReporter) {
        await this.stateReporter.updateDeviceState(device.id, 'DISCONNECTED', {
          lastError: device.lastError,
          disconnectedAt: new Date().toISOString(),
        });
      }
      
      this.emit('device:disconnected', device.id);
      
      logger.error('Device marked as disconnected after max attempts', {
        deviceId: device.id,
        attempts: device.reconnectAttempts,
      });
    }
  }

  /**
   * 재연결 처리
   */
  private async handleReconnect(device: DeviceInfo): Promise<void> {
    logger.info('Device reconnected', { deviceId: device.id });

    device.state = 'IDLE';
    device.reconnectAttempts = 0;
    device.lastSeen = Date.now();
    device.lastError = undefined;

    if (this.stateReporter) {
      await this.stateReporter.updateDeviceState(device.id, 'IDLE', {
        reconnectedAt: new Date().toISOString(),
      });
    }

    this.emit('device:reconnected', device.id);
  }

  /**
   * 복구 시도
   * @returns true if recovery succeeded, false otherwise
   */
  private async attemptRecovery(device: DeviceInfo): Promise<boolean> {
    logger.info('Attempting device recovery', { deviceId: device.id });

    try {
      // USB 재연결 시도
      await this.adb.execute(device.id, 'reconnect');
      
      // 화면 켜기 시도
      await this.adb.execute(device.id, 'shell input keyevent KEYCODE_WAKEUP');

      device.lastSeen = Date.now();
      logger.info('Recovery attempt completed', { deviceId: device.id });
      
      this.emit('device:recovered', device.id);
      return true;
      
    } catch (error) {
      logger.error('Recovery attempt failed', {
        deviceId: device.id,
        error: (error as Error).message,
      });
      device.lastError = (error as Error).message;
      this.emit('device:recovery-failed', device.id, error);
      return false;
    }
  }

  /**
   * 단일 디바이스 체크
   */
  private async checkSingleDevice(deviceId: string): Promise<void> {
    try {
      const connectedDevices = await this.adb.getConnectedDevices();
      const device = this.devices.get(deviceId);

      if (!device) return;

      if (connectedDevices.includes(deviceId)) {
        await this.handleReconnect(device);
      } else if (device.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        await this.handleDisconnect(device);
      }
    } catch (error) {
      logger.error('Single device check failed', {
        deviceId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * 수동 복구 시도
   */
  async manualRecovery(deviceId: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device) {
      logger.warn('Device not found for manual recovery', { deviceId });
      return false;
    }

    // Return the actual success status from attemptRecovery
    return await this.attemptRecovery(device);
  }

  /**
   * 모든 디바이스 재연결 시도
   */
  async reconnectAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [deviceId, device] of this.devices) {
      if (device.state === 'DISCONNECTED') {
        try {
          await this.adb.reconnect(deviceId);
          results.set(deviceId, true);
        } catch {
          results.set(deviceId, false);
        }
      }
    }

    return results;
  }
}

export default DeviceRecovery;
