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
import path from 'node:path';
import os from 'node:os';
import { SocketClient } from './socket/SocketClient';
import { DeviceManager, getDeviceManager } from './device/DeviceManager';
import { getAdbController } from './device/AdbController';
import { getAppiumController } from './device/AppiumController';
import { getScrcpyController } from './device/ScrcpyController';
import { ScrcpySessionManager, getScrcpySessionManager } from './device/ScrcpySessionManager';
import { FrameProcessor, type ThumbnailFrame } from './device/FrameProcessor';
import type { ScrcpyInputEvent, ScrcpyBatchInputEvent, ScrcpyStartEvent, ScrcpyStopEvent } from './socket/SocketClient';
import { getInfraHealthChecker, InfraHealthChecker } from './infra/InfraHealthChecker';
import { WorkflowRunner } from './workflow/WorkflowRunner';
import { AutoUpdater, getAutoUpdater } from './updater/AutoUpdater';
import { DeviceRecovery } from './recovery/DeviceRecovery';
import { NodeRecovery, getNodeRecovery, SavedState } from './recovery/NodeRecovery';
import { logger } from './utils/logger';
import { loadAppConfig, getAppConfig, getResourcePath } from './config/AppConfig';
import fs from 'node:fs';

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
// 단일 인스턴스 잠금
// ============================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.info('Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // 두 번째 인스턴스가 실행되면 기존 윈도우를 표시
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ============================================
// 환경 변수
// ============================================

const NODE_ID = process.env.NODE_ID || process.env.DOAIME_NODE_ID || `node_${os.hostname()}`;
let SERVER_URL = process.env.SERVER_URL || process.env.DOAIME_SERVER_URL || 'https://api.doai.me';
const IS_DEV = process.env.NODE_ENV === 'development';
const WORKER_SERVER_PORT = parseInt(process.env.WORKER_SERVER_PORT || '3001', 10);

// 패키징된 앱에서는 extraResources 경로, 개발 모드에서는 상대 경로
function getIconPath(filename = 'icon.ico'): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, filename);
  }
  return path.join(__dirname, '../resources', filename);
}

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
let infraHealthChecker: InfraHealthChecker | null = null;
let scrcpySessionManager: ScrcpySessionManager | null = null;
let frameProcessors: Map<string, FrameProcessor> = new Map();
let isAppQuitting = false;

// Manager components for Worker orchestration
let workerRegistry: WorkerRegistry | null = null;
let taskDispatcher: TaskDispatcher | null = null;
let workerServer: WorkerServer | null = null;
let screenStreamProxy: ScreenStreamProxy | null = null; // NOSONAR: kept alive for side-effect listeners

// ============================================
// 로그 링 버퍼 (v1.1.0)
// ============================================

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source?: string;
  context?: Record<string, unknown>;
}

const LOG_BUFFER_SIZE = 2000;
const logBuffer: LogEntry[] = [];

function pushLog(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  sendToRenderer('log-entry', entry);
}

// ============================================
// 히트맵 데이터 집계 (v1.1.0)
// ============================================

interface HeatmapCell {
  hour: number;
  day: number;
  value: number;
}

interface HeatmapData {
  hourly: HeatmapCell[];
  deviceHourly: Array<{ deviceId: string; hours: number[] }>;
  errorHourly: number[];
}

// 시간대별 활동 카운터 (24시간 × 7일)
const activityGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
const errorHourly: number[] = Array(24).fill(0);
const deviceActivity: Map<string, number[]> = new Map();

function recordActivity(deviceId?: string, isError = false): void {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat

  activityGrid[day][hour]++;

  if (isError) {
    errorHourly[hour]++;
  }

  if (deviceId) {
    if (!deviceActivity.has(deviceId)) {
      deviceActivity.set(deviceId, Array(24).fill(0));
    }
    const hours = deviceActivity.get(deviceId);
    if (hours) hours[hour]++;
  }
}

function getHeatmapData(): HeatmapData {
  const hourly: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      hourly.push({ hour, day, value: activityGrid[day][hour] });
    }
  }

  const deviceHourly: Array<{ deviceId: string; hours: number[] }> = [];
  for (const [deviceId, hours] of deviceActivity.entries()) {
    deviceHourly.push({ deviceId, hours: [...hours] });
  }

  return {
    hourly,
    deviceHourly,
    errorHourly: [...errorHourly],
  };
}

// ============================================
// 메인 윈도우
// ============================================

function createWindow(): void {
  try {
    const iconPath = getIconPath();
    const preloadPath = path.join(__dirname, 'preload.js');
    const htmlPath = path.join(__dirname, 'index.html');

    logger.info('Creating window', { iconPath, preloadPath, htmlPath, isPackaged: app.isPackaged });

    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
      icon: iconPath,
    });

    if (IS_DEV) {
      mainWindow.webContents.openDevTools();
    }

    // 렌더러 크래시 감지
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      logger.error('Renderer process gone', { reason: details.reason, exitCode: details.exitCode });
    });

    // 페이지 로드 실패 감지
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logger.error('Page failed to load', { errorCode, errorDescription, validatedURL });
      // 로드 실패 시에도 윈도우 표시 (에러가 보이도록)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
    });

    // 콘솔 메시지 캡처 (렌더러 JS 에러 디버깅용)
    mainWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) { // warning 이상
        logger.warn('Renderer console', { level, message: message.substring(0, 200) });
      }
    });

    // loadFile Promise 에러 핸들링
    mainWindow.loadFile(htmlPath)
      .then(() => {
        logger.info('loadFile succeeded', { htmlPath });
      })
      .catch((err) => {
        logger.error('loadFile failed', { error: (err as Error).message, htmlPath });
        // 로드 실패 시에도 윈도우 표시
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      });

    mainWindow.once('ready-to-show', () => {
      logger.info('Window ready-to-show');
      mainWindow?.show();
    });

    // 안전장치: 3초 후에도 윈도우가 안 보이면 강제 표시
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        logger.warn('Window not visible after 3s, forcing show');
        mainWindow.show();
      }
    }, 3000);

    mainWindow.on('close', (event) => {
      if (!isAppQuitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    logger.info('createWindow completed');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('createWindow CRASHED', { error: msg, stack: (error as Error).stack });
    // 긴급 폴백: 최소한의 윈도우 생성
    try {
      mainWindow = new BrowserWindow({ width: 600, height: 400, show: true });
      mainWindow.loadURL(`data:text/html,<h1>Error: ${encodeURIComponent(msg)}</h1><p>Desktop Agent window failed to initialize.</p>`);
    } catch (fallbackErr) {
      logger.error('Fallback window creation also failed', { error: (fallbackErr as Error).message });
    }
  }
}

// ============================================
// 시스템 트레이
// ============================================

function createTray(): void {
  try {
    const iconPath = getIconPath();
    logger.info('Creating tray', { iconPath });
    const icon = nativeImage.createFromPath(iconPath);

    if (icon.isEmpty()) {
      logger.warn('Tray icon is empty, skipping tray creation', { iconPath });
      return;
    }

    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip(`DOAI Agent (${NODE_ID})`);

    updateTrayMenu('disconnected');

    tray.on('double-click', () => {
      mainWindow?.show();
    });

    logger.info('Tray created successfully');
  } catch (error) {
    logger.error('Failed to create tray', { error: (error as Error).message });
    // 트레이 실패해도 앱은 계속 실행
  }
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
    pushLog({ timestamp: Date.now(), level: 'warn', message: `디바이스 연결 해제: ${deviceId}`, source: 'device' });
    recordActivity(deviceId, true);
    broadcastDeviceUpdate();
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
    pushLog({ timestamp: Date.now(), level: 'info', message: `디바이스 재연결 성공: ${deviceId}`, source: 'device' });
    recordActivity(deviceId);
    broadcastDeviceUpdate();
  });

  deviceRecovery.start();

  // 인프라 헬스체커 초기화
  infraHealthChecker = getInfraHealthChecker(SERVER_URL);

  // 노드 복구 초기화
  nodeRecovery = getNodeRecovery();

  // Socket.IO 클라이언트 초기화
  const appConfig = getAppConfig();
  socketClient = new SocketClient(
    {
      serverUrl: SERVER_URL,
      nodeId: NODE_ID,
      pcId: appConfig.pcId,
      workerToken: appConfig.workerToken,
    },
    deviceManager,
    workflowRunner
  );

  // Socket 이벤트 핸들러
  socketClient.on('connected', async () => {
    logger.info('Connected to server');
    updateTrayMenu('connected');
    sendToRenderer('agent:connected');
    sendToRenderer('server-status', { connected: true, message: '연결됨' });
    // renderer 초기화 완료 후에도 상태를 받을 수 있도록 재전송
    setTimeout(() => {
      sendToRenderer('server-status', { connected: true, message: '연결됨' });
    }, 2000);
    pushLog({ timestamp: Date.now(), level: 'info', message: '서버 연결 성공', source: 'system' });
    recordActivity();

    // 이전 상태 복구 시도
    if (nodeRecovery) {
      if (socketClient) {
        await nodeRecovery.recover(socketClient);
      }
    }
  });

  socketClient.on('disconnected', (reason: string) => {
    logger.warn('Disconnected from server', { reason });
    updateTrayMenu('disconnected');
    sendToRenderer('agent:disconnected', { reason });
    sendToRenderer('server-status', { connected: false, message: '연결 끊김' });
    pushLog({ timestamp: Date.now(), level: 'warn', message: `서버 연결 끊김: ${reason}`, source: 'system' });
  });

  socketClient.on('error', (error: Error) => {
    logger.error('Socket error', { error: error.message });
    updateTrayMenu('error');
    sendToRenderer('agent:error', { error: error.message });
    sendToRenderer('server-status', { connected: false, message: '오류' });
    pushLog({ timestamp: Date.now(), level: 'error', message: `소켓 오류: ${error.message}`, source: 'system' });
    recordActivity(undefined, true);
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
  // ScrcpySessionManager 초기화
  // ============================================

  try {
    const serverJarPath = getResourcePath('scrcpy-server.jar');
    scrcpySessionManager = getScrcpySessionManager({
      serverJarPath,
      portStart: 27183,
      portEnd: 27283,
      defaultMaxSize: 720,
      defaultMaxFps: 30,
      defaultBitRate: 2_000_000,
      maxSessions: 100,
    });

    // WorkflowRunner에 scrcpy manager 주입
    workflowRunner.setScrcpyManager(scrcpySessionManager);

    // scrcpy 세션 이벤트 → SocketClient 전달
    scrcpySessionManager.on('sessionStateChanged', (deviceId: string, state: string) => {
      socketClient?.sendScrcpySessionState(deviceId, state);
      sendToRenderer('scrcpy:stateChanged', { deviceId, state });
    });

    scrcpySessionManager.on('videoMeta', (deviceId: string, meta: { codecId: number; width: number; height: number }) => {
      socketClient?.sendScrcpyVideoMeta(deviceId, meta);

      // 비디오 메타 수신 시 FrameProcessor 자동 생성
      if (!frameProcessors.has(deviceId)) {
        const fp = new FrameProcessor(deviceId, { thumbnailWidth: 160, jpegQuality: 60, maxFps: 1 });
        fp.on('thumbnail', (thumb: ThumbnailFrame) => {
          socketClient?.sendScrcpyThumbnail(thumb.deviceId, thumb.data, thumb.width, thumb.height);
          sendToRenderer('scrcpy:thumbnail', { deviceId: thumb.deviceId, data: thumb.data.toString('base64'), width: thumb.width, height: thumb.height });
        });
        fp.start(meta.width, meta.height);
        frameProcessors.set(deviceId, fp);
      }
    });

    scrcpySessionManager.on('frame', (deviceId: string, data: Buffer, header: { isConfig: boolean; isKeyFrame: boolean; pts: bigint; packetSize: number }) => {
      const fp = frameProcessors.get(deviceId);
      if (fp?.running) {
        fp.feedFrame(data, header);
      }
    });

    scrcpySessionManager.on('sessionError', (deviceId: string, error: Error) => {
      pushLog({ timestamp: Date.now(), level: 'error', message: `scrcpy 세션 오류 (${deviceId}): ${error.message}`, source: 'device' });
    });

    // SocketClient → ScrcpySessionManager 이벤트 바인딩
    socketClient.on('scrcpy:start', async (data: ScrcpyStartEvent) => {
      try {
        await scrcpySessionManager!.startSession(data.device_id, data.adb_serial, data.options);
        pushLog({ timestamp: Date.now(), level: 'info', message: `scrcpy 세션 시작: ${data.device_id}`, source: 'device' });
      } catch (err) {
        logger.error('scrcpy:start failed', { deviceId: data.device_id, error: (err as Error).message });
        pushLog({ timestamp: Date.now(), level: 'error', message: `scrcpy 세션 시작 실패 (${data.device_id}): ${(err as Error).message}`, source: 'device' });
      }
    });

    socketClient.on('scrcpy:stop', async (data: ScrcpyStopEvent) => {
      try {
        // FrameProcessor 정리
        const fp = frameProcessors.get(data.device_id);
        if (fp) {
          fp.stop();
          frameProcessors.delete(data.device_id);
        }
        await scrcpySessionManager!.stopSession(data.device_id);
        pushLog({ timestamp: Date.now(), level: 'info', message: `scrcpy 세션 종료: ${data.device_id}`, source: 'device' });
      } catch (err) {
        logger.error('scrcpy:stop failed', { deviceId: data.device_id, error: (err as Error).message });
      }
    });

    socketClient.on('scrcpy:input', async (data: ScrcpyInputEvent) => {
      const session = scrcpySessionManager!.getSession(data.device_id);
      if (!session) return;
      try {
        const p = data.params;
        switch (data.type) {
          case 'tap': await session.tap(p.x as number, p.y as number); break;
          case 'swipe': await session.swipe(p.x1 as number, p.y1 as number, p.x2 as number, p.y2 as number, (p.duration as number) ?? 300); break;
          case 'text': session.injectText(p.text as string); break;
          case 'key': await session.injectKey(p.keycode as number); break;
          case 'scroll': session.injectScroll(p.x as number, p.y as number, p.dx as number, p.dy as number); break;
          case 'back': session.pressBack(); break;
          case 'longPress': await session.longPress(p.x as number, p.y as number, (p.duration as number) ?? 1000); break;
        }
      } catch (err) {
        logger.error('scrcpy:input failed', { deviceId: data.device_id, type: data.type, error: (err as Error).message });
      }
    });

    socketClient.on('scrcpy:batchInput', async (data: ScrcpyBatchInputEvent) => {
      try {
        const p = data.params;
        switch (data.type) {
          case 'tap': await scrcpySessionManager!.batchTap(data.device_ids, p.x as number, p.y as number); break;
          case 'swipe': await scrcpySessionManager!.batchSwipe(data.device_ids, p.x1 as number, p.y1 as number, p.x2 as number, p.y2 as number, (p.duration as number) ?? 300); break;
          case 'text': await scrcpySessionManager!.batchText(data.device_ids, p.text as string); break;
          case 'key': await scrcpySessionManager!.batchKey(data.device_ids, p.keycode as number); break;
          case 'back': await scrcpySessionManager!.batchBack(data.device_ids); break;
        }
      } catch (err) {
        logger.error('scrcpy:batchInput failed', { type: data.type, error: (err as Error).message });
      }
    });

    logger.info('[ScrcpySessionManager] Initialized', { serverJarPath });
    pushLog({ timestamp: Date.now(), level: 'info', message: 'scrcpy 세션 매니저 초기화 완료', source: 'system' });
  } catch (err) {
    logger.error('ScrcpySessionManager init failed (non-fatal)', { error: (err as Error).message });
    pushLog({ timestamp: Date.now(), level: 'error', message: `scrcpy 초기화 실패: ${(err as Error).message}`, source: 'system' });
  }

  // ============================================
  // Manager Components 초기화 (Worker 오케스트레이션)
  // ============================================

  try {
    await initializeManagerComponents();
  } catch (err) {
    logger.error('Manager components init failed (non-fatal)', { error: (err as Error).message });
    pushLog({ timestamp: Date.now(), level: 'error', message: `Manager 초기화 실패: ${(err as Error).message}`, source: 'system' });
  }

  // 디바이스 상태 변경 시 renderer에 브로드캐스트
  deviceManager.on('device:connected', (device: { serial: string }) => {
    pushLog({ timestamp: Date.now(), level: 'info', message: `디바이스 연결: ${device.serial}`, source: 'device' });
    recordActivity(device.serial);
    broadcastDeviceUpdate();
  });

  deviceManager.on('device:disconnected', (device: { serial: string }) => {
    pushLog({ timestamp: Date.now(), level: 'warn', message: `디바이스 연결 해제: ${device.serial}`, source: 'device' });
    recordActivity(device.serial, true);
    broadcastDeviceUpdate();
  });

  deviceManager.on('device:stateChanged', (device: { serial: string; state: string }) => {
    pushLog({ timestamp: Date.now(), level: 'info', message: `디바이스 상태 변경: ${device.serial} → ${device.state}`, source: 'device' });
    recordActivity(device.serial);
    broadcastDeviceUpdate();
  });

  pushLog({ timestamp: Date.now(), level: 'info', message: 'Desktop Agent 시작 완료', source: 'system' });
  logger.info('Desktop Agent started successfully');
}

// ============================================
// 디바이스 상태 브로드캐스트 (v1.1.0)
// ============================================

function mapDevicesToDTO(devices: ReturnType<DeviceManager['getAllDevices']>) {
  return devices.map(d => ({
    id: d.serial,
    serial: d.serial,
    name: d.model || d.serial,
    model: d.model || 'Unknown',
    status: d.state?.toLowerCase() || 'offline',
    battery: d.battery ?? 0,
    lastActivity: d.lastSeen || Date.now(),
    state: d.state,
  }));
}

function broadcastDeviceUpdate(): void {
  const devices = mapDevicesToDTO(deviceManager?.getAllDevices() || []);
  sendToRenderer('device-update', devices);
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
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Manager] Failed to initialize Manager components (non-fatal)', { error: msg });
    // EADDRINUSE 등 — 다른 인스턴스가 실행 중일 수 있음. throw 하지 않고 계속 진행
    // Worker 오케스트레이션 없이 기본 기능은 사용 가능
  }
}

// ============================================
// 접속설정 헬퍼 (config.json의 connectionTargets)
// ============================================

interface ConnectionSettings {
  wifi: string[];
  otg: string[];
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConnectionSettings(): ConnectionSettings {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return { wifi: [], otg: [] };
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return raw.connectionTargets || { wifi: [], otg: [] };
  } catch {
    return { wifi: [], otg: [] };
  }
}

function saveConnectionSettings(settings: ConnectionSettings): void {
  try {
    const configPath = getConfigPath();
    let raw: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    raw.connectionTargets = settings;
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');
    logger.info('[ConnectionSettings] Saved', { wifi: settings.wifi.length, otg: settings.otg.length });
  } catch (error) {
    logger.error('[ConnectionSettings] Save failed', { error: (error as Error).message });
  }
}

// ============================================
// IPC 핸들러
// ============================================

function setupIPC(): void {
  // 앱 재시작
  ipcMain.handle('restart-app', () => {
    logger.info('Restarting app via IPC');
    app.relaunch();
    app.quit();
  });

  // 에이전트 상태 조회 (기존 채널 유지)
  ipcMain.handle('agent:getStatus', () => {
    return {
      nodeId: NODE_ID,
      serverUrl: SERVER_URL,
      connected: socketClient?.connected || false,
      deviceCount: deviceManager?.getConnectedDevices().length || 0,
    };
  });

  // 디바이스 목록 조회 (기존 채널 유지)
  ipcMain.handle('devices:list', () => {
    return deviceManager?.getAllDevices() || [];
  });

  // 로그 조회 (기존 채널 유지)
  ipcMain.handle('logs:get', () => {
    return [...logBuffer];
  });

  // ============================================
  // v1.1.0: preload.js `api` 네임스페이스 대응 IPC 핸들러
  // ============================================

  // 설정 조회
  ipcMain.handle('get-config', () => {
    return {
      nodeId: NODE_ID,
      serverUrl: SERVER_URL,
      connected: socketClient?.connected || false,
    };
  });

  // 노드 종합 상태 조회 (v1.2.0)
  ipcMain.handle('get-node-status', () => {
    return {
      nodeId: NODE_ID,
      serverConnected: socketClient?.connected || false,
      workerServerRunning: workerServer?.isRunning() || false,
      workerServerPort: workerServer?.getPort() || WORKER_SERVER_PORT,
      connectedWorkers: workerServer?.getConnectedWorkerCount() || 0,
      deviceCount: deviceManager?.getConnectedDevices().length || 0,
    };
  });

  // 디바이스 목록 조회
  ipcMain.handle('get-devices', () => {
    return mapDevicesToDTO(deviceManager?.getAllDevices() || []);
  });

  // 로그 조회
  ipcMain.handle('get-logs', () => {
    return [...logBuffer];
  });

  // 서버 연결 상태 조회
  ipcMain.handle('get-server-status', () => {
    return {
      connected: socketClient?.connected || false,
      message: socketClient?.connected ? '연결됨' : '연결 끊김',
    };
  });

  // 워크플로우 상태 조회
  ipcMain.handle('get-workflow-status', () => {
    const running = workflowRunner?.getRunningWorkflows() || [];
    return {
      running: running.map(w => ({
        workflowId: w.workflowId,
        executionId: w.executionId,
        deviceId: w.deviceId,
        currentStep: w.currentStep,
        progress: w.progress,
        startedAt: w.startedAt,
      })),
      count: running.length,
    };
  });

  // 서버 재연결
  ipcMain.handle('reconnect-server', () => {
    if (socketClient) {
      socketClient.disconnect();
      socketClient.connect();
      return { success: true, message: '재연결 시도 중...' };
    }
    return { success: false, message: 'Socket client not initialized' };
  });

  // 디바이스 상세 조회
  ipcMain.handle('get-device-detail', async (_event, serial: string) => {
    const device = deviceManager?.getDevice(serial);
    if (!device) return null;

    const adb = getAdbController();
    let battery = 0;
    let screenOn = false;
    try {
      battery = await adb.getBatteryLevel(serial);
      screenOn = await adb.isScreenOn(serial);
    } catch (error) {
      logger.debug('Failed to get device details', { serial, error: (error as Error).message });
    }

    return {
      serial: device.serial,
      model: device.model || 'Unknown',
      state: device.state,
      battery,
      screenOn,
      lastSeen: device.lastSeen || Date.now(),
    };
  });

  // 디바이스 명령 실행
  ipcMain.handle('execute-device-action', async (_event, serial: string, action: string) => {
    const adb = getAdbController();
    try {
      switch (action) {
        case 'reboot':
          await adb.execute(serial, 'reboot');
          pushLog({ timestamp: Date.now(), level: 'info', message: `디바이스 재부팅: ${serial}`, source: 'device' });
          return { success: true, message: '재부팅 명령 전송됨' };
        case 'reconnect':
          await adb.reconnect(serial);
          pushLog({ timestamp: Date.now(), level: 'info', message: `디바이스 재연결: ${serial}`, source: 'device' });
          return { success: true, message: '재연결 완료' };
        case 'wake':
          await adb.wakeUp(serial);
          return { success: true, message: '화면 켜기 완료' };
        case 'sleep':
          await adb.sleep(serial);
          return { success: true, message: '화면 끄기 완료' };
        default:
          return { success: false, message: `알 수 없는 명령: ${action}` };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      pushLog({ timestamp: Date.now(), level: 'error', message: `디바이스 명령 실패 (${action}): ${msg}`, source: 'device' });
      return { success: false, message: msg };
    }
  });

  // 히트맵 데이터 조회
  ipcMain.handle('get-heatmap-data', () => {
    return getHeatmapData();
  });

  // ============================================
  // 인프라 헬스체크 IPC 핸들러
  // ============================================

  // 인프라 헬스 조회 (캐시된 결과)
  ipcMain.handle('get-infra-health', async () => {
    if (!infraHealthChecker) return null;
    try {
      return await infraHealthChecker.check(false);
    } catch (error) {
      logger.error('get-infra-health failed', { error: (error as Error).message });
      return null;
    }
  });

  // 인프라 점검 실행 (강제 갱신)
  ipcMain.handle('run-infra-check', async () => {
    if (!infraHealthChecker) return null;
    try {
      pushLog({ timestamp: Date.now(), level: 'info', message: '인프라 점검 시작', source: 'system' });
      const result = await infraHealthChecker.check(true);
      pushLog({ timestamp: Date.now(), level: 'info', message: '인프라 점검 완료', source: 'system' });
      return result;
    } catch (error) {
      const msg = (error as Error).message;
      pushLog({ timestamp: Date.now(), level: 'error', message: `인프라 점검 실패: ${msg}`, source: 'system' });
      logger.error('run-infra-check failed', { error: msg });
      return null;
    }
  });

  // ============================================
  // scrcpy IPC 핸들러
  // ============================================

  // scrcpy 시작
  ipcMain.handle('start-scrcpy', async (_event, serial: string) => {
    try {
      const scrcpy = getScrcpyController();
      scrcpy.startStream(serial);
      pushLog({ timestamp: Date.now(), level: 'info', message: `scrcpy 시작: ${serial}`, source: 'device' });
      return { success: true };
    } catch (error) {
      const msg = (error as Error).message;
      pushLog({ timestamp: Date.now(), level: 'error', message: `scrcpy 시작 실패: ${msg}`, source: 'device' });
      return { success: false, message: msg };
    }
  });

  // scrcpy 중지
  ipcMain.handle('stop-scrcpy', async (_event, serial: string) => {
    try {
      const scrcpy = getScrcpyController();
      scrcpy.stopStream(serial);
      pushLog({ timestamp: Date.now(), level: 'info', message: `scrcpy 종료: ${serial}`, source: 'device' });
      return { success: true };
    } catch (error) {
      const msg = (error as Error).message;
      pushLog({ timestamp: Date.now(), level: 'error', message: `scrcpy 종료 실패: ${msg}`, source: 'device' });
      return { success: false, message: msg };
    }
  });

  // scrcpy 활성 상태 조회
  ipcMain.handle('is-scrcpy-active', (_event, serial: string) => {
    const scrcpy = getScrcpyController();
    return scrcpy.isStreaming(serial);
  });

  // ============================================
  // scrcpy 세션 IPC 핸들러 (ScrcpySessionManager)
  // ============================================

  // scrcpy 세션 시작 (프로토콜 기반)
  ipcMain.handle('scrcpy-session:start', async (_event, deviceId: string, adbSerial: string) => {
    if (!scrcpySessionManager) return { success: false, message: 'ScrcpySessionManager not initialized' };
    try {
      await scrcpySessionManager.startSession(deviceId, adbSerial);
      return { success: true };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  });

  // scrcpy 세션 종료
  ipcMain.handle('scrcpy-session:stop', async (_event, deviceId: string) => {
    if (!scrcpySessionManager) return { success: false, message: 'ScrcpySessionManager not initialized' };
    try {
      const fp = frameProcessors.get(deviceId);
      if (fp) { fp.stop(); frameProcessors.delete(deviceId); }
      await scrcpySessionManager.stopSession(deviceId);
      return { success: true };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  });

  // scrcpy 세션 목록 조회
  ipcMain.handle('scrcpy-session:list', () => {
    if (!scrcpySessionManager) return [];
    return scrcpySessionManager.getAllSessionInfo();
  });

  // scrcpy 입력 (단일 디바이스)
  ipcMain.handle('scrcpy-session:input', async (_event, deviceId: string, type: string, params: Record<string, unknown>) => {
    if (!scrcpySessionManager) return { success: false, message: 'ScrcpySessionManager not initialized' };
    const session = scrcpySessionManager.getSession(deviceId);
    if (!session) return { success: false, message: 'No active session' };
    try {
      switch (type) {
        case 'tap': await session.tap(params.x as number, params.y as number); break;
        case 'swipe': await session.swipe(params.x1 as number, params.y1 as number, params.x2 as number, params.y2 as number, (params.duration as number) ?? 300); break;
        case 'text': session.injectText(params.text as string); break;
        case 'key': await session.injectKey(params.keycode as number); break;
        case 'back': session.pressBack(); break;
        case 'scroll': session.injectScroll(params.x as number, params.y as number, params.dx as number, params.dy as number); break;
        case 'longPress': await session.longPress(params.x as number, params.y as number, (params.duration as number) ?? 1000); break;
        default: return { success: false, message: `Unknown input type: ${type}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  });

  // ============================================
  // APK 관리 IPC 핸들러
  // ============================================

  // 번들된 APK 목록 조회
  ipcMain.handle('get-bundled-apks', async () => {
    try {
      const apksDir = getResourcePath('apks');
      if (!fs.existsSync(apksDir)) return [];
      const files = fs.readdirSync(apksDir).filter(f => f.endsWith('.apk'));
      return files.map(fileName => ({
        fileName,
        name: fileName.replace('.apk', ''),
        path: path.join(apksDir, fileName),
        size: fs.statSync(path.join(apksDir, fileName)).size,
      }));
    } catch (error) {
      logger.error('get-bundled-apks failed', { error: (error as Error).message });
      return [];
    }
  });

  // 선택한 APK를 디바이스에 설치
  ipcMain.handle('install-apk', async (_event, serial: string, apkFileName: string) => {
    try {
      // 파일 이름 검증 (경로 순회 + 명령 인젝션 방지)
      if (!/^[\w\-.]+\.apk$/i.test(apkFileName)) {
        return { success: false, message: '잘못된 파일 이름' };
      }

      const apkPath = getResourcePath(path.join('apks', apkFileName));
      if (!fs.existsSync(apkPath)) {
        return { success: false, message: `APK 파일 없음: ${apkFileName}` };
      }

      pushLog({ timestamp: Date.now(), level: 'info', message: `APK 설치 시작: ${apkFileName} → ${serial}`, source: 'device' });

      const adb = getAdbController();
      const output = await adb.execute(serial, `install -r -g '${apkPath}'`);

      if (output.toLowerCase().includes('failure')) {
        pushLog({ timestamp: Date.now(), level: 'error', message: `APK 설치 실패: ${output}`, source: 'device' });
        return { success: false, message: `설치 실패: ${output}` };
      }

      pushLog({ timestamp: Date.now(), level: 'info', message: `APK 설치 완료: ${apkFileName} → ${serial}`, source: 'device' });
      return { success: true, message: '설치 완료' };
    } catch (error) {
      const msg = (error as Error).message;
      pushLog({ timestamp: Date.now(), level: 'error', message: `APK 설치 오류: ${msg}`, source: 'device' });
      return { success: false, message: msg };
    }
  });

  // ============================================
  // 접속설정 IPC 핸들러 (v1.2.3)
  // ============================================

  // 접속설정 조회
  ipcMain.handle('get-connection-settings', () => {
    return loadConnectionSettings();
  });

  // 접속설정 저장
  ipcMain.handle('save-connection-settings', (_event, settings: { wifi: string[]; otg: string[] }) => {
    saveConnectionSettings(settings);
    return { success: true };
  });

  // USB 디바이스 스캔 (adb devices)
  ipcMain.handle('scan-usb-devices', async () => {
    try {
      const adb = getAdbController();
      const devices = await adb.getConnectedDevices();
      pushLog({ timestamp: Date.now(), level: 'info', message: `USB 스캔 완료: ${devices.length}대`, source: 'device' });
      broadcastDeviceUpdate();
      return { success: true, devices };
    } catch (error) {
      const msg = (error as Error).message;
      pushLog({ timestamp: Date.now(), level: 'error', message: `USB 스캔 실패: ${msg}`, source: 'device' });
      return { success: false, devices: [], message: msg };
    }
  });

  // WiFi/OTG 대상 일괄 ADB 연결
  ipcMain.handle('connect-adb-targets', async (_event, type: 'wifi' | 'otg') => {
    const settings = loadConnectionSettings();
    const targets = settings[type] || [];

    if (targets.length === 0) {
      return { success: false, results: [], message: '연결 대상이 없습니다' };
    }

    const adb = getAdbController();
    const results: Array<{ ip: string; success: boolean; message: string }> = [];

    for (const target of targets) {
      try {
        const match = target.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
        if (!match) {
          results.push({ ip: target, success: false, message: '잘못된 형식' });
          continue;
        }
        const success = await adb.reconnectWifiAdb(match[1], Number(match[2]));
        results.push({ ip: target, success, message: success ? '연결됨' : '연결 실패' });
        pushLog({
          timestamp: Date.now(),
          level: success ? 'info' : 'warn',
          message: `ADB ${type} 연결 ${success ? '성공' : '실패'}: ${target}`,
          source: 'device',
        });
      } catch (error) {
        const msg = (error as Error).message;
        results.push({ ip: target, success: false, message: msg });
        pushLog({ timestamp: Date.now(), level: 'error', message: `ADB 연결 오류 (${target}): ${msg}`, source: 'device' });
      }
    }

    // 연결 후 디바이스 목록 갱신
    setTimeout(() => broadcastDeviceUpdate(), 2000);

    return { success: true, results };
  });

  // 단일 IP로 ADB 연결
  ipcMain.handle('connect-adb-ip', async (_event, ip: string) => {
    try {
      const adb = getAdbController();
      const match = ip.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
      if (!match) {
        return { success: false, message: '잘못된 IP:Port 형식' };
      }
      const success = await adb.reconnectWifiAdb(match[1], Number(match[2]));
      if (success) {
        pushLog({ timestamp: Date.now(), level: 'info', message: `ADB 연결 성공: ${ip}`, source: 'device' });
        setTimeout(() => broadcastDeviceUpdate(), 2000);
      }
      return { success, message: success ? '연결됨' : '연결 실패' };
    } catch (error) {
      const msg = (error as Error).message;
      return { success: false, message: msg };
    }
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
// App 종료 시 정리 헬퍼 함수들
// ============================================

/**
 * 노드 상태 저장
 */
async function saveNodeState(): Promise<void> {
  if (!nodeRecovery) return;
  
  const state: Omit<SavedState, 'timestamp' | 'version'> = {
    nodeId: NODE_ID,
    runningWorkflows: workflowRunner?.getRunningWorkflows?.() || [],
    deviceStates: deviceManager?.getAllStates() || {},
  };
  await nodeRecovery.saveBeforeQuit(state);
}

/**
 * Manager 컴포넌트 정리
 */
async function cleanupManagerComponents(): Promise<void> {
  if (workerServer) {
    logger.info('[Manager] Stopping worker server...');
    await workerServer.stop();
  }

  if (workerRegistry) {
    logger.info('[Manager] Stopping worker registry...');
    workerRegistry.stop();
  }
  // Note: ScreenStreamProxy doesn't have cleanup method - streams are terminated when workers disconnect
}

/**
 * ScrcpySessionManager 및 FrameProcessors 정리
 */
async function cleanupScrcpySessions(): Promise<void> {
  if (!scrcpySessionManager) return;
  
  logger.info('Stopping all scrcpy sessions...');
  for (const fp of frameProcessors.values()) {
    fp.stop();
  }
  frameProcessors.clear();
  await scrcpySessionManager.stopAll();
}

/**
 * Appium 서버 및 scrcpy 스트림 정리
 */
function cleanupAppiumAndScrcpy(): void {
  const appiumCtrl = getAppiumController();
  if (appiumCtrl.isServerRunning()) {
    logger.info('Stopping Appium server...');
    appiumCtrl.stopServer();
  }
  const scrcpyCtrl = getScrcpyController();
  scrcpyCtrl.stopAllStreams();
}

/**
 * 나머지 컴포넌트 정리 (동기)
 */
function cleanupRemainingComponents(): void {
  deviceRecovery?.stop();
  autoUpdater?.stop();
  nodeRecovery?.stopAutoBackup();
  socketClient?.disconnect();
  deviceManager?.stop();
}

/**
 * App 종료 시 전체 정리 수행
 */
async function performCleanup(): Promise<void> {
  await saveNodeState();
  await cleanupManagerComponents();

  try {
    await cleanupScrcpySessions();
  } catch (cleanupErr) {
    logger.error('Error cleaning up ScrcpySessionManager', { error: (cleanupErr as Error).message });
  }

  try {
    cleanupAppiumAndScrcpy();
  } catch (cleanupErr) {
    logger.error('Error cleaning up Appium/scrcpy', { error: (cleanupErr as Error).message });
  }

  cleanupRemainingComponents();

  if (workflowRunner) {
    await workflowRunner.cleanup();
  }
}

// ============================================
// App 라이프사이클
// ============================================

app.on('ready', async () => {
  logger.info('App ready', {
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    resourcesPath: process.resourcesPath,
    __dirname,
    userData: app.getPath('userData'),
  });

  try {
    // 설정 로드 (v1.2.0)
    const appConfig = loadAppConfig();
    // config.json의 backendBaseUrl을 SERVER_URL에 반영
    if (appConfig.backendBaseUrl) {
      SERVER_URL = appConfig.backendBaseUrl;
      logger.info('SERVER_URL overridden by config', { serverUrl: SERVER_URL });
    }
  } catch (err) {
    logger.error('loadAppConfig failed', { error: (err as Error).message });
  }

  createWindow();
  createTray();
  setupIPC();

  // 약간의 딜레이 후 에이전트 시작
  setTimeout(() => {
    startAgent().catch((err) => {
      logger.error('startAgent failed', { error: (err as Error).message });
    });
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
    await performCleanup();
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
