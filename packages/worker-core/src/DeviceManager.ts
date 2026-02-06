// ============================================
// DoAi.Me Worker Core - Device Manager
// EventEmitter 기반 디바이스 상태 관리
// ============================================

import { EventEmitter } from 'events';
import { AdbController, AdbDeviceInfo } from './AdbController';
import { Logger, defaultLogger } from './Logger';

/**
 * 관리 대상 디바이스 상태
 */
export type ManagedDeviceState = 
  | 'idle'      // 대기 중
  | 'busy'      // 작업 수행 중
  | 'error'     // 오류 상태
  | 'offline'   // 연결 끊김
  | 'maintenance'; // 유지보수 중

/**
 * 관리 대상 디바이스 정보
 */
export interface ManagedDevice {
  /** ADB 시리얼 번호 */
  serial: string;
  /** 디바이스 상태 */
  state: ManagedDeviceState;
  /** ADB 연결 타입 */
  type: string;
  /** 최초 연결 시간 */
  connectedAt: Date;
  /** 마지막 상태 변경 시간 */
  lastStateChange: Date;
  /** 현재 실행 중인 작업 ID (있는 경우) */
  currentTaskId?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * DeviceManager 이벤트 타입 정의
 */
export interface DeviceManagerEvents {
  'device:connected': (device: ManagedDevice) => void;
  'device:disconnected': (device: ManagedDevice) => void;
  'device:stateChanged': (device: ManagedDevice, previousState: ManagedDeviceState) => void;
  'error': (error: Error) => void;
}

/**
 * DeviceManager 설정 인터페이스
 */
export interface DeviceManagerOptions {
  /** AdbController 인스턴스 (선택, 없으면 새로 생성) */
  adbController?: AdbController;
  /** Logger 인스턴스 */
  logger?: Logger;
  /** 자동 트래킹 시작 여부 (기본값: true) */
  autoStartTracking?: boolean;
  /** 새 디바이스 연결 시 초기 상태 (기본값: 'idle') */
  initialState?: ManagedDeviceState;
}

/**
 * 디바이스 매니저 클래스
 * AdbController를 사용하여 디바이스 연결/해제를 추적하고
 * 상태 관리 및 이벤트 발생을 담당
 * 
 * @example
 * ```typescript
 * const deviceManager = new DeviceManager();
 * 
 * deviceManager.on('device:connected', (device) => {
 *   console.log('Device connected:', device.serial);
 * });
 * 
 * deviceManager.on('device:disconnected', (device) => {
 *   console.log('Device disconnected:', device.serial);
 * });
 * 
 * deviceManager.on('device:stateChanged', (device, prevState) => {
 *   console.log(`Device ${device.serial} changed from ${prevState} to ${device.state}`);
 * });
 * 
 * await deviceManager.startTracking();
 * ```
 */
export class DeviceManager extends EventEmitter {
  private devices: Map<string, ManagedDevice> = new Map();
  private adbController: AdbController;
  private logger: Logger;
  private initialState: ManagedDeviceState;
  private isTracking: boolean = false;
  private stopTrackingFn: (() => void) | null = null;

  constructor(options: DeviceManagerOptions = {}) {
    super();
    this.adbController = options.adbController ?? new AdbController();
    this.logger = options.logger ?? defaultLogger.child('DeviceManager');
    this.initialState = options.initialState ?? 'idle';

    if (options.autoStartTracking !== false) {
      // 비동기로 트래킹 시작 (생성자에서 await 불가)
      this.startTracking().catch((error) => {
        this.logger.errorWithStack('Failed to auto-start tracking', error);
        this.emit('error', error);
      });
    }
  }

  /**
   * 타입 안전한 이벤트 리스너 등록
   */
  on<K extends keyof DeviceManagerEvents>(
    event: K,
    listener: DeviceManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  /**
   * 타입 안전한 이벤트 발생
   */
  emit<K extends keyof DeviceManagerEvents>(
    event: K,
    ...args: Parameters<DeviceManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * 디바이스 트래킹 시작
   * 이미 연결된 디바이스도 자동으로 추가
   */
  async startTracking(): Promise<void> {
    if (this.isTracking) {
      this.logger.warn('Device tracking already started');
      return;
    }

    try {
      // 현재 연결된 디바이스 먼저 추가
      const existingDevices = await this.adbController.listDevices();
      for (const device of existingDevices) {
        if (device.type === 'device') {
          this.addDevice(device);
        }
      }

      // 트래킹 시작
      this.stopTrackingFn = await this.adbController.trackDevices({
        onAdd: (device) => this.handleDeviceAdd(device),
        onRemove: (device) => this.handleDeviceRemove(device),
        onChange: (device) => this.handleDeviceChange(device),
        onError: (error) => {
          this.logger.errorWithStack('Tracking error', error);
          this.emit('error', error);
        },
        onEnd: () => {
          this.logger.warn('Device tracking ended unexpectedly');
          this.isTracking = false;
        },
      });

      this.isTracking = true;
      this.logger.info('Device tracking started', { initialDevices: this.devices.size });
    } catch (error) {
      this.logger.errorWithStack('Failed to start device tracking', error as Error);
      throw error;
    }
  }

  /**
   * 디바이스 트래킹 중지
   */
  stopTracking(): void {
    if (this.stopTrackingFn) {
      this.stopTrackingFn();
      this.stopTrackingFn = null;
    }
    this.isTracking = false;
    this.logger.info('Device tracking stopped');
  }

  /**
   * 디바이스 추가 처리
   */
  private addDevice(deviceInfo: AdbDeviceInfo): ManagedDevice {
    const now = new Date();
    const managedDevice: ManagedDevice = {
      serial: deviceInfo.id,
      state: this.initialState,
      type: deviceInfo.type,
      connectedAt: now,
      lastStateChange: now,
    };

    this.devices.set(deviceInfo.id, managedDevice);
    return managedDevice;
  }

  /**
   * 디바이스 연결 이벤트 핸들러
   */
  private handleDeviceAdd(device: AdbDeviceInfo): void {
    // 이미 존재하면 무시 (offline에서 online으로 변경된 경우 등)
    if (this.devices.has(device.id)) {
      const existing = this.devices.get(device.id)!;
      if (existing.state === 'offline') {
        this.setDeviceState(device.id, this.initialState);
      }
      return;
    }

    if (device.type !== 'device') {
      this.logger.debug('Ignoring non-device', { id: device.id, type: device.type });
      return;
    }

    const managedDevice = this.addDevice(device);
    this.logger.info('Device connected', { serial: device.id });
    this.emit('device:connected', managedDevice);
  }

  /**
   * 디바이스 연결 해제 이벤트 핸들러
   */
  private handleDeviceRemove(device: AdbDeviceInfo): void {
    const managedDevice = this.devices.get(device.id);
    if (!managedDevice) {
      return;
    }

    // 상태를 offline으로 변경
    const previousState = managedDevice.state;
    managedDevice.state = 'offline';
    managedDevice.lastStateChange = new Date();

    this.logger.info('Device disconnected', { serial: device.id });
    this.emit('device:disconnected', managedDevice);
    
    if (previousState !== 'offline') {
      this.emit('device:stateChanged', managedDevice, previousState);
    }
  }

  /**
   * 디바이스 상태 변경 이벤트 핸들러
   */
  private handleDeviceChange(device: AdbDeviceInfo): void {
    const managedDevice = this.devices.get(device.id);
    if (!managedDevice) {
      // 새 디바이스로 처리
      if (device.type === 'device') {
        this.handleDeviceAdd(device);
      }
      return;
    }

    // 타입이 변경된 경우 (예: offline -> device)
    if (managedDevice.type !== device.type) {
      managedDevice.type = device.type;
      
      if (device.type === 'device' && managedDevice.state === 'offline') {
        this.setDeviceState(device.id, this.initialState);
      } else if (device.type !== 'device') {
        this.setDeviceState(device.id, 'offline');
      }
    }
  }

  /**
   * 모든 관리 디바이스 목록 반환
   * @returns 디바이스 배열
   */
  getDevices(): ManagedDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * 특정 상태의 디바이스 목록 반환
   * @param state 필터링할 상태
   * @returns 해당 상태의 디바이스 배열
   */
  getDevicesByState(state: ManagedDeviceState): ManagedDevice[] {
    return this.getDevices().filter((d) => d.state === state);
  }

  /**
   * 온라인 (offline이 아닌) 디바이스 목록 반환
   */
  getOnlineDevices(): ManagedDevice[] {
    return this.getDevices().filter((d) => d.state !== 'offline');
  }

  /**
   * 유휴 상태 디바이스 목록 반환
   */
  getIdleDevices(): ManagedDevice[] {
    return this.getDevicesByState('idle');
  }

  /**
   * 특정 디바이스 조회
   * @param serial ADB 시리얼 번호
   * @returns 디바이스 정보 또는 undefined
   */
  getDevice(serial: string): ManagedDevice | undefined {
    return this.devices.get(serial);
  }

  /**
   * 디바이스 존재 여부 확인
   * @param serial ADB 시리얼 번호
   */
  hasDevice(serial: string): boolean {
    return this.devices.has(serial);
  }

  /**
   * 관리 디바이스 수 반환
   */
  get deviceCount(): number {
    return this.devices.size;
  }

  /**
   * 디바이스 상태 변경
   * @param serial ADB 시리얼 번호
   * @param newState 새로운 상태
   * @param taskId 현재 작업 ID (busy 상태일 때)
   * @returns 변경 성공 여부
   */
  setDeviceState(
    serial: string,
    newState: ManagedDeviceState,
    taskId?: string
  ): boolean {
    const device = this.devices.get(serial);
    if (!device) {
      this.logger.warn('Cannot set state: device not found', { serial });
      return false;
    }

    const previousState = device.state;
    if (previousState === newState) {
      return true; // 동일한 상태, 무시
    }

    device.state = newState;
    device.lastStateChange = new Date();
    
    if (taskId !== undefined) {
      device.currentTaskId = taskId;
    } else if (newState !== 'busy') {
      device.currentTaskId = undefined;
    }

    this.logger.info('Device state changed', {
      serial,
      previousState,
      newState,
      taskId: device.currentTaskId,
    });

    this.emit('device:stateChanged', device, previousState);
    return true;
  }

  /**
   * 디바이스 메타데이터 설정
   * @param serial ADB 시리얼 번호
   * @param metadata 메타데이터 객체
   */
  setDeviceMetadata(serial: string, metadata: Record<string, unknown>): boolean {
    const device = this.devices.get(serial);
    if (!device) {
      return false;
    }

    device.metadata = {
      ...device.metadata,
      ...metadata,
    };
    return true;
  }

  /**
   * 디바이스 제거 (수동 제거)
   * @param serial ADB 시리얼 번호
   */
  removeDevice(serial: string): boolean {
    const device = this.devices.get(serial);
    if (!device) {
      return false;
    }

    this.devices.delete(serial);
    this.logger.info('Device manually removed', { serial });
    this.emit('device:disconnected', device);
    return true;
  }

  /**
   * AdbController 인스턴스 반환
   */
  getAdbController(): AdbController {
    return this.adbController;
  }

  /**
   * 트래킹 상태 확인
   */
  get isTrackingActive(): boolean {
    return this.isTracking;
  }

  /**
   * 리소스 정리 및 종료
   */
  dispose(): void {
    this.stopTracking();
    this.devices.clear();
    this.removeAllListeners();
    this.logger.info('DeviceManager disposed');
  }
}

export default DeviceManager;
