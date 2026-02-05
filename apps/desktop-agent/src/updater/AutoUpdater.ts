/**
 * Auto Updater
 * 
 * Electron 앱 자동 업데이트 관리
 */

import { autoUpdater, UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater';
import { app, BrowserWindow, ipcMain } from 'electron';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * 업데이트 상태
 */
export type UpdateStatus = 
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/**
 * 업데이트 이벤트 타입
 */
export interface UpdateEvent {
  status: UpdateStatus;
  info?: UpdateInfo;
  progress?: ProgressInfo;
  error?: string;
}

/**
 * 자동 업데이트 관리자
 */
export class AutoUpdater extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;
  private status: UpdateStatus = 'idle';
  private checkInterval: NodeJS.Timeout | null = null;
  private initialCheckTimeout: NodeJS.Timeout | null = null;  // Track initial check timer
  private pendingUpdate: UpdateInfo | null = null;

  // 설정
  private readonly CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1시간
  private readonly INITIAL_CHECK_DELAY_MS = 60 * 1000; // 1분

  constructor(mainWindow?: BrowserWindow) {
    super();
    this.mainWindow = mainWindow || null;
  }

  /**
   * 초기화
   */
  init(): void {
    logger.info('Initializing auto updater');

    // 기본 설정
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    // 업데이트 서버 URL (환경변수로 오버라이드 가능)
    if (process.env.UPDATE_SERVER_URL) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: process.env.UPDATE_SERVER_URL,
      });
      logger.info('Update server URL set', { url: process.env.UPDATE_SERVER_URL });
    }

    // 이벤트 핸들러 설정
    this.setupEventHandlers();

    // IPC 핸들러 설정
    this.setupIpcHandlers();

    // 주기적 체크 스케줄
    this.scheduleCheck();

    logger.info('Auto updater initialized', {
      version: app.getVersion(),
      autoDownload: autoUpdater.autoDownload,
    });
  }

  /**
   * MainWindow 설정
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 이벤트 핸들러 설정
   */
  private setupEventHandlers(): void {
    autoUpdater.on('checking-for-update', () => {
      this.status = 'checking';
      logger.info('Checking for updates...');
      this.sendToRenderer('update-checking');
      this.emit('checking');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.status = 'available';
      logger.info('Update available', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
      this.sendToRenderer('update-available', info);
      this.emit('available', info);
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.status = 'not-available';
      logger.debug('No updates available', { currentVersion: app.getVersion() });
      this.sendToRenderer('update-not-available', info);
      this.emit('not-available', info);
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.status = 'downloading';
      logger.debug('Download progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      });
      this.sendToRenderer('update-progress', progress);
      this.emit('progress', progress);
    });

    autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
      this.status = 'downloaded';
      this.pendingUpdate = event;
      
      logger.info('Update downloaded', {
        version: event.version,
        releaseDate: event.releaseDate,
      });
      
      this.sendToRenderer('update-downloaded', event);
      this.emit('downloaded', event);

      // 서버에 업데이트 대기 중 알림 (Socket.IO 연결 시)
      this.emit('update-pending', {
        currentVersion: app.getVersion(),
        newVersion: event.version,
      });
    });

    autoUpdater.on('error', (error: Error) => {
      this.status = 'error';
      logger.error('Update error', { error: error.message });
      this.sendToRenderer('update-error', error.message);
      this.emit('error', error);
    });
  }

  /**
   * IPC 핸들러 설정 (Renderer와 통신)
   */
  private setupIpcHandlers(): void {
    // 수동 업데이트 체크 요청
    ipcMain.handle('check-for-updates', async () => {
      return this.checkForUpdates();
    });

    // 업데이트 다운로드 요청
    ipcMain.handle('download-update', async () => {
      return this.downloadUpdate();
    });

    // 업데이트 설치 및 재시작
    ipcMain.handle('install-update', () => {
      this.quitAndInstall();
    });

    // 현재 상태 조회
    ipcMain.handle('get-update-status', () => {
      return {
        status: this.status,
        currentVersion: app.getVersion(),
        pendingUpdate: this.pendingUpdate,
      };
    });
  }

  /**
   * Renderer로 이벤트 전송
   */
  private sendToRenderer(event: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  /**
   * 주기적 업데이트 체크 스케줄
   */
  private scheduleCheck(): void {
    // 앱 시작 후 1분 뒤 첫 체크 (track the timeout)
    this.initialCheckTimeout = setTimeout(() => {
      this.initialCheckTimeout = null;  // Clear reference after execution
      this.checkForUpdates();
    }, this.INITIAL_CHECK_DELAY_MS);

    // 이후 1시간마다 체크
    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, this.CHECK_INTERVAL_MS);

    logger.debug('Update check scheduled', {
      initialDelay: this.INITIAL_CHECK_DELAY_MS,
      interval: this.CHECK_INTERVAL_MS,
    });
  }

  /**
   * 업데이트 체크
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (this.status === 'checking' || this.status === 'downloading') {
      logger.debug('Update check already in progress');
      return null;
    }

    try {
      logger.info('Checking for updates');
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo || null;
    } catch (error) {
      logger.error('Failed to check for updates', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * 업데이트 다운로드
   */
  async downloadUpdate(): Promise<boolean> {
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      logger.error('Failed to download update', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * 업데이트 설치 및 앱 재시작
   */
  quitAndInstall(): void {
    logger.info('Quitting and installing update');
    
    // 강제 종료 옵션: false = 창 닫기 전 저장 허용
    // 재시작 옵션: true = 설치 후 앱 재시작
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * 현재 상태 반환
   */
  getStatus(): UpdateStatus {
    return this.status;
  }

  /**
   * 대기 중인 업데이트 정보
   */
  getPendingUpdate(): UpdateInfo | null {
    return this.pendingUpdate;
  }

  /**
   * 업데이트 체크 중지
   */
  stop(): void {
    if (this.initialCheckTimeout) {
      clearTimeout(this.initialCheckTimeout);
      this.initialCheckTimeout = null;
    }
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    logger.info('Auto updater stopped');
  }

  /**
   * 자동 다운로드 설정
   */
  setAutoDownload(enabled: boolean): void {
    autoUpdater.autoDownload = enabled;
    logger.info('Auto download setting changed', { enabled });
  }

  /**
   * 앱 종료 시 자동 설치 설정
   */
  setAutoInstallOnAppQuit(enabled: boolean): void {
    autoUpdater.autoInstallOnAppQuit = enabled;
    logger.info('Auto install on quit setting changed', { enabled });
  }
}

// 싱글톤 인스턴스
let instance: AutoUpdater | null = null;

export function getAutoUpdater(mainWindow?: BrowserWindow): AutoUpdater {
  if (!instance) {
    instance = new AutoUpdater(mainWindow);
  } else if (mainWindow) {
    instance.setMainWindow(mainWindow);
  }
  return instance;
}
