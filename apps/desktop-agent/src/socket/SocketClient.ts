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
import type { WorkflowStep } from '@doai/shared/database';

// ============================================
// 타입 정의
// ============================================

export type { WorkflowStep };

export interface SocketClientConfig {
  serverUrl: string;
  nodeId: string;
  pcId?: string;
  workerToken?: string;
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

// scrcpy 이벤트 타입
export interface ScrcpyStartEvent {
  device_id: string;
  adb_serial: string;
  options?: {
    maxSize?: number;
    maxFps?: number;
    videoBitRate?: number;
  };
}

export interface ScrcpyStopEvent {
  device_id: string;
}

export interface ScrcpyInputEvent {
  device_id: string;
  type: 'tap' | 'swipe' | 'text' | 'key' | 'scroll' | 'back' | 'longPress';
  params: Record<string, unknown>;
}

export interface ScrcpyBatchInputEvent {
  device_ids: string[];
  type: 'tap' | 'swipe' | 'text' | 'key' | 'back';
  params: Record<string, unknown>;
}

// job:assign 이벤트 (서버 → 에이전트, 프로덕션 작업 분배)
export interface JobAssignEvent {
  assignmentId: string;
  deviceId: string;
  deviceSerial: string;
  job: {
    id: string;
    title: string;
    target_url: string;
    duration_sec: number;
    duration_min_pct: number;
    duration_max_pct: number;
    prob_like: number;
    prob_comment: number;
    prob_playlist: number;
    script_type: string;
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
  // scrcpy 제어 (서버 → 에이전트) — canonical lowercase names
  SCRCPY_START: 'scrcpy:start',
  SCRCPY_STOP: 'scrcpy:stop',
  SCRCPY_INPUT: 'scrcpy:input',
  SCRCPY_BATCH_INPUT: 'scrcpy:batch:input',
  // 에이전트 → 서버
  REGISTER: 'REGISTER',
  DEVICE_STATUS: 'DEVICE_STATUS',
  WORKFLOW_PROGRESS: 'WORKFLOW_PROGRESS',
  WORKFLOW_COMPLETE: 'WORKFLOW_COMPLETE',
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  PONG: 'PONG',
  // scrcpy 스트림 (에이전트 → 서버) — canonical lowercase names
  SCRCPY_THUMBNAIL: 'scrcpy:thumbnail',
  SCRCPY_SESSION_STATE: 'scrcpy:session:state',
  SCRCPY_VIDEO_META: 'scrcpy:video:meta',
  // job 이벤트 (프로덕션 작업 분배)
  JOB_ASSIGN: 'job:assign',           // 서버 → 에이전트
  JOB_STARTED: 'job:started',         // 에이전트 → 서버
  JOB_PROGRESS: 'job:progress',       // 에이전트 → 서버
  JOB_COMPLETED: 'job:completed',     // 에이전트 → 서버
  JOB_FAILED: 'job:failed',           // 에이전트 → 서버
  JOB_REQUEST: 'job:request',         // 에이전트 → 서버 (작업 요청)
  JOB_REQUEST_RESPONSE: 'job:request:response', // 서버 → 에이전트
  COMMENT_REQUEST: 'comment:request', // 에이전트 → 서버
  COMMENT_RESPONSE: 'comment:response', // 서버 → 에이전트
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

    const connectUrl = this.config.serverUrl + '/worker';
    console.log(`[SocketClient] Using namespace: /worker, pcId: ${this.config.pcId || this.config.nodeId}`);

    this.socket = io(connectUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.config.reconnectAttempts,
      reconnectionDelay: this.config.reconnectDelay,
      auth: {
        pcId: this.config.pcId || this.config.nodeId,
        token: this.config.workerToken || '',
      },
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

      try {
        // 노드 등록
        console.log('[SocketClient] Calling register()...');
        this.register();
        console.log('[SocketClient] register() done');

        // 상태 보고 시작
        console.log('[SocketClient] Calling startStatusReporting()...');
        this.startStatusReporting();
        console.log('[SocketClient] startStatusReporting() done');
        this.emit('connected');
      } catch (err) {
        console.error('[SocketClient] ERROR in connect handler:', err);
        this.emit('error', err);
      }
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

    // ============================================
    // scrcpy 제어 이벤트
    // ============================================

    // scrcpy 세션 시작 요청
    this.socket.on(SOCKET_EVENTS.SCRCPY_START, (data: ScrcpyStartEvent, ack) => {
      console.log(`[SocketClient] Received SCRCPY_START: ${data.device_id}`);
      ack?.({ received: true });
      this.emit('scrcpy:start', data);
    });

    // scrcpy 세션 종료 요청
    this.socket.on(SOCKET_EVENTS.SCRCPY_STOP, (data: ScrcpyStopEvent, ack) => {
      console.log(`[SocketClient] Received SCRCPY_STOP: ${data.device_id}`);
      ack?.({ received: true });
      this.emit('scrcpy:stop', data);
    });

    // scrcpy 입력 명령 (단일 디바이스)
    this.socket.on(SOCKET_EVENTS.SCRCPY_INPUT, (data: ScrcpyInputEvent, ack) => {
      ack?.({ received: true });
      this.emit('scrcpy:input', data);
    });

    // scrcpy 배치 입력 명령 (여러 디바이스)
    this.socket.on(SOCKET_EVENTS.SCRCPY_BATCH_INPUT, (data: ScrcpyBatchInputEvent, ack) => {
      ack?.({ received: true });
      this.emit('scrcpy:batchInput', data);
    });

    // ============================================
    // job:assign 이벤트 (프로덕션 작업 분배)
    // ============================================

    this.socket.on(SOCKET_EVENTS.JOB_ASSIGN, async (data: JobAssignEvent) => {
      console.log(`[SocketClient] Received job:assign: ${data.assignmentId} for device ${data.deviceSerial}`);
      await this.handleJobAssign(data);
    });
  }

  /**
   * 노드 등록
   */
  private register(): void {
    if (!this.socket?.connected) return;

    // 초기 heartbeat로 등록 (백엔드는 worker:heartbeat으로 디바이스를 관리)
    this.sendHeartbeat();
    console.log('[SocketClient] Node registered via heartbeat');
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
    const connectedIds = new Set(connectedDevices); // getConnectedDevices returns string[]
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
   * job:assign 핸들러 (프로덕션 작업 분배)
   * Backend에서 job:assign → WorkflowDefinition 변환 → WorkflowRunner 실행
   */
  private async handleJobAssign(data: JobAssignEvent): Promise<void> {
    const { assignmentId, deviceId, deviceSerial, job } = data;

    // 1. job:started 보고
    this.socket?.emit(SOCKET_EVENTS.JOB_STARTED, {
      assignmentId,
      jobId: job.id,
      deviceId,
      deviceSerial,
      timestamp: Date.now(),
    });

    // 2. job:assign → WorkflowDefinition 변환
    const workflow: WorkflowDefinition = {
      id: `job-${job.id}`,
      name: job.title || 'YouTube Watch',
      version: 1,
      timeout: (job.duration_sec || 60) * 1000 * 2,
      steps: [
        { id: 'launch', action: 'adb', command: 'shell am start -n com.google.android.youtube/.HomeActivity' },
        { id: 'wait_launch', action: 'wait', params: { ms: 3000 } },
        { id: 'open_video', action: 'adb', command: `shell am start -a android.intent.action.VIEW -d "${job.target_url}"` },
        { id: 'wait_video', action: 'wait', params: { ms: 5000 } },
        { id: 'watch', action: 'wait', params: { ms: (job.duration_sec || 60) * 1000 } },
        { id: 'report', action: 'system', command: 'report_complete' },
      ],
    };

    const startTime = Date.now();

    // 3. activeWorkflows에 등록
    this.activeWorkflows.set(job.id, {
      deviceIds: [deviceSerial],
      startTime,
    });

    try {
      // 4. WorkflowRunner 실행
      await this.workflowRunner.executeWorkflow(
        workflow.id,
        deviceSerial,
        { assignmentId, jobId: job.id, ...job },
        {
          onProgress: async (progress, stepId) => {
            this.socket?.emit(SOCKET_EVENTS.JOB_PROGRESS, {
              jobId: job.id,
              assignmentId,
              deviceId,
              deviceSerial,
              progressPct: progress,
              currentStep: stepId,
              totalSteps: workflow.steps.length,
              status: 'running',
              timestamp: Date.now(),
            });
          },
        },
        workflow
      );

      // 5. 성공 보고
      const finalDurationSec = Math.round((Date.now() - startTime) / 1000);
      this.socket?.emit(SOCKET_EVENTS.JOB_COMPLETED, {
        assignmentId,
        jobId: job.id,
        deviceId,
        deviceSerial,
        finalDurationSec,
        success: true,
        timestamp: Date.now(),
      });

    } catch (error) {
      // 6. 실패 보고
      this.socket?.emit(SOCKET_EVENTS.JOB_FAILED, {
        assignmentId,
        jobId: job.id,
        deviceId,
        deviceSerial,
        error: (error as Error).message,
        timestamp: Date.now(),
      });
    } finally {
      // 7. activeWorkflows에서 제거
      this.activeWorkflows.delete(job.id);
    }
  }

  /**
   * 댓글 요청 (Backend comment pool에서 가져오기)
   */
  async requestComment(jobId: string, deviceId: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) { resolve(null); return; }

      this.socket.emit(SOCKET_EVENTS.COMMENT_REQUEST, { jobId, deviceId });

      const timeout = setTimeout(() => resolve(null), 10000);
      this.socket.once(SOCKET_EVENTS.COMMENT_RESPONSE, (data: { jobId: string; deviceId: string; comment: string | null }) => {
        clearTimeout(timeout);
        resolve(data.comment || null);
      });
    });
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
   * 디바이스 상태 전송 (worker:heartbeat 프로토콜)
   */
  private async sendDeviceStatus(): Promise<void> {
    if (!this.socket?.connected) return;
    await this.sendHeartbeat();
  }

  /**
   * worker:heartbeat 전송 (백엔드 프로토콜)
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.socket?.connected) {
      console.log('[SocketClient] sendHeartbeat skipped: socket not connected');
      return;
    }

    try {
      const devices = this.deviceManager.getAllDevices();
      console.log(`[SocketClient] sendHeartbeat: ${devices.length} devices`);

      this.socket.emit('worker:heartbeat', {
        devices: devices.map(d => ({
          deviceId: `${this.config.pcId || this.config.nodeId}-${d.serial}`,
          serial: d.serial,
          status: this.getDeviceState(d),
          adbConnected: d.state !== 'DISCONNECTED',
          battery: d.battery,
        })),
      });
    } catch (err) {
      console.error('[SocketClient] sendHeartbeat ERROR:', err);
    }
  }

  /**
   * 디바이스 상태 결정
   */
  private getDeviceState(device: ManagedDevice): string {
    if (device.state === 'DISCONNECTED') {
      return 'DISCONNECTED';
    }
    if (device.state === 'QUARANTINE') {
      return 'QUARANTINE';
    }
    if (device.state === 'ERROR') {
      return 'ERROR';
    }
    // 실행 중인 워크플로우 확인
    for (const [_jobId, workflow] of this.activeWorkflows) {
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

  // ============================================
  // scrcpy 스트림 전송 (에이전트 → 서버)
  // ============================================

  /**
   * scrcpy 썸네일 프레임 전송 (바이너리)
   */
  sendScrcpyThumbnail(
    deviceId: string,
    jpegData: Buffer,
    width: number,
    height: number
  ): void {
    if (!this.socket?.connected) return;

    this.socket.emit(SOCKET_EVENTS.SCRCPY_THUMBNAIL, {
      device_id: deviceId,
      data: jpegData,
      width,
      height,
      timestamp: Date.now(),
    });
  }

  /**
   * scrcpy 세션 상태 변경 전송
   */
  sendScrcpySessionState(deviceId: string, state: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit(SOCKET_EVENTS.SCRCPY_SESSION_STATE, {
      device_id: deviceId,
      state,
      timestamp: Date.now(),
    });
  }

  /**
   * scrcpy 비디오 메타 정보 전송
   */
  sendScrcpyVideoMeta(
    deviceId: string,
    meta: { codecId: number; width: number; height: number }
  ): void {
    if (!this.socket?.connected) return;

    this.socket.emit(SOCKET_EVENTS.SCRCPY_VIDEO_META, {
      device_id: deviceId,
      ...meta,
    });
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
