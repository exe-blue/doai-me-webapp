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

// 새로운 API 네임스페이스 - Renderer UI용
contextBridge.exposeInMainWorld('api', {
  // ========================================================================
  // 설정 관련
  // ========================================================================
  
  // 설정 조회
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // 설정 저장
  setConfig: (config) => ipcRenderer.invoke('set-config', config),
  
  // ========================================================================
  // 디바이스 관련
  // ========================================================================
  
  // 연결된 디바이스 목록 조회
  getDevices: () => ipcRenderer.invoke('get-devices'),
  
  // 디바이스에 명령 실행
  executeCommand: (deviceId, command) => ipcRenderer.invoke('execute-command', deviceId, command),
  
  // 디바이스 상태 업데이트 리스너
  onDeviceUpdate: (callback) => {
    const handler = (event, devices) => callback(event, devices);
    ipcRenderer.on('device-update', handler);
    return () => ipcRenderer.removeListener('device-update', handler);
  },
  
  // ========================================================================
  // 워크플로우 관련
  // ========================================================================
  
  // 워크플로우 상태 조회
  getWorkflowStatus: () => ipcRenderer.invoke('get-workflow-status'),
  
  // 워크플로우 취소
  cancelWorkflow: (workflowId) => ipcRenderer.invoke('cancel-workflow', workflowId),
  
  // ========================================================================
  // 로그 관련
  // ========================================================================
  
  // 최근 로그 조회
  getLogs: () => ipcRenderer.invoke('get-logs'),
  
  // 로그 항목 리스너
  onLogEntry: (callback) => {
    const handler = (event, log) => callback(event, log);
    ipcRenderer.on('log-entry', handler);
    return () => ipcRenderer.removeListener('log-entry', handler);
  },
  
  // ========================================================================
  // 서버 연결 관련
  // ========================================================================
  
  // 서버 연결 상태 조회
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  
  // 서버 상태 변경 리스너
  onServerStatus: (callback) => {
    const handler = (event, status) => callback(event, status);
    ipcRenderer.on('server-status', handler);
    return () => ipcRenderer.removeListener('server-status', handler);
  },
  
  // 수동 재연결
  reconnectServer: () => ipcRenderer.invoke('reconnect-server'),
});
