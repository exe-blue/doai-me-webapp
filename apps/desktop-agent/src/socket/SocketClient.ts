/**
 * Socket.IO 클라이언트 (Desktop Agent)
 * 
 * Backend와의 Socket.IO 통신 관리
 * - 자동 재연결
 * - 이벤트 핸들러 등록
 * - 상태 보고
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { DeviceManager, ManagedDevice } from '../device/DeviceManager';
import { WorkflowRunner } from '../workflow/WorkflowRunner';

// ============================================
// 타입 정의
// ============================================

export interface SocketClientConfig {
  serverUrl: string;
  nodeId: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  statusReportInterval: number;
}

// 서버 → 에이전트 이벤트
export interface ExecuteWorkflowEvent {
  job_id: string;
  workflow_id: string;
  workflow: WorkflowDefinition;
  device_ids: string[];
  params: Record<string, unknown>;
}

export interface CancelWorkflowEvent {
  job_id: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  timeout: number;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  action: 'autox' | 'adb' | 'system' | 'wait' | 'condition';
  script?: string;
  command?: string;
  timeout: number;
  retry: { attempts: number; delay: number; backoff: string };
  onError: 'fail' | 'skip' | 'goto';
  nextOnError?: string;
}

// 에이전트 → 서버 이벤트
export interface WorkflowProgressEvent {
  job_id: string;
  device_id: string;
  current_step: string;
  progress: number;
  message?: string;
}

export interface WorkflowCompleteEvent {
  job_id: string;
  device_id: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface WorkflowErrorEvent {
  job_id: string;
  device_id: string;
  step_id: string;
  error: string;
  retry_count: number;
}

export interface DeviceStatusEvent {
  node_id: string;
  devices: {
    id: string;
    state: string;
    battery?: number;
    screen_on?: boolean;
    current_workflow?: string;
    current_step?: string;
    progress?: number;
  }[];
  system?: {
    cpu?: number;
    memory?: number;
  };
}

// ============================================
// 상수
// ============================================

const DEFAULT_CONFIG: Partial<SocketClientConfig> = {
  reconnectAttempts: 10,
  reconnectDelay: 5000,
  statusReportInterval: 10000, // 10초마다 상태 보고
};

const SOCKET_EVENTS = {
  // 서버 → 에이전트
  EXECUTE_WORKFLOW: 'EXECUTE_WORKFLOW',
  CANCEL_WORKFLOW: 'CANCEL_WORKFLOW',
  PING: 'PING',
  // 에이전트 → 서버
  REGISTER: 'REGISTER',
  DEVICE_STATUS: 'DEVICE_STATUS',
  WORKFLOW_PROGRESS: 'WORKFLOW_PROGRESS',
  WORKFLOW_COMPLETE: 'WORKFLOW_COMPLETE',
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  PONG: 'PONG',
} as const;

// ============================================
// SocketClient 클래스
// ============================================

export class SocketClient extends EventEmitter {
  private config: SocketClientConfig;
  private socket: Socket | null = null;
  private deviceManager: DeviceManager;
  private workflowRunner: WorkflowRunner;
  
  private isConnected = false;
  private statusReportTimer: NodeJS.Timeout | null = null;
  private activeWorkflows: Map<string, { deviceIds: string[]; startTime: number }> = new Map();

  constructor(
    config: Partial<SocketClientConfig> & { serverUrl: string; nodeId: string },
    deviceManager: DeviceManager,
    workflowRunner: WorkflowRunner
  ) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config } as SocketClientConfig;
    this.deviceManager = deviceManager;
    this.workflowRunner = workflowRunner;
  }

  /**
   * 서버 연결
   */
  connect(): void {
    if (this.socket?.connected) {
      console.warn('[SocketClient] Already connected');
      return;
    }

    console.log(`[SocketClient] Connecting to ${this.config.serverUrl}...`);

    this.socket = io(this.config.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.config.reconnectAttempts,
      reconnectionDelay: this.config.reconnectDelay,
    });

    this.setupEventHandlers();
  }

  /**
   * 이벤트 핸들러 설정
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // 연결 성공
    this.socket.on('connect', () => {
      console.log('[SocketClient] Connected to server');
      this.isConnected = true;
      
      // 노드 등록
      this.register();
      
      // 상태 보고 시작
      this.startStatusReporting();
      
      this.emit('connected');
    });

    // 연결 해제
    this.socket.on('disconnect', (reason) => {
      console.log(`[SocketClient] Disconnected: ${reason}`);
      this.isConnected = false;
      
      this.stopStatusReporting();
      
      this.emit('disconnected', reason);
    });

    // 연결 에러
    this.socket.on('connect_error', (error) => {
      console.error('[SocketClient] Connection error:', error.message);
      this.emit('error', error);
    });

    // ============================================
    // 서버 → 에이전트 이벤트
    // ============================================

    // 워크플로우 실행 명령
    this.socket.on(SOCKET_EVENTS.EXECUTE_WORKFLOW, async (data: ExecuteWorkflowEvent, ack) => {
      console.log(`[SocketClient] Received EXECUTE_WORKFLOW: ${data.job_id}`);
      
      // ACK 응답
      ack?.({ received: true });
      
      // 워크플로우 실행
      await this.handleExecuteWorkflow(data);
    });

    // 워크플로우 취소 명령
    this.socket.on(SOCKET_EVENTS.CANCEL_WORKFLOW, (data: CancelWorkflowEvent, ack) => {
      console.log(`[SocketClient] Received CANCEL_WORKFLOW: ${data.job_id}`);
      
      // TODO: 실행 중인 워크플로우 취소
      const cancelled = this.cancelWorkflow(data.job_id);
      
      ack?.({ cancelled });
    });

    // Ping (연결 확인)
    this.socket.on(SOCKET_EVENTS.PING, () => {
      this.socket?.emit(SOCKET_EVENTS.PONG);
    });
  }

  /**
   * 노드 등록
   */
  private register(): void {
    if (!this.socket?.connected) return;

    const devices = this.deviceManager.getConnectedDevices();
    
    this.socket.emit(SOCKET_EVENTS.REGISTER, {
      node_id: this.config.nodeId,
      version: process.env.npm_package_version || '1.0.0',
      device_count: devices.length,
    }, (response: { success: boolean }) => {
      if (response?.success) {
        console.log('[SocketClient] Node registered successfully');
      } else {
        console.error('[SocketClient] Node registration failed');
      }
    });
  }

  /**
   * 워크플로우 실행 처리
   */
  private async handleExecuteWorkflow(data: ExecuteWorkflowEvent): Promise<void> {
    const { job_id, workflow_id, workflow, device_ids, params } = data;

    // 활성 워크플로우 등록
    this.activeWorkflows.set(job_id, {
      deviceIds: device_ids,
      startTime: Date.now(),
    });

    // 연결된 디바이스만 필터링
    const connectedDevices = this.deviceManager.getConnectedDevices();
    const connectedIds = new Set(connectedDevices.map(d => d.serial));
    const validDeviceIds = device_ids.filter(id => connectedIds.has(id));

    // 연결 안 된 디바이스는 즉시 에러 보고
    for (const deviceId of device_ids) {
      if (!connectedIds.has(deviceId)) {
        this.sendWorkflowError(job_id, deviceId, 'init', 'Device not connected', 0);
      }
    }

    // 각 디바이스에서 워크플로우 실행
    for (const deviceId of validDeviceIds) {
      this.executeWorkflowOnDevice(job_id, workflow, deviceId, params);
    }
  }

  /**
   * 단일 디바이스에서 워크플로우 실행
   */
  private async executeWorkflowOnDevice(
    jobId: string,
    workflow: WorkflowDefinition,
    deviceId: string,
    params: Record<string, unknown>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // WorkflowRunner 실행
      await this.workflowRunner.executeWorkflow(
        workflow.id,
        deviceId,
        params,
        {
          // 진행률 콜백
          onProgress: async (progress, stepId) => {
            this.sendWorkflowProgress(jobId, deviceId, stepId, progress);
          },
        },
        workflow // 워크플로우 정의 직접 전달
      );

      // 성공
      this.sendWorkflowComplete(jobId, deviceId, true, Date.now() - startTime);

    } catch (error) {
      // 실패
      const errorMessage = (error as Error).message;
      this.sendWorkflowComplete(jobId, deviceId, false, Date.now() - startTime, errorMessage);
    }
  }

  /**
   * 워크플로우 취소
   */
  private cancelWorkflow(jobId: string): boolean {
    const workflow = this.activeWorkflows.get(jobId);
    if (!workflow) {
      return false;
    }

    // TODO: 실제 취소 로직 구현
    this.activeWorkflows.delete(jobId);
    return true;
  }

  /**
   * 진행 상황 전송
   */
  sendWorkflowProgress(
    jobId: string,
    deviceId: string,
    currentStep: string,
    progress: number,
    message?: string
  ): void {
    if (!this.socket?.connected) return;

    const event: WorkflowProgressEvent = {
      job_id: jobId,
      device_id: deviceId,
      current_step: currentStep,
      progress,
      message,
    };

    this.socket.emit(SOCKET_EVENTS.WORKFLOW_PROGRESS, event);
  }

  /**
   * 완료 전송
   */
  sendWorkflowComplete(
    jobId: string,
    deviceId: string,
    success: boolean,
    duration: number,
    error?: string
  ): void {
    if (!this.socket?.connected) return;

    const event: WorkflowCompleteEvent = {
      job_id: jobId,
      device_id: deviceId,
      success,
      duration,
      error,
    };

    this.socket.emit(SOCKET_EVENTS.WORKFLOW_COMPLETE, event);

    // 활성 워크플로우에서 제거 (모든 디바이스 완료 시)
    const workflow = this.activeWorkflows.get(jobId);
    if (workflow) {
      const idx = workflow.deviceIds.indexOf(deviceId);
      if (idx >= 0) {
        workflow.deviceIds.splice(idx, 1);
      }
      if (workflow.deviceIds.length === 0) {
        this.activeWorkflows.delete(jobId);
      }
    }
  }

  /**
   * 에러 전송
   */
  sendWorkflowError(
    jobId: string,
    deviceId: string,
    stepId: string,
    error: string,
    retryCount: number
  ): void {
    if (!this.socket?.connected) return;

    const event: WorkflowErrorEvent = {
      job_id: jobId,
      device_id: deviceId,
      step_id: stepId,
      error,
      retry_count: retryCount,
    };

    this.socket.emit(SOCKET_EVENTS.WORKFLOW_ERROR, event);
  }

  /**
   * 상태 보고 시작
   */
  private startStatusReporting(): void {
    if (this.statusReportTimer) return;

    const report = async () => {
      await this.sendDeviceStatus();
    };

    // 즉시 보고 후 주기적 보고
    report();
    this.statusReportTimer = setInterval(report, this.config.statusReportInterval);
  }

  /**
   * 상태 보고 중지
   */
  private stopStatusReporting(): void {
    if (this.statusReportTimer) {
      clearInterval(this.statusReportTimer);
      this.statusReportTimer = null;
    }
  }

  /**
   * 디바이스 상태 전송
   */
  private async sendDeviceStatus(): Promise<void> {
    if (!this.socket?.connected) return;

    const devices = this.deviceManager.getAllDevices();
    
    const event: DeviceStatusEvent = {
      node_id: this.config.nodeId,
      devices: devices.map(d => ({
        id: d.serial,
        state: this.getDeviceState(d),
        battery: d.battery,
        screen_on: d.screen_on,
      })),
      system: {
        cpu: await this.getSystemCpu(),
        memory: await this.getSystemMemory(),
      },
    };

    this.socket.emit(SOCKET_EVENTS.DEVICE_STATUS, event);
  }

  /**
   * 디바이스 상태 결정
   */
  private getDeviceState(device: ManagedDevice): string {
    if (device.state !== 'device') {
      return 'DISCONNECTED';
    }
    if (this.deviceManager.isQuarantined(device.serial)) {
      return 'QUARANTINE';
    }
    // 실행 중인 워크플로우 확인
    for (const [jobId, workflow] of this.activeWorkflows) {
      if (workflow.deviceIds.includes(device.serial)) {
        return 'RUNNING';
      }
    }
    return 'IDLE';
  }

  /**
   * 시스템 CPU 사용률
   */
  private async getSystemCpu(): Promise<number> {
    try {
      const si = await import('systeminformation');
      const load = await si.currentLoad();
      return Math.round(load.currentLoad);
    } catch {
      return 0;
    }
  }

  /**
   * 시스템 메모리 사용률
   */
  private async getSystemMemory(): Promise<number> {
    try {
      const si = await import('systeminformation');
      const mem = await si.mem();
      return Math.round((mem.used / mem.total) * 100);
    } catch {
      return 0;
    }
  }

  /**
   * 연결 상태
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * 연결 해제
   */
  disconnect(): void {
    this.stopStatusReporting();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.activeWorkflows.clear();
    
    console.log('[SocketClient] Disconnected');
  }
}

export default SocketClient;
