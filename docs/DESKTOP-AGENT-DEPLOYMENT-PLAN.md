# Desktop Agent 프로덕션 배포 계획

## 현재 상태 분석

### 구현 완료 (70%)

| 컴포넌트 | 파일 | 상태 | 비고 |
|----------|------|------|------|
| **Main Process** | `src/main.ts` | ✅ 완료 | Electron 앱 라이프사이클, 시스템 트레이, IPC |
| **ADB Controller** | `src/device/AdbController.ts` | ✅ 완료 | 디바이스 탐지, 배터리, 화면 제어 |
| **Device Manager** | `src/device/DeviceManager.ts` | ✅ 완료 | 디바이스 상태 관리, 이벤트 발생 |
| **Socket Client** | `src/socket/SocketClient.ts` | ✅ 완료 | Socket.IO 연결, 자동 재연결 |
| **Workflow Runner** | `src/workflow/WorkflowRunner.ts` | ⚠️ 부분 | AutoX 실행 플레이스홀더 (TODO) |
| **Device Recovery** | `src/recovery/DeviceRecovery.ts` | ✅ 완료 | 자동 재연결, 헬스 모니터링 |
| **Node Recovery** | `src/recovery/NodeRecovery.ts` | ✅ 완료 | 상태 저장/복구, 크래시 복구 |
| **Auto Updater** | `src/updater/AutoUpdater.ts` | ✅ 완료 | 자동 업데이트 |
| **Logger** | `src/utils/logger.ts` | ✅ 완료 | electron-log 기반 |

### 누락된 컴포넌트 (30%)

| 컴포넌트 | 경로 | 우선순위 | 영향도 |
|----------|------|----------|--------|
| **Renderer UI** | `src/index.html` | 🔴 필수 | main.ts에서 참조 |
| **Icon Assets** | `resources/icon.*` | 🔴 필수 | 빌드 시 필요 |
| **QueueManager** | `src/queue/QueueManager.ts` | 🟠 높음 | 백엔드 연동 |
| **AutoX 실제 실행** | `workflow/WorkflowRunner.ts:333` | 🟠 높음 | YouTube 자동화 |
| **조건 평가** | `workflow/WorkflowRunner.ts:356` | 🟡 중간 | 워크플로우 분기 |
| **워크플로우 취소** | `socket/SocketClient.ts:227` | 🟡 중간 | 작업 중단 |

---

## Phase 1: 기반 구조 완성 (2-3일)

### 1.1 누락 파일 생성

```
apps/desktop-agent/
├── src/
│   └── renderer/
│       ├── index.html          # 메인 UI
│       ├── index.ts            # 렌더러 진입점
│       └── styles.css          # 스타일시트
├── resources/
│   ├── icon.ico               # Windows 아이콘
│   ├── icon.icns              # macOS 아이콘
│   ├── icon.png               # Linux 아이콘
│   ├── apks/                  # AutoX.js APK
│   └── config/                # 기본 설정
└── build/
    ├── entitlements.mac.plist # macOS 권한
    └── installer.nsh          # NSIS 스크립트
```

### 1.2 Renderer UI 구현

**기능 요구사항:**
- 연결 상태 표시 (서버, 디바이스)
- 디바이스 목록 및 상태
- 실행 중인 워크플로우 진행률
- 로그 뷰어
- 설정 패널

**기술 스택:**
- React 또는 Vanilla JS (경량화 우선)
- IPC 통신 (preload.js 확장 필요)
- TailwindCSS (선택)

### 1.3 Preload 스크립트 확장

```javascript
// src/preload.js 확장
contextBridge.exposeInMainWorld('api', {
  // 기존 API
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config) => ipcRenderer.invoke('set-config', config),
  
  // 디바이스 API 추가
  getDevices: () => ipcRenderer.invoke('get-devices'),
  executeCommand: (deviceId, cmd) => ipcRenderer.invoke('execute-command', deviceId, cmd),
  
  // 워크플로우 API 추가
  getWorkflowStatus: () => ipcRenderer.invoke('get-workflow-status'),
  cancelWorkflow: (workflowId) => ipcRenderer.invoke('cancel-workflow', workflowId),
  
  // 로그 API 추가
  getLogs: () => ipcRenderer.invoke('get-logs'),
  onLogEntry: (callback) => ipcRenderer.on('log-entry', callback),
});
```

---

## Phase 2: Socket.IO + BullMQ 통합 (2-3일)

### 2.1 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                      ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    Socket.IO    ┌──────────────┐              │
│  │ Desktop Agent│◄───────────────►│   Backend    │              │
│  │  (Electron)  │                 │  (Node.js)   │              │
│  └──────────────┘                 └──────────────┘              │
│         │                                │                       │
│         │ ADB                            │ BullMQ                │
│         ▼                                ▼                       │
│  ┌──────────────┐                 ┌──────────────┐              │
│  │   Devices    │                 │    Redis     │              │
│  │  (S9 x 500)  │                 │   (Queue)    │              │
│  └──────────────┘                 └──────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 이벤트 플로우

**서버 → 에이전트:**
```typescript
// packages/shared/src/constants.ts 참조
EXECUTE_WORKFLOW    // 워크플로우 실행 명령
CANCEL_WORKFLOW     // 워크플로우 취소 명령
PING               // 연결 확인
```

**에이전트 → 서버:**
```typescript
REGISTER           // 노드 등록 (연결 시)
DEVICE_STATUS      // 디바이스 상태 보고 (10초 주기)
WORKFLOW_PROGRESS  // 진행률 업데이트
WORKFLOW_COMPLETE  // 완료 보고
WORKFLOW_ERROR     // 오류 보고
PONG               // 핑 응답
```

### 2.3 누락 구현: QueueManager

```typescript
// apps/backend/src/queue/QueueManager.ts
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private connection: Redis;

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async addWorkflowJob(nodeId: string, jobData: WorkflowJobData) {
    const queue = this.getOrCreateQueue(nodeId);
    return queue.add('workflow', jobData, {
      priority: jobData.priority || 0,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async getJobStatus(jobId: string, nodeId: string) {
    const queue = this.getOrCreateQueue(nodeId);
    const job = await queue.getJob(jobId);
    return job?.getState();
  }

  private getOrCreateQueue(nodeId: string): Queue {
    if (!this.queues.has(nodeId)) {
      const queue = new Queue(`workflow:${nodeId}`, { connection: this.connection });
      this.queues.set(nodeId, queue);
    }
    return this.queues.get(nodeId)!;
  }
}
```

---

## Phase 3: ADB/AutoX 통합 (3-5일)

### 3.1 AutoX.js 스크립트 실행 구현

현재 `WorkflowRunner.ts:333`의 TODO를 실제 구현으로 대체:

```typescript
// apps/desktop-agent/src/workflow/WorkflowRunner.ts
private async executeAutoxStep(step: WorkflowStep, device: string): Promise<StepResult> {
  const scriptPath = step.script;
  const params = JSON.stringify(step.params || {});
  
  // 1. 스크립트를 디바이스에 푸시
  const remotePath = `/sdcard/DoAiScript/${path.basename(scriptPath)}`;
  await this.adb.execute(`push "${scriptPath}" "${remotePath}"`, device);
  
  // 2. 파라미터를 job.json으로 저장
  const jobConfigPath = `/sdcard/DoAiScript/job.json`;
  const tempPath = path.join(os.tmpdir(), 'job.json');
  fs.writeFileSync(tempPath, params);
  await this.adb.execute(`push "${tempPath}" "${jobConfigPath}"`, device);
  
  // 3. Intent로 AutoX.js 실행
  const intentAction = 'com.stardust.autojs.action.RUN_SCRIPT';
  const intentExtra = `--es path "${remotePath}"`;
  await this.adb.execute(
    `shell am broadcast -a ${intentAction} ${intentExtra}`,
    device
  );
  
  // 4. 완료 대기 (completion 파일 폴링)
  const completionPath = `/sdcard/DoAiScript/completion.json`;
  const result = await this.waitForCompletion(device, completionPath, step.timeout || 300000);
  
  return result;
}

private async waitForCompletion(device: string, path: string, timeout: number): Promise<StepResult> {
  const startTime = Date.now();
  const pollInterval = 2000;
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await this.adb.execute(`shell cat "${path}"`, device);
      const parsed = JSON.parse(result);
      
      if (parsed.status === 'completed' || parsed.status === 'failed') {
        // 결과 파일 삭제
        await this.adb.execute(`shell rm "${path}"`, device);
        return {
          success: parsed.status === 'completed',
          data: parsed.data,
          error: parsed.error,
        };
      }
    } catch {
      // 파일이 아직 없음 - 계속 대기
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`AutoX script timeout after ${timeout}ms`);
}
```

### 3.2 AutoX.js 스크립트 구조

```
apps/mobile/
├── core/
│   ├── YouTubeActions.js     # YouTube 액션 (좋아요, 댓글, 구독)
│   ├── SearchFlow.js         # 검색 워크플로우
│   ├── AdSkipper.js          # 광고 스킵 스레드
│   ├── ErrorRecovery.js      # 오류 복구
│   ├── EvidenceManager.js    # 스크린샷 캡처
│   ├── Logger.js             # 로깅
│   └── Utils.js              # 유틸리티
├── bot.js                    # 메인 봇 스크립트
└── bot-webview-autojs.js     # WebView 봇
```

### 3.3 YouTube 자동화 워크플로우

```yaml
# workflows/youtube_watch.yml
name: YouTube 시청 워크플로우
version: 1.0
timeout: 600000  # 10분

steps:
  - id: wake
    type: adb
    command: shell input keyevent KEYCODE_WAKEUP
    
  - id: unlock
    type: adb
    command: shell input swipe 540 1800 540 800 300
    
  - id: launch_youtube
    type: adb
    command: shell am start -n com.google.android.youtube/.HomeActivity
    
  - id: search_and_watch
    type: autox
    script: apps/mobile/bot.js
    params:
      keyword: "{{keyword}}"
      watchDuration: "{{watchDuration}}"
      like: "{{like}}"
      comment: "{{comment}}"
      subscribe: "{{subscribe}}"
    timeout: 300000
    onError: skip
    
  - id: close_youtube
    type: adb
    command: shell am force-stop com.google.android.youtube
```

---

## Phase 4: 통합 테스트 (2-3일)

### 4.1 테스트 시나리오

| 테스트 | 설명 | 검증 항목 |
|--------|------|----------|
| **연결 테스트** | 에이전트 ↔ 서버 Socket.IO | 연결, 재연결, 인증 |
| **디바이스 테스트** | ADB 디바이스 탐지/제어 | 연결, 상태, 명령 실행 |
| **워크플로우 테스트** | 단일 디바이스 워크플로우 | 진행률, 완료, 오류 처리 |
| **스케일 테스트** | 다중 디바이스 동시 실행 | 동시성, 리소스, 안정성 |
| **복구 테스트** | 장애 상황 복구 | 재연결, 상태 복원, 재시도 |

### 4.2 Pre-flight 체크리스트

```bash
# scripts/run-preflight.js
✅ Checkpoint 1: 환경 설정
   - SUPABASE_URL 설정됨
   - SOCKET_SERVER_URL 설정됨
   - NODE_ID 설정됨

✅ Checkpoint 2: ADB 연결
   - ADB 서버 실행 중
   - 디바이스 탐지 (최소 1대)
   - 배터리 레벨 > 20%

✅ Checkpoint 3: Socket.IO 연결
   - 서버 연결 성공
   - 인증 성공
   - PING/PONG 응답

✅ Checkpoint 4: AutoX.js 준비
   - AutoX.js 앱 설치됨
   - 접근성 서비스 활성화
   - 저장소 권한 부여

✅ Checkpoint 5: 워크플로우 테스트
   - 테스트 워크플로우 실행
   - 진행률 보고 확인
   - 완료 보고 확인
```

---

## Phase 5: 프로덕션 배포 (2-3일)

### 5.1 빌드 설정

```yaml
# electron-builder.yml
appId: me.doai.desktop-agent
productName: DoAi Desktop Agent
directories:
  output: release

files:
  - dist/**/*
  - resources/**/*
  - package.json

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icon.icns
  entitlements: build/entitlements.mac.plist

linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: resources/icon.png

publish:
  provider: github
  owner: doai-me
  repo: desktop-agent
```

### 5.2 환경 변수

```bash
# .env.production
NODE_ENV=production
NODE_ID=P01
SOCKET_SERVER_URL=wss://api.doai.me
WORKER_SECRET_TOKEN=<secret>
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=<service_role_key>
ADB_PATH=/usr/local/bin/adb
LOG_LEVEL=info
AUTO_UPDATE_ENABLED=true
```

### 5.3 배포 체크리스트

```
□ 코드 프리즈 및 버전 태깅
□ TypeScript 빌드 (npx tsc)
□ Electron 패키징 (npm run build)
□ 코드 서명 (Windows: EV 인증서, macOS: notarization)
□ GitHub Release 생성
□ 자동 업데이트 서버 확인
□ 문서 업데이트 (CHANGELOG, README)
□ 노드별 순차 배포 (canary → production)
```

---

## 타임라인 요약

| Phase | 작업 | 예상 기간 | 담당 |
|-------|------|----------|------|
| **1** | 기반 구조 완성 | 2-3일 | Frontend |
| **2** | Socket.IO + BullMQ | 2-3일 | Backend |
| **3** | ADB/AutoX 통합 | 3-5일 | Mobile |
| **4** | 통합 테스트 | 2-3일 | QA |
| **5** | 프로덕션 배포 | 2-3일 | DevOps |

**총 예상 기간: 11-17일 (약 2-3주)**

---

## 위험 요소 및 완화 방안

| 위험 | 영향 | 확률 | 완화 방안 |
|------|------|------|----------|
| AutoX.js 안정성 | 높음 | 중간 | 오류 복구, 재시도 로직 |
| ADB 연결 끊김 | 높음 | 높음 | 자동 재연결, 헬스 체크 |
| 네트워크 불안정 | 중간 | 높음 | 오프라인 큐잉, 재전송 |
| 메모리 누수 | 중간 | 낮음 | 주기적 재시작, 모니터링 |
| 업데이트 실패 | 낮음 | 낮음 | 롤백 메커니즘 |

---

## 다음 단계

1. **즉시**: Renderer UI 기본 구조 생성
2. **이번 주**: Icon 에셋 준비, QueueManager 구현
3. **다음 주**: AutoX 통합 완료, 통합 테스트
4. **2주 후**: 프로덕션 배포

---

*작성일: 2026-02-06*
*버전: 1.0*
