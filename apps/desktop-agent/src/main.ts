/**
 * Desktop Agent Main Entry
 * 
 * Electron 메인 프로세스
 * - Socket.IO 클라이언트로 Backend와 통신
 * - 워크플로우 실행
 * - 시스템 트레이
 */

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import path from 'path';
import { SocketClient } from './socket/SocketClient';
import { DeviceManager } from './device/DeviceManager';
import { WorkflowRunner } from './workflow/WorkflowRunner';

// ============================================
// 환경 변수
// ============================================

const NODE_ID = process.env.NODE_ID || `node_${require('os').hostname()}`;
const SERVER_URL = process.env.SERVER_URL || 'https://api.doai.me';
const IS_DEV = process.env.NODE_ENV === 'development';

// ============================================
// 전역 변수
// ============================================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let socketClient: SocketClient | null = null;
let deviceManager: DeviceManager | null = null;
let workflowRunner: WorkflowRunner | null = null;
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
// Socket.IO 클라이언트 시작
// ============================================

async function startAgent(): Promise<void> {
  console.log(`[Main] Starting Desktop Agent...`);
  console.log(`[Main] Node ID: ${NODE_ID}`);
  console.log(`[Main] Server: ${SERVER_URL}`);

  // 디바이스 매니저 초기화
  deviceManager = new DeviceManager();
  await deviceManager.initialize();
  await deviceManager.startMonitoring();

  // 워크플로우 러너 초기화
  workflowRunner = new WorkflowRunner(NODE_ID);

  // Socket.IO 클라이언트 초기화
  socketClient = new SocketClient(
    {
      serverUrl: SERVER_URL,
      nodeId: NODE_ID,
    },
    deviceManager,
    workflowRunner
  );

  // 이벤트 핸들러
  socketClient.on('connected', () => {
    console.log('[Main] Connected to server');
    updateTrayMenu('connected');
    sendToRenderer('agent:connected');
  });

  socketClient.on('disconnected', (reason: string) => {
    console.log(`[Main] Disconnected: ${reason}`);
    updateTrayMenu('disconnected');
    sendToRenderer('agent:disconnected', { reason });
  });

  socketClient.on('error', (error: Error) => {
    console.error('[Main] Socket error:', error.message);
    updateTrayMenu('error');
    sendToRenderer('agent:error', { error: error.message });
  });

  // 연결 시작
  socketClient.connect();
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
  console.log('[Main] App ready');

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

app.on('before-quit', async () => {
  console.log('[Main] App quitting...');
  
  if (socketClient) {
    socketClient.disconnect();
  }
  
  if (deviceManager) {
    await deviceManager.stop();
  }
  
  if (workflowRunner) {
    await workflowRunner.cleanup();
  }
});

// ============================================
// 예외 처리
// ============================================

process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});
