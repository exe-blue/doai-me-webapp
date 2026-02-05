/**
 * Node Recovery
 * 
 * 노드 재시작 시 상태 복구 및 중단된 작업 처리
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * 워크플로우 정보
 */
interface RunningWorkflow {
  workflowId: string;
  executionId: string;
  deviceId: string;
  currentStep?: string;
  progress: number;
  startedAt: number;
  params?: Record<string, unknown>;
}

/**
 * 디바이스 상태 정보
 */
interface DeviceStateInfo {
  state: string;
  lastWorkflowId?: string;
  lastSeen: number;
  battery?: number;
  errorCount?: number;
}

/**
 * 저장된 노드 상태
 */
export interface SavedState {
  timestamp: number;
  nodeId: string;
  version: string;
  runningWorkflows: RunningWorkflow[];
  deviceStates: Record<string, DeviceStateInfo>;
  metadata?: Record<string, unknown>;
}

/**
 * 복구 결과
 */
export interface RecoveryResult {
  recovered: boolean;
  state: SavedState | null;
  workflowsToCancel: string[];
  workflowsToResume: string[];
}

/**
 * Socket 클라이언트 인터페이스
 */
interface SocketClient {
  emit(event: string, data: unknown): void;
  connected: boolean;
}

/**
 * 노드 복구 관리자
 */
export class NodeRecovery extends EventEmitter {
  private stateFilePath: string;
  private backupInterval: NodeJS.Timeout | null = null;
  private currentState: SavedState | null = null;

  // 설정
  private readonly STATE_FILE_NAME = 'node-state.json';
  private readonly BACKUP_INTERVAL_MS = 10 * 60 * 1000; // 10분
  private readonly MAX_STATE_AGE_MS = 24 * 60 * 60 * 1000; // 24시간

  constructor() {
    super();
    
    // 상태 파일 경로 설정
    const userDataPath = app?.getPath?.('userData') || process.cwd();
    this.stateFilePath = path.join(userDataPath, this.STATE_FILE_NAME);
  }

  /**
   * 상태 저장 시작 (주기적 백업)
   */
  startAutoBackup(
    getStateCallback: () => Omit<SavedState, 'timestamp' | 'version'>
  ): void {
    logger.info('Starting auto backup', {
      interval: this.BACKUP_INTERVAL_MS,
      path: this.stateFilePath,
    });

    this.backupInterval = setInterval(async () => {
      try {
        const state: SavedState = {
          ...getStateCallback(),
          timestamp: Date.now(),
          version: app?.getVersion?.() || '1.0.0',
        };
        await this.saveState(state);
      } catch (error) {
        logger.error('Auto backup failed', { error: (error as Error).message });
      }
    }, this.BACKUP_INTERVAL_MS);
  }

  /**
   * 상태 저장 중지
   */
  stopAutoBackup(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
      logger.info('Auto backup stopped');
    }
  }

  /**
   * 상태 저장
   */
  async saveState(state: SavedState): Promise<void> {
    try {
      this.currentState = state;
      
      await fs.writeFile(
        this.stateFilePath,
        JSON.stringify(state, null, 2),
        'utf-8'
      );
      
      logger.debug('Node state saved', {
        runningWorkflows: state.runningWorkflows.length,
        devices: Object.keys(state.deviceStates).length,
      });
      
      this.emit('state:saved', state);
    } catch (error) {
      logger.error('Failed to save node state', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 저장된 상태 로드
   */
  async loadState(): Promise<SavedState | null> {
    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content) as SavedState;

      // 상태 유효성 검사
      if (!this.isValidState(state)) {
        logger.warn('Invalid saved state, ignoring');
        return null;
      }

      // 24시간 이상 된 상태는 무시
      if (Date.now() - state.timestamp > this.MAX_STATE_AGE_MS) {
        logger.info('Saved state is too old, ignoring', {
          savedAt: new Date(state.timestamp).toISOString(),
          maxAge: this.MAX_STATE_AGE_MS,
        });
        return null;
      }

      logger.info('Loaded saved state', {
        savedAt: new Date(state.timestamp).toISOString(),
        runningWorkflows: state.runningWorkflows.length,
      });

      return state;
    } catch (error) {
      // 파일 없으면 정상 (첫 실행)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('No saved state file found (first run)');
        return null;
      }
      
      logger.error('Failed to load saved state', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * 상태 유효성 검사
   */
  private isValidState(state: unknown): state is SavedState {
    if (typeof state !== 'object' || state === null) return false;
    
    const s = state as Record<string, unknown>;
    return (
      typeof s.timestamp === 'number' &&
      typeof s.nodeId === 'string' &&
      Array.isArray(s.runningWorkflows) &&
      typeof s.deviceStates === 'object'
    );
  }

  /**
   * 상태 삭제
   */
  async clearState(): Promise<void> {
    try {
      await fs.unlink(this.stateFilePath);
      this.currentState = null;
      logger.info('Saved state cleared');
      this.emit('state:cleared');
    } catch (error) {
      // 파일 없으면 무시
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to clear saved state', { error: (error as Error).message });
      }
    }
  }

  /**
   * 복구 로직 실행
   */
  async recover(socketClient?: SocketClient): Promise<RecoveryResult> {
    const savedState = await this.loadState();

    if (!savedState) {
      logger.info('No saved state to recover');
      return {
        recovered: false,
        state: null,
        workflowsToCancel: [],
        workflowsToResume: [],
      };
    }

    logger.info('Recovering from saved state', {
      savedAt: new Date(savedState.timestamp).toISOString(),
      runningWorkflows: savedState.runningWorkflows.length,
      nodeId: savedState.nodeId,
    });

    // 중단된 워크플로우 분류
    const workflowsToCancel: string[] = [];
    const workflowsToResume: string[] = [];

    for (const wf of savedState.runningWorkflows) {
      // 30분 이상 지난 워크플로우는 취소
      if (Date.now() - wf.startedAt > 30 * 60 * 1000) {
        workflowsToCancel.push(wf.executionId);
      } else {
        workflowsToResume.push(wf.executionId);
      }
    }

    // 서버에 재연결 알림
    if (socketClient?.connected) {
      socketClient.emit('NODE_RECONNECT', {
        nodeId: savedState.nodeId,
        previousState: {
          runningWorkflows: savedState.runningWorkflows,
          timestamp: savedState.timestamp,
          workflowsToCancel,
          workflowsToResume,
        },
      });
    }

    // 이벤트 발행
    this.emit('recovery:started', savedState);

    // 상태 파일 삭제 (복구 완료)
    await this.clearState();

    this.emit('recovery:completed', {
      state: savedState,
      workflowsToCancel,
      workflowsToResume,
    });

    return {
      recovered: true,
      state: savedState,
      workflowsToCancel,
      workflowsToResume,
    };
  }

  /**
   * 종료 전 상태 저장 (app.on('before-quit') 에서 호출)
   */
  async saveBeforeQuit(state: Omit<SavedState, 'timestamp' | 'version'>): Promise<void> {
    const fullState: SavedState = {
      ...state,
      timestamp: Date.now(),
      version: app?.getVersion?.() || '1.0.0',
    };

    try {
      // 동기 방식으로 저장 (종료 시점이라 async/await 불안정)
      const content = JSON.stringify(fullState, null, 2);
      await fs.writeFile(this.stateFilePath, content, 'utf-8');
      
      logger.info('State saved before quit', {
        runningWorkflows: fullState.runningWorkflows.length,
      });
    } catch (error) {
      logger.error('Failed to save state before quit', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * 현재 저장된 상태 반환
   */
  getCurrentState(): SavedState | null {
    return this.currentState;
  }

  /**
   * 상태 파일 경로 반환
   */
  getStateFilePath(): string {
    return this.stateFilePath;
  }
}

// 싱글톤 인스턴스
let instance: NodeRecovery | null = null;

export function getNodeRecovery(): NodeRecovery {
  if (!instance) {
    instance = new NodeRecovery();
  }
  return instance;
}

export default NodeRecovery;
