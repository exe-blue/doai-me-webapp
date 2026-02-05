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

// ============================================
// 환경 변수
// ============================================

const NODE_ID = process.env.NODE_ID || process.env.DOAIME_NODE_ID || `node_${os.hostname()}`;
const SERVER_URL = process.env.SERVER_URL || process.env.DOAIME_SERVER_URL || 'https://api.doai.me';
const IS_DEV = process.env.NODE_ENV === 'development';

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

  logger.info('Desktop Agent started successfully');
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
