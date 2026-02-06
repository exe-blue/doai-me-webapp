/**
 * DOAI Desktop Agent - Main Process
 * 
 * 기능:
 * - Auto-Updater (electron-updater)
 * - System Tray 최소화
 * - 시작 프로그램 등록
 */

const { app, BrowserWindow, Tray, Menu, Notification, dialog, ipcMain } = require('electron');
const path = require('path');
const { startBot, stopBot } = require('./bot');

// ============================================================================
// Auto-Updater 설정
// electron-updater는 프로덕션 빌드에서만 동작합니다
// ============================================================================
let autoUpdater;
try {
  // 개발 환경에서는 autoUpdater가 필요 없으므로 try-catch로 감싸기
  const { autoUpdater: electronAutoUpdater } = require('electron-updater');
  autoUpdater = electronAutoUpdater;
  
  // 로그 설정 (디버깅용)
  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
  
  // 자동 다운로드 비활성화 (사용자에게 먼저 알림)
  autoUpdater.autoDownload = false;
  
  // 자동 설치 비활성화 (사용자가 결정)
  autoUpdater.autoInstallOnAppQuit = true;
} catch (err) {
  console.log('⚠️ Auto-updater not available (development mode):', err.message);
}

// ============================================================================
// 전역 변수
// ============================================================================
let mainWindow;
let tray;
let isQuitting = false;
let trayNotificationShown = false; // 트레이 알림 표시 여부 (1회만 표시)

// 시작 프로그램 설정 상태
let launchOnStartup = app.getLoginItemSettings().openAtLogin;

// ============================================================================
// 윈도우 생성
// ============================================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: true,
    icon: path.join(__dirname, '../resources/icon.ico'),
    webPreferences: {
      // 보안 강화: nodeIntegration 비활성화, contextIsolation 활성화
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // ========================================================================
  // [프로덕션] 닫기 버튼 누르면 트레이로 최소화 (종료 대신)
  // ========================================================================
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // 최초 1회만 트레이 알림 표시 (사용자에게 안내)
      if (!trayNotificationShown && Notification.isSupported()) {
        const notification = new Notification({
          title: 'DOAI Agent',
          body: '앱이 시스템 트레이에서 계속 실행됩니다. 종료하려면 트레이 아이콘을 우클릭하세요.',
          icon: path.join(__dirname, '../resources/icon.ico')
        });
        notification.show();
        trayNotificationShown = true;
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// 트레이 생성
// ============================================================================
function createTray() {
  const iconPath = path.join(__dirname, '../resources/icon.ico');
  
  try {
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Open Status', 
        click: () => showMainWindow()
      },
      { type: 'separator' },
      {
        label: 'Launch on Startup',
        type: 'checkbox',
        checked: launchOnStartup,
        click: (menuItem) => {
          toggleLaunchOnStartup(menuItem.checked);
        }
      },
      {
        label: 'Check for Updates',
        click: () => checkForUpdates(true)
      },
      { type: 'separator' },
      { 
        label: 'Quit Agent', 
        click: () => quitApp()
      }
    ]);
    
    tray.setToolTip('DOAI Agent');
    tray.setContextMenu(contextMenu);
    
    tray.on('double-click', () => {
      showMainWindow();
    });
    
    console.log('✅ Tray icon created successfully.');
  } catch (error) {
    console.log('⚠️ Tray icon failed (Using default window):', error.message);
  }
}

// ============================================================================
// 윈도우 표시 헬퍼
// ============================================================================
function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// ============================================================================
// 앱 종료 헬퍼
// ============================================================================
function quitApp() {
  isQuitting = true;
  stopBot();
  app.quit();
}

// ============================================================================
// 시작 프로그램 등록/해제
// ============================================================================
function toggleLaunchOnStartup(enabled) {
  launchOnStartup = enabled;
  
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // Windows: 시작 시 최소화 상태로 실행
    openAsHidden: true,
    // macOS: 백그라운드에서 시작
    args: ['--hidden']
  });
  
  console.log(`✅ Launch on startup: ${enabled ? 'enabled' : 'disabled'}`);
  
  // 트레이 메뉴 업데이트
  updateTrayMenu();
}

// ============================================================================
// 트레이 메뉴 업데이트
// ============================================================================
function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open Status', 
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: 'Launch on Startup',
      type: 'checkbox',
      checked: launchOnStartup,
      click: (menuItem) => {
        toggleLaunchOnStartup(menuItem.checked);
      }
    },
    {
      label: 'Check for Updates',
      click: () => checkForUpdates(true)
    },
    { type: 'separator' },
    { 
      label: 'Quit Agent', 
      click: () => quitApp()
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

// ============================================================================
// Auto-Updater 로직
// ============================================================================
function setupAutoUpdater() {
  if (!autoUpdater) {
    console.log('⚠️ Auto-updater not configured (skipping setup)');
    return;
  }

  // 업데이트 확인 가능 이벤트
  autoUpdater.on('checking-for-update', () => {
    console.log('🔍 Checking for updates...');
  });

  // 업데이트 발견 이벤트
  autoUpdater.on('update-available', (info) => {
    console.log('📦 Update available:', info.version);
    
    // 안전한 부모 윈도우 참조 획득 (null이거나 destroyed면 null 사용)
    const parentWindow = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null;
    
    // 사용자에게 다운로드 여부 확인
    dialog.showMessageBox(parentWindow, {
      type: 'info',
      title: 'Update Available',
      message: `새 버전 ${info.version}이 있습니다. 다운로드하시겠습니까?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  // 업데이트 없음 이벤트
  autoUpdater.on('update-not-available', (info) => {
    console.log('✅ App is up to date:', info.version);
  });

  // 다운로드 진행 이벤트
  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    console.log(`📥 Downloading: ${percent}%`);
    
    // 렌더러에 진행률 전송 (UI 표시용)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', percent);
    }
  });

  // 다운로드 완료 이벤트
  autoUpdater.on('update-downloaded', (info) => {
    console.log('✅ Update downloaded:', info.version);
    
    // 알림 표시
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Update Ready',
        body: `버전 ${info.version}이 다운로드되었습니다. 재시작하여 설치하세요.`,
        icon: path.join(__dirname, '../resources/icon.ico')
      });
      
      notification.on('click', () => {
        promptInstallUpdate(info.version);
      });
      
      notification.show();
    }
    
    // 다이얼로그로 재시작 여부 확인
    promptInstallUpdate(info.version);
  });

  // 에러 이벤트
  autoUpdater.on('error', (err) => {
    console.error('❌ Auto-updater error:', err.message);
  });
}

// 업데이트 설치 프롬프트
function promptInstallUpdate(version) {
  // 안전한 부모 윈도우 참조 획득 (null이거나 destroyed면 null 사용)
  const parentWindow = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null;
  
  dialog.showMessageBox(parentWindow, {
    type: 'info',
    title: 'Install Update',
    message: `버전 ${version}이 설치 준비되었습니다. 지금 재시작하시겠습니까?`,
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
}

// 수동 업데이트 확인
function checkForUpdates(showNoUpdateDialog = false) {
  if (!autoUpdater) {
    if (showNoUpdateDialog) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Auto-Updater',
        message: '개발 환경에서는 자동 업데이트가 비활성화되어 있습니다.',
        buttons: ['OK']
      });
    }
    return;
  }
  
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('❌ Failed to check for updates:', err.message);
    
    if (showNoUpdateDialog) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update Check Failed',
        message: `업데이트 확인 실패: ${err.message}`,
        buttons: ['OK']
      });
    }
  });
}

// ============================================================================
// 앱 초기화
// ============================================================================
app.whenReady().then(() => {
  // 윈도우 생성
  createWindow();
  
  // 트레이 생성
  createTray();
  
  // Auto-Updater 설정 및 시작 시 업데이트 확인
  setupAutoUpdater();
  
  // 앱 시작 시 업데이트 확인 (패키지된 프로덕션 빌드에서만)
  if (autoUpdater && app.isPackaged) {
    // 앱 로드 후 3초 뒤에 업데이트 확인 (UI가 먼저 표시되도록)
    setTimeout(() => {
      checkForUpdates(false);
    }, 3000);
  }
  
  // 봇 시작 (로그 콜백 + 상태 콜백)
  startBot(
    // 로그 콜백
    (log) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log', log);
      }
      console.log(log);
    },
    // 상태 콜백
    (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status', status);
      }
      
      // 트레이 툴팁 업데이트
      if (tray) {
        const statusText = status.connected ? '🟢 Connected' : '🔴 Disconnected';
        tray.setToolTip(`DOAI Agent - ${statusText}\n${status.activeDevices || 0}/${status.totalSlots || 20} devices`);
      }
    }
  );
  
  console.log('✅ DOAI Agent started');
  console.log(`   Version: ${app.getVersion()}`);
  console.log(`   Launch on Startup: ${launchOnStartup}`);
});

// ============================================================================
// macOS: 앱 활성화 시 윈도우 재생성
// ============================================================================
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============================================================================
// 모든 창이 닫혀도 앱은 계속 실행 (트레이에서 동작)
// ============================================================================
app.on('window-all-closed', () => {
  // 트레이에서 계속 실행하므로 quit 하지 않음
  // macOS에서는 원래 이렇게 동작함
});

// ============================================================================
// 앱 종료 전 정리
// ============================================================================
app.on('before-quit', () => {
  isQuitting = true;
});

// ============================================================================
// IPC: 렌더러 프로세스와의 통신
// ============================================================================
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-launch-on-startup', () => {
  return launchOnStartup;
});

ipcMain.handle('set-launch-on-startup', (event, enabled) => {
  toggleLaunchOnStartup(enabled);
  return launchOnStartup;
});

ipcMain.handle('check-for-updates', () => {
  checkForUpdates(true);
});
