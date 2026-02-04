// preload.js - Electron 보안 브릿지
// contextBridge를 사용하여 renderer에 안전한 API만 노출

const { contextBridge, ipcRenderer } = require('electron');

// renderer 프로세스에서 사용할 수 있는 안전한 API
contextBridge.exposeInMainWorld('electronAPI', {
  // ========================================================================
  // 로그 관련
  // ========================================================================
  
  // 로그 수신 리스너
  onLog: (callback) => {
    ipcRenderer.removeAllListeners('log');
    const handler = (event, message) => callback(message);
    ipcRenderer.on('log', handler);
    return () => ipcRenderer.removeListener('log', handler);
  },
  
  // 상태 업데이트 리스너
  onStatus: (callback) => {
    ipcRenderer.removeAllListeners('status');
    const handler = (event, status) => callback(status);
    ipcRenderer.on('status', handler);
    return () => ipcRenderer.removeListener('status', handler);
  },
  
  // 로그 리스너 제거
  removeLogListener: () => {
    ipcRenderer.removeAllListeners('log');
  },
  
  // ========================================================================
  // 앱 정보
  // ========================================================================
  
  // 앱 버전 조회
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // ========================================================================
  // 시작 프로그램 설정
  // ========================================================================
  
  // 시작 프로그램 등록 여부 조회
  getLaunchOnStartup: () => ipcRenderer.invoke('get-launch-on-startup'),
  
  // 시작 프로그램 등록/해제
  setLaunchOnStartup: (enabled) => ipcRenderer.invoke('set-launch-on-startup', enabled),
  
  // ========================================================================
  // Auto-Updater
  // ========================================================================
  
  // 업데이트 확인 요청
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // 업데이트 다운로드 진행률 리스너
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, percent) => callback(percent));
  },
  
  // 업데이트 진행률 리스너 제거
  removeUpdateProgressListener: () => {
    ipcRenderer.removeAllListeners('update-progress');
  }
});
