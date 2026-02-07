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

  // 앱 재시작 (클라이언트 + 서버 모두 재시작)
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // ========================================================================
  // v1.1.0: 디바이스 상세 + 히트맵
  // ========================================================================

  // 디바이스 상세 조회
  getDeviceDetail: (serial) => ipcRenderer.invoke('get-device-detail', serial),

  // 디바이스 명령 실행 (reboot, reconnect, wake, sleep)
  executeDeviceAction: (serial, action) => ipcRenderer.invoke('execute-device-action', serial, action),

  // 히트맵 데이터 (시간대별 활동 집계)
  getHeatmapData: () => ipcRenderer.invoke('get-heatmap-data'),

  // ========================================================================
  // v1.2.0: 노드 종합 상태
  // ========================================================================

  // 노드 상태 (서버 연결, Worker 서버, 디바이스 수 등)
  getNodeStatus: () => ipcRenderer.invoke('get-node-status'),

  // ========================================================================
  // v1.2.0: scrcpy 화면 제어
  // ========================================================================

  // scrcpy 시작 (디바이스 화면 미러링 + 제어) — 레거시
  startScrcpy: (serial) => ipcRenderer.invoke('start-scrcpy', serial),

  // scrcpy 중지 — 레거시
  stopScrcpy: (serial) => ipcRenderer.invoke('stop-scrcpy', serial),

  // scrcpy 활성 상태 조회 — 레거시
  isScrcpyActive: (serial) => ipcRenderer.invoke('is-scrcpy-active', serial),

  // ========================================================================
  // v1.3.0: ScrcpySession 관리 (ScrcpySessionManager 기반)
  // ========================================================================

  // scrcpy 세션 시작 (옵션: maxSize, bitrate, fps 등)
  scrcpySessionStart: (deviceId, options) =>
    ipcRenderer.invoke('scrcpy-session:start', deviceId, options),

  // scrcpy 세션 종료
  scrcpySessionStop: (deviceId) =>
    ipcRenderer.invoke('scrcpy-session:stop', deviceId),

  // 활성 scrcpy 세션 목록 조회
  scrcpySessionList: () =>
    ipcRenderer.invoke('scrcpy-session:list'),

  // scrcpy 세션 입력 전송 (tap/swipe/key/text/scroll)
  scrcpySessionInput: (deviceId, action, params) =>
    ipcRenderer.invoke('scrcpy-session:input', deviceId, action, params),

  // scrcpy 썸네일 수신 리스너
  onScrcpyThumbnail: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('scrcpy-thumbnail', handler);
    return () => ipcRenderer.removeListener('scrcpy-thumbnail', handler);
  },

  // scrcpy 세션 상태 변경 리스너
  onScrcpyStateChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('scrcpy-state-changed', handler);
    return () => ipcRenderer.removeListener('scrcpy-state-changed', handler);
  },

  // ========================================================================
  // v1.2.0: APK 관리
  // ========================================================================

  // 번들된 APK 목록 조회
  getBundledApks: () => ipcRenderer.invoke('get-bundled-apks'),

  // APK 설치
  installApk: (serial, apkFileName) => ipcRenderer.invoke('install-apk', serial, apkFileName),

  // ========================================================================
  // v1.2.0: 인프라 헬스체크
  // ========================================================================

  // 인프라 헬스 조회 (캐시된 결과)
  getInfraHealth: () => ipcRenderer.invoke('get-infra-health'),

  // 인프라 점검 실행 (강제 갱신)
  runInfraCheck: () => ipcRenderer.invoke('run-infra-check'),

  // ========================================================================
  // v1.2.3: 접속설정 (USB/WiFi/OTG 연결 관리)
  // ========================================================================

  // USB 디바이스 스캔
  scanUsbDevices: () => ipcRenderer.invoke('scan-usb-devices'),

  // WiFi/OTG 대상 일괄 연결
  connectAdbTargets: (type) => ipcRenderer.invoke('connect-adb-targets', type),

  // 단일 IP로 ADB 연결
  connectAdbIp: (ip) => ipcRenderer.invoke('connect-adb-ip', ip),

  // 접속설정 조회
  getConnectionSettings: () => ipcRenderer.invoke('get-connection-settings'),

  // 접속설정 저장
  saveConnectionSettings: (settings) => ipcRenderer.invoke('save-connection-settings', settings),
});
