/**
 * Desktop Agent Main Entry
 * 
 * Electron 메인 프로세스
 * - Socket.IO 클라이언트로 Backend와 통신
 * - 워크플로우 실행
 * - 시스템 트레이
 * - 자동 업데이트
 * - 디바이스 자동 복구
 */

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import path from 'path';
import os from 'os';
import { SocketClient } from './socket/SocketClient';
import { DeviceManager, getDeviceManager } from './device/DeviceManager';
import { getAdbController } from './device/AdbController';
import { WorkflowRunner } from './workflow/WorkflowRunner';
import { AutoUpdater, getAutoUpdater } from './updater/AutoUpdater';
import { DeviceRecovery } from './recovery/DeviceRecovery';
import { NodeRecovery, getNodeRecovery, SavedState } from './recovery/NodeRecovery';
import { logger } from './utils/logger';

// Manager components for Worker orchestration
import {
  WorkerRegistry,
  TaskDispatcher,
  WorkerServer,
  ScreenStreamProxy,
  type RegisteredWorker,
  type TrackedDevice,
} from './manager';

// ============================================
// 환경 변수
// ============================================

const NODE_ID = process.env.NODE_ID || process.env.DOAIME_NODE_ID || `node_${os.hostname()}`;
const SERVER_URL = process.env.SERVER_URL || process.env.DOAIME_SERVER_URL || 'https://api.doai.me';
const IS_DEV = process.env.NODE_ENV === 'development';
const WORKER_SERVER_PORT = parseInt(process.env.WORKER_SERVER_PORT || '3001', 10);

// ============================================
// 전역 변수
// ============================================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let socketClient: SocketClient | null = null;
let deviceManager: DeviceManager | null = null;
let workflowRunner: WorkflowRunner | null = null;
let autoUpdater: AutoUpdater | null = null;
let deviceRecovery: DeviceRecovery | null = null;
let nodeRecovery: NodeRecovery | null = null;
let isAppQuitting = false;

// Manager components for Worker orchestration
let workerRegistry: WorkerRegistry | null = null;
let taskDispatcher: TaskDispatcher | null = null;
let workerServer: WorkerServer | null = null;
let screenStreamProxy: ScreenStreamProxy | null = null;

// ============================================
// 메인 윈도우
// ============================================

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../resources/icon.ico'),
  });

  if (IS_DEV) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================
// 시스템 트레이
// ============================================

function createTray(): void {
  const iconPath = path.join(__dirname, '../resources/icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(`DOAI Agent (${NODE_ID})`);

  updateTrayMenu('disconnected');

  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

function updateTrayMenu(status: 'connected' | 'disconnected' | 'running' | 'error'): void {
  if (!tray) return;

  const statusText = {
    connected: '🟢 연결됨',
    disconnected: '⚪ 연결 안됨',
    running: '🔵 작업 중',
    error: '🔴 오류',
  }[status];

  const contextMenu = Menu.buildFromTemplate([
    { label: `DOAI Agent - ${NODE_ID}`, enabled: false },
    { label: statusText, enabled: false },
    { type: 'separator' },
    {
      label: '대시보드 열기',
      click: () => mainWindow?.show(),
    },
    { type: 'separator' },
    {
      label: '연결 정보',
      submenu: [
        { label: `노드 ID: ${NODE_ID}`, enabled: false },
        { label: `서버: ${SERVER_URL}`, enabled: false },
        { label: `상태: ${status}`, enabled: false },
      ],
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        isAppQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ============================================
// 에이전트 시작
// ============================================

async function startAgent(): Promise<void> {
  logger.info('Starting Desktop Agent', { nodeId: NODE_ID, serverUrl: SERVER_URL });

  // 자동 업데이트 초기화 - only if mainWindow is available
  if (mainWindow) {
    autoUpdater = getAutoUpdater(mainWindow);
    autoUpdater.init();

    autoUpdater.on('update-pending', (info) => {
      logger.info('Update pending', info);
      // 서버에 업데이트 대기 알림
      if (socketClient?.connected) {
        socketClient.emit('NODE_UPDATE_PENDING', info);
      }
    });
  } else {
    logger.warn('AutoUpdater not initialized: mainWindow is not available');
  }

  // 디바이스 매니저 초기화
  deviceManager = getDeviceManager();
  await deviceManager.initialize();
  deviceManager.startMonitoring();

  // 워크플로우 러너 초기화
  workflowRunner = new WorkflowRunner(NODE_ID);

  // 디바이스 복구 모니터 초기화
  const adb = getAdbController();
  deviceRecovery = new DeviceRecovery(adb, null, {
    maxReconnectAttempts: 3,
    checkIntervalMs: 30000, // 30초
  });

  // 초기 디바이스 등록
  for (const device of deviceManager.getAllDevices()) {
    deviceRecovery.registerDevice(device.serial, device.state);
  }

  // 디바이스 복구 이벤트 핸들러
  deviceRecovery.on('device:disconnected', (deviceId: string) => {
    logger.warn('Device disconnected (recovery failed)', { deviceId });
    if (socketClient?.connected) {
      socketClient.emit('DEVICE_STATUS', {
        device_id: deviceId,
        state: 'DISCONNECTED',
        reason: 'Recovery failed after max attempts',
      });
    }
    sendToRenderer('device:disconnected', { deviceId });
  });

  deviceRecovery.on('device:reconnected', (deviceId: string) => {
    logger.info('Device reconnected', { deviceId });
    if (socketClient?.connected) {
      socketClient.emit('DEVICE_STATUS', {
        device_id: deviceId,
        state: 'IDLE',
        reason: 'Auto-reconnected',
      });
    }
    sendToRenderer('device:reconnected', { deviceId });
  });

  deviceRecovery.start();

  // 노드 복구 초기화
  nodeRecovery = getNodeRecovery();

  // Socket.IO 클라이언트 초기화
  socketClient = new SocketClient(
    {
      serverUrl: SERVER_URL,
      nodeId: NODE_ID,
    },
    deviceManager,
    workflowRunner
  );

  // Socket 이벤트 핸들러
  socketClient.on('connected', async () => {
    logger.info('Connected to server');
    updateTrayMenu('connected');
    sendToRenderer('agent:connected');

    // 이전 상태 복구 시도
    if (nodeRecovery) {
      await nodeRecovery.recover(socketClient!);
    }
  });

  socketClient.on('disconnected', (reason: string) => {
    logger.warn('Disconnected from server', { reason });
    updateTrayMenu('disconnected');
    sendToRenderer('agent:disconnected', { reason });
  });

  socketClient.on('error', (error: Error) => {
    logger.error('Socket error', { error: error.message });
    updateTrayMenu('error');
    sendToRenderer('agent:error', { error: error.message });
  });

  // 연결 시작
  socketClient.connect();

  // 상태 자동 백업 시작
  nodeRecovery.startAutoBackup(() => ({
    nodeId: NODE_ID,
    runningWorkflows: workflowRunner?.getRunningWorkflows?.() || [],
    deviceStates: deviceManager?.getAllStates() || {},
  }));

  // ============================================
  // Manager Components 초기화 (Worker 오케스트레이션)
  // ============================================
  
  await initializeManagerComponents();

  logger.info('Desktop Agent started successfully');
}

// ============================================
// Manager 컴포넌트 초기화
// ============================================

async function initializeManagerComponents(): Promise<void> {
  logger.info('[Manager] Initializing Manager components...', { port: WORKER_SERVER_PORT });

  try {
    // 1. WorkerRegistry 초기화 - Worker 등록 및 상태 추적
    workerRegistry = new WorkerRegistry({
      heartbeatTimeoutMs: 30000,
      healthCheckIntervalMs: 10000,
    });

    // Registry 이벤트 핸들러
    workerRegistry.on('worker:registered', (worker) => {
      logger.info('[Manager] Worker registered', {
        workerId: worker.worker_id,
        workerType: worker.worker_type,
        deviceCount: worker.devices.length,
      });
      sendToRenderer('manager:worker-registered', {
        workerId: worker.worker_id,
        workerType: worker.worker_type,
        devices: worker.devices.map(d => d.deviceId),
      });
    });

    workerRegistry.on('worker:unregistered', (workerId, reason) => {
      logger.info('[Manager] Worker unregistered', { workerId, reason });
      sendToRenderer('manager:worker-unregistered', { workerId, reason });
    });

    workerRegistry.on('worker:timeout', (workerId, lastHeartbeat) => {
      logger.warn('[Manager] Worker heartbeat timeout', { workerId, lastHeartbeat });
      sendToRenderer('manager:worker-timeout', { workerId });
    });

    workerRegistry.start();

    // 2. TaskDispatcher 초기화 - Job 분배 및 추적
    taskDispatcher = new TaskDispatcher(workerRegistry, {
      defaultTimeoutMs: 300000, // 5분
      defaultRetry: {
        maxAttempts: 3,
        delayMs: 5000,
      },
    });

    // Dispatcher 이벤트 핸들러
    taskDispatcher.on('job:dispatched', (job) => {
      logger.info('[Manager] Job dispatched', {
        jobId: job.job_id,
        jobType: job.job_type,
        workerId: job.worker_id,
      });
      sendToRenderer('manager:job-dispatched', job);
    });

    taskDispatcher.on('job:progress', (job, progress) => {
      logger.debug('[Manager] Job progress', {
        jobId: job.job_id,
        progress: progress.progress,
        step: progress.currentStep,
      });
      sendToRenderer('manager:job-progress', {
        jobId: job.job_id,
        progress: progress.progress,
        currentStep: progress.currentStep,
        totalSteps: progress.totalSteps,
        message: progress.message,
      });
    });

    taskDispatcher.on('job:complete', (job) => {
      logger.info('[Manager] Job completed', {
        jobId: job.job_id,
        durationMs: job.duration_ms,
      });
      sendToRenderer('manager:job-complete', job);
    });

    taskDispatcher.on('job:failed', (job) => {
      logger.error('[Manager] Job failed', {
        jobId: job.job_id,
        error: job.error?.message,
      });
      sendToRenderer('manager:job-failed', job);
    });

    // 3. ScreenStreamProxy 초기화 (옵션) - 스크린 스트리밍 프록시
    screenStreamProxy = new ScreenStreamProxy(workerRegistry);

    // 4. WorkerServer 초기화 및 시작
    workerServer = new WorkerServer(workerRegistry, taskDispatcher, {
      port: WORKER_SERVER_PORT,
      host: '0.0.0.0',
      pingIntervalMs: 10000,
      pingTimeoutMs: 5000,
    });

    workerServer.on('server:started', (port) => {
      logger.info('[Manager] Worker server started', { port });
      sendToRenderer('manager:server-started', { port });
    });

    workerServer.on('server:error', (error) => {
      logger.error('[Manager] Worker server error', { error: error.message });
      sendToRenderer('manager:server-error', { error: error.message });
    });

    workerServer.on('connection:new', (socket) => {
      logger.debug('[Manager] New worker connection', { socketId: socket.id });
    });

    await workerServer.start();

    logger.info('[Manager] Manager components initialized successfully', {
      workerServerPort: WORKER_SERVER_PORT,
    });

  } catch (error) {
    logger.error('[Manager] Failed to initialize Manager components', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ============================================
// IPC 핸들러
// ============================================

function setupIPC(): void {
  // 에이전트 상태 조회
  ipcMain.handle('agent:getStatus', () => {
    return {
      nodeId: NODE_ID,
      serverUrl: SERVER_URL,
      connected: socketClient?.connected || false,
      deviceCount: deviceManager?.getConnectedDevices().length || 0,
    };
  });

  // 디바이스 목록 조회
  ipcMain.handle('devices:list', () => {
    return deviceManager?.getAllDevices() || [];
  });

  // 로그 조회
  ipcMain.handle('logs:get', () => {
    // TODO: 로그 저장 및 조회 구현
    return [];
  });

  // ============================================
  // Manager IPC 핸들러
  // ============================================

  // Manager 상태 조회
  ipcMain.handle('manager:getStatus', () => {
    return {
      workerServerRunning: workerServer?.isRunning() || false,
      workerServerPort: workerServer?.getPort() || WORKER_SERVER_PORT,
      connectedWorkers: workerServer?.getConnectedWorkerCount() || 0,
      registeredWorkers: workerRegistry?.getWorkers().length || 0,
      activeJobs: taskDispatcher?.getActiveJobs().length || 0,
    };
  });

  // 등록된 Worker 목록 조회
  ipcMain.handle('manager:getWorkers', () => {
    if (!workerRegistry) return [];
    return workerRegistry.getWorkers().map((worker: RegisteredWorker) => ({
      workerId: worker.worker_id,
      workerType: worker.worker_type,
      activeJobs: worker.active_jobs,
      maxConcurrentJobs: worker.max_concurrent_jobs,
      lastHeartbeat: worker.last_heartbeat,
      connectedAt: worker.connected_at,
      devices: worker.devices.map((d: TrackedDevice) => ({
        deviceId: d.deviceId,
        state: d.state,
        currentJobId: d.currentJobId,
      })),
      metrics: worker.metrics,
    }));
  });

  // 활성 Job 목록 조회
  ipcMain.handle('manager:getActiveJobs', () => {
    if (!taskDispatcher) return [];
    return taskDispatcher.getActiveJobs().map((job) => ({
      jobId: job.job_id,
      jobType: job.job_type,
      status: job.status,
      workerId: job.worker_id,
      deviceIds: job.device_ids,
      dispatchedAt: job.dispatched_at,
      progress: job.progress,
    }));
  });

  // Job 디스패치 요청
  ipcMain.handle('manager:dispatchJob', async (_event, jobRequest: {
    jobId: string;
    jobType: string;
    params: Record<string, unknown>;
    options?: Record<string, unknown>;
  }) => {
    if (!taskDispatcher) {
      throw new Error('TaskDispatcher not initialized');
    }
    const { jobId, jobType, params, options } = jobRequest;
    return await taskDispatcher.dispatchJob(jobId, jobType, params, options);
  });

  // Job 취소 요청
  ipcMain.handle('manager:cancelJob', (_event, jobId: string) => {
    if (!taskDispatcher) {
      throw new Error('TaskDispatcher not initialized');
    }
    return taskDispatcher.cancelJob(jobId);
  });
}

// ============================================
// Renderer로 메시지 전송
// ============================================

function sendToRenderer(channel: string, data?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ============================================
// App 라이프사이클
// ============================================

app.on('ready', async () => {
  logger.info('App ready');

  createWindow();
  createTray();
  setupIPC();

  // 약간의 딜레이 후 에이전트 시작
  setTimeout(() => {
    startAgent();
  }, 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', async (event) => {
  if (isAppQuitting) return;
  
  event.preventDefault();
  isAppQuitting = true;

  logger.info('App quitting, saving state...');

  try {
    // 상태 저장
    if (nodeRecovery) {
      const state: Omit<SavedState, 'timestamp' | 'version'> = {
        nodeId: NODE_ID,
        runningWorkflows: workflowRunner?.getRunningWorkflows?.() || [],
        deviceStates: deviceManager?.getAllStates() || {},
      };
      await nodeRecovery.saveBeforeQuit(state);
    }

    // Manager 컴포넌트 정리
    if (workerServer) {
      logger.info('[Manager] Stopping worker server...');
      await workerServer.stop();
    }

    if (workerRegistry) {
      logger.info('[Manager] Stopping worker registry...');
      workerRegistry.stop();
    }

    // Note: ScreenStreamProxy doesn't have cleanup method - streams are terminated when workers disconnect

    // 복구 모니터 중지
    if (deviceRecovery) {
      deviceRecovery.stop();
    }

    // 자동 업데이트 중지
    if (autoUpdater) {
      autoUpdater.stop();
    }

    // 자동 백업 중지
    if (nodeRecovery) {
      nodeRecovery.stopAutoBackup();
    }

    // Socket 연결 해제
    if (socketClient) {
      socketClient.disconnect();
    }

    // 디바이스 모니터링 중지
    if (deviceManager) {
      deviceManager.stop();
    }

    // 워크플로우 정리
    if (workflowRunner) {
      await workflowRunner.cleanup();
    }

    logger.info('Cleanup completed, exiting');
  } catch (error) {
    logger.error('Error during cleanup', { error: (error as Error).message });
  }

  app.exit(0);
});

// ============================================
// 예외 처리
// ============================================

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});
