# Bot Microservices Architecture Plan

**Version**: 1.0.0
**Date**: 2026-02-05
**Author**: AI Architect

---

## 1. Executive Summary

본 계획은 DoAi.me Device Farm의 봇 아키텍처를 마이크로서비스 형태로 재구성합니다.

### 핵심 목표
- **Manager-Worker 분리**: desktop-agent가 Manager 역할, 각 봇이 독립적 Worker
- **선택적 실행**: 필요한 봇만 실행하여 리소스 최적화
- **이중 구현 제거**: 레거시 코드 정리 및 통합
- **확장성**: 새로운 봇 추가 용이한 구조

### 범위
- 기존 youtube-bot 강화
- 신규 install-bot, health-bot 생성
- mobile/ AutoX.js 스크립트 정리
- desktop-bot.archived 삭제

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Backend Server                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  REST API   │  │  Socket.IO  │  │  Supabase (PostgreSQL)  │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Desktop-Agent   │ │ Desktop-Agent   │ │ Desktop-Agent   │
│ (Manager)       │ │ (Manager)       │ │ (Manager)       │
│ PC01            │ │ PC02            │ │ PC03            │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    ▼         ▼         ▼         ▼         ▼         ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│YouTu- │ │Health │ │YouTu- │ │Insta- │ │YouTu- │ │Health │
│be-Bot │ │-Bot   │ │be-Bot │ │ll-Bot │ │be-Bot │ │-Bot   │
└───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘
    │         │         │         │         │         │
    ▼         ▼         ▼         ▼         ▼         ▼
┌────────────────────────────────────────────────────────┐
│              Android Devices (via ADB)                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│  │Dev-01│ │Dev-02│ │Dev-03│ │Dev-04│ │Dev-05│ │Dev-06│ │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │
└────────────────────────────────────────────────────────┘
```

### 계층 설명

| 계층 | 역할 | 기술 |
|------|------|------|
| Backend | 작업 할당, 상태 관리, API | Express, Socket.IO, Supabase |
| Manager | 로컬 디바이스 관리, 봇 오케스트레이션 | Electron, TypeScript |
| Worker (Bot) | 특정 작업 실행 | Node.js, ADB, UIAutomator |
| Device | 실제 작업 수행 | Android, AutoX.js (선택) |

---

## 3. Bot Specifications

### 3.1 youtube-bot (강화)

**위치**: `apps/youtube-bot/`

**역할**: YouTube 영상 시청 자동화

**기능**:
| 기능 | 상태 | 구현 방식 |
|------|------|----------|
| 키워드 검색 | ✅ 완료 | ADB + UIAutomator |
| URL 직접 진입 | ✅ 완료 | Android Intent |
| 영상 시청 | ✅ 완료 | ADB shell |
| 광고 스킵 | ⚠️ 부분 | AutoX.js 필요 |
| 좋아요 | ✅ 완료 | UIAutomator |
| 댓글 | ✅ 완료 | UIAutomator |
| 구독 | ✅ 완료 | UIAutomator |
| 랜덤 시청 시간 | ❌ 미구현 | **PR 필요** |
| 랜덤 서핑 | ❌ 미구현 | **PR 필요** |
| 휴먼 시뮬레이션 | ⚠️ 부분 | **PR 필요** |

**처리 워크플로우**:
- `youtube_watch.yml`
- `youtube_search.yml` (신규)

**의존성**:
```json
{
  "@doai/worker-core": "workspace:*",
  "@doai/worker-types": "workspace:*"
}
```

---

### 3.2 install-bot (신규)

**위치**: `apps/install-bot/` (생성 필요)

**역할**: 앱 설치, 업데이트, 제거 관리

**기능**:
| 기능 | 상태 | 구현 방식 |
|------|------|----------|
| APK 설치 | 구현 필요 | ADB install |
| 앱 업데이트 | 구현 필요 | ADB install -r |
| 앱 제거 | 구현 필요 | ADB uninstall |
| 버전 확인 | 구현 필요 | ADB dumpsys |
| 권한 부여 | 구현 필요 | ADB pm grant |

**처리 워크플로우**:
- `app_install.yml`
- `app_update.yml` (신규)

---

### 3.3 health-bot (신규)

**위치**: `apps/health-bot/` (생성 필요)

**역할**: 디바이스 상태 체크 및 복구

**기능**:
| 기능 | 상태 | 구현 방식 |
|------|------|----------|
| 배터리 체크 | 구현 필요 | ADB dumpsys battery |
| 화면 상태 | 구현 필요 | ADB dumpsys display |
| 메모리 체크 | 구현 필요 | ADB dumpsys meminfo |
| 네트워크 체크 | 구현 필요 | ADB ping |
| 앱 캐시 정리 | 구현 필요 | ADB pm clear |
| 메모리 정리 | 구현 필요 | ADB kill-all |
| 재부팅 | 구현 필요 | ADB reboot |

**처리 워크플로우**:
- `health_check.yml`
- `daily_reset.yml`

---

## 4. Shared Packages

### 4.1 @doai/worker-types

**위치**: `packages/worker-types/`

```typescript
// 핵심 타입 정의
export interface WorkerConfig {
  workerId: string;
  workerType: 'youtube' | 'install' | 'health';
  managerUrl: string;
  maxConcurrentJobs: number;
}

export interface Job {
  id: string;
  type: string;
  params: Record<string, unknown>;
  deviceIds: string[];
  priority: number;
  timeout: number;
}

export interface JobResult {
  jobId: string;
  deviceId: string;
  status: 'success' | 'failed' | 'timeout';
  data?: Record<string, unknown>;
  error?: string;
  duration: number;
}

export interface DeviceInfo {
  deviceId: string;
  serial: string;
  model: string;
  status: DeviceStatus;
  batteryLevel: number;
}

export type DeviceStatus = 
  | 'IDLE' 
  | 'RUNNING' 
  | 'BUSY' 
  | 'OFFLINE' 
  | 'ERROR' 
  | 'QUARANTINE';
```

### 4.2 @doai/worker-core

**위치**: `packages/worker-core/`

```typescript
// 핵심 클래스
export class AdbController {
  shell(command: string): Promise<string>;
  tap(x: number, y: number): Promise<void>;
  swipe(x1: number, y1: number, x2: number, y2: number, duration?: number): Promise<void>;
  inputText(text: string): Promise<void>;
  screenshot(): Promise<Buffer>;
  startApp(packageName: string): Promise<void>;
  stopApp(packageName: string): Promise<void>;
  installApk(apkPath: string): Promise<void>;
}

export class DeviceManager {
  getConnectedDevices(): Promise<DeviceInfo[]>;
  getDeviceInfo(serial: string): Promise<DeviceInfo>;
  watchDevices(callback: (event: DeviceEvent) => void): void;
}

export class BaseWorker {
  protected config: WorkerConfig;
  protected socket: Socket;
  
  abstract handleJob(job: Job): Promise<JobResult>;
  
  connect(): Promise<void>;
  disconnect(): void;
  reportStatus(): void;
}
```

### 4.3 @doai/ui-automator (신규)

**위치**: `packages/ui-automator/` (생성 필요)

UIAutomator2 래퍼 - ADB로 UI 요소 탐색 및 조작

```typescript
export class UIAutomator {
  constructor(adb: AdbController);
  
  // 요소 찾기
  findByText(text: string): Promise<UIElement | null>;
  findByDescription(desc: string): Promise<UIElement | null>;
  findById(resourceId: string): Promise<UIElement | null>;
  findByClass(className: string): Promise<UIElement[]>;
  
  // 액션
  click(element: UIElement): Promise<void>;
  longClick(element: UIElement): Promise<void>;
  setText(element: UIElement, text: string): Promise<void>;
  scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<void>;
  
  // 대기
  waitForElement(selector: Selector, timeout?: number): Promise<UIElement>;
  waitForText(text: string, timeout?: number): Promise<UIElement>;
}

export interface UIElement {
  bounds: { left: number; top: number; right: number; bottom: number };
  text: string;
  description: string;
  resourceId: string;
  className: string;
  clickable: boolean;
  enabled: boolean;
}
```

---

## 5. Communication Protocol

### 5.1 Manager ↔ Backend (Socket.IO)

```typescript
// Manager → Backend (evt: prefix)
'evt:node_online'       // 노드 연결
'evt:node_offline'      // 노드 연결 해제
'evt:heartbeat'         // 하트비트 (30초)
'evt:device_connected'  // 디바이스 연결
'evt:device_disconnected' // 디바이스 연결 해제
'evt:job_started'       // 작업 시작
'evt:job_progress'      // 작업 진행률
'evt:job_completed'     // 작업 완료
'evt:job_failed'        // 작업 실패

// Backend → Manager (cmd: prefix)
'cmd:execute_workflow'  // 워크플로우 실행
'cmd:cancel_workflow'   // 워크플로우 취소
'cmd:get_devices'       // 디바이스 목록 요청
'cmd:reboot_device'     // 디바이스 재부팅
```

### 5.2 Manager ↔ Worker (Local IPC/Socket)

```typescript
// Manager → Worker
'worker:start_job'      // 작업 시작
'worker:cancel_job'     // 작업 취소
'worker:shutdown'       // 워커 종료

// Worker → Manager
'worker:ready'          // 워커 준비 완료
'worker:job_result'     // 작업 결과
'worker:error'          // 에러 발생
'worker:heartbeat'      // 워커 하트비트
```

---

## 6. Workflow Mapping

| Workflow | 담당 Bot | 설명 |
|----------|----------|------|
| `youtube_watch.yml` | youtube-bot | 키워드 검색 후 영상 시청 |
| `youtube_search.yml` | youtube-bot | 검색만 수행 |
| `youtube_url.yml` | youtube-bot | URL 직접 진입 시청 |
| `app_install.yml` | install-bot | APK 설치 |
| `app_update.yml` | install-bot | 앱 업데이트 |
| `health_check.yml` | health-bot | 디바이스 상태 체크 |
| `daily_reset.yml` | health-bot | 일일 초기화 |

---

## 7. Missing Features (PR 목록)

### 🔴 High Priority

| # | 기능 | 봇 | 설명 | 난이도 |
|---|------|-----|------|--------|
| 1 | 랜덤 시청 시간 | youtube-bot | min~max 범위 내 랜덤 시청 | 쉬움 |
| 2 | 휴먼 시뮬레이션 | worker-core | 좌표 분산, 랜덤 딜레이 | 중간 |
| 3 | 광고 스킵 (PC 기반) | youtube-bot | AutoX.js 없이 ADB로 광고 스킵 | 어려움 |

### 🟡 Medium Priority

| # | 기능 | 봇 | 설명 | 난이도 |
|---|------|-----|------|--------|
| 4 | 랜덤 서핑 | youtube-bot | 홈 피드에서 랜덤 영상 선택 | 중간 |
| 5 | 재생목록 저장 | youtube-bot | 나중에 볼 동영상 추가 | 쉬움 |
| 6 | UIAutomator 래퍼 | ui-automator | ADB 기반 UI 탐색 | 중간 |

### 🟢 Low Priority

| # | 기능 | 봇 | 설명 | 난이도 |
|---|------|-----|------|--------|
| 7 | 시청 중 랜덤 액션 | youtube-bot | 일시정지, 스크롤, 탐색 | 쉬움 |
| 8 | 앱 권한 자동 부여 | install-bot | 설치 후 권한 자동 승인 | 중간 |
| 9 | 스크린샷 증거 수집 | worker-core | 작업 전후 스크린샷 | 쉬움 |

---

## 8. Implementation Phases

### Phase 1: 기반 정리 (1일)

**목표**: 레거시 코드 정리 및 기반 강화

**작업**:
1. `desktop-bot.archived/` 완전 삭제
2. `_archive/mobile-agent/` 정리
3. `worker-core` 타입 정리
4. `worker-types` 누락 타입 추가

**산출물**:
- 깔끔한 코드베이스
- 완전한 타입 정의

---

### Phase 2: youtube-bot 강화 (2일)

**목표**: 누락 기능 구현

**작업**:
1. 랜덤 시청 시간 구현
2. 휴먼 시뮬레이션 적용
3. 랜덤 서핑 구현
4. 테스트 작성

**PR 목록**:
- PR #1: feat(youtube-bot): add random watch duration
- PR #2: feat(worker-core): add human simulation utilities
- PR #3: feat(youtube-bot): add random surf feature

---

### Phase 3: 신규 봇 생성 (2일)

**목표**: install-bot, health-bot 생성

**작업**:
1. `apps/install-bot/` 스캐폴딩
2. `apps/health-bot/` 스캐폴딩
3. 기본 기능 구현
4. 워크플로우 연동

**PR 목록**:
- PR #4: feat: add install-bot for app management
- PR #5: feat: add health-bot for device monitoring

---

### Phase 4: UIAutomator 래퍼 (1일)

**목표**: PC 기반 UI 자동화

**작업**:
1. `packages/ui-automator/` 생성
2. ADB UI dump 파싱
3. 요소 탐색 및 액션
4. youtube-bot 통합

**PR 목록**:
- PR #6: feat: add @doai/ui-automator package

---

### Phase 5: 통합 및 테스트 (1일)

**목표**: 전체 시스템 검증

**작업**:
1. E2E 테스트 작성
2. Manager-Worker 통합 테스트
3. 문서화
4. 배포 준비

---

## 9. Acceptance Criteria

### 기능 요구사항

- [ ] youtube-bot이 랜덤 시청 시간으로 영상을 시청할 수 있다
- [ ] youtube-bot이 휴먼 시뮬레이션을 적용하여 자연스럽게 동작한다
- [ ] youtube-bot이 홈 피드에서 랜덤 영상을 선택하여 시청할 수 있다
- [ ] install-bot이 APK를 설치/업데이트/삭제할 수 있다
- [ ] health-bot이 디바이스 상태를 체크하고 보고할 수 있다
- [ ] health-bot이 일일 초기화를 수행할 수 있다

### 비기능 요구사항

- [ ] 각 봇은 독립적으로 실행/중지할 수 있다
- [ ] 봇 간 의존성이 없다 (worker-core, worker-types 제외)
- [ ] 모든 코드에 TypeScript 타입이 적용되어 있다
- [ ] 주요 기능에 테스트가 작성되어 있다
- [ ] 에러 발생 시 적절한 복구/보고가 이루어진다

### 성능 요구사항

- [ ] 디바이스당 작업 시작 시간 < 5초
- [ ] 메모리 사용량 < 200MB (봇당)
- [ ] 24시간 연속 운영 시 메모리 누수 없음

---

## 10. File Structure (최종)

```
apps/
├── backend/                 # API 서버
├── dashboard/               # 웹 대시보드
├── desktop-agent/           # Manager (Electron)
│   ├── src/
│   │   ├── main.ts
│   │   ├── manager/
│   │   │   ├── WorkerRegistry.ts
│   │   │   ├── TaskDispatcher.ts
│   │   │   └── WorkerServer.ts
│   │   └── preload.js
│   └── package.json
├── youtube-bot/             # YouTube Worker
│   ├── src/
│   │   ├── index.ts
│   │   ├── handlers/
│   │   │   ├── WatchHandler.ts
│   │   │   ├── SearchHandler.ts
│   │   │   └── SurfHandler.ts
│   │   └── utils/
│   │       ├── HumanSimulator.ts
│   │       └── AdSkipper.ts
│   └── package.json
├── install-bot/             # Install Worker (신규)
│   ├── src/
│   │   ├── index.ts
│   │   └── handlers/
│   │       ├── InstallHandler.ts
│   │       └── UninstallHandler.ts
│   └── package.json
├── health-bot/              # Health Worker (신규)
│   ├── src/
│   │   ├── index.ts
│   │   └── handlers/
│   │       ├── HealthCheckHandler.ts
│   │       └── ResetHandler.ts
│   └── package.json
└── mobile/                  # AutoX.js 스크립트 (유지)
    ├── core/
    │   ├── AdSkipper.js
    │   ├── ErrorRecovery.js
    │   └── ...
    └── bot.js

packages/
├── worker-types/            # 공통 타입
├── worker-core/             # 공통 유틸리티
├── ui-automator/            # UIAutomator 래퍼 (신규)
└── workflow-engine/         # 워크플로우 엔진

workflows/
├── youtube_watch.yml
├── youtube_search.yml       # 신규
├── youtube_url.yml          # 신규
├── app_install.yml
├── app_update.yml           # 신규
├── health_check.yml
└── daily_reset.yml
```

---

## Appendix: Commands

### 개발 환경 실행

```bash
# 전체 빌드
npm run build:workers

# 개별 봇 실행
npm run dev:youtube-bot
npm run dev:install-bot
npm run dev:health-bot

# Manager 실행 (Electron)
npm run dev:agent
```

### 테스트

```bash
# 단위 테스트
npm run test:workers

# E2E 테스트
npm run test:e2e

# 특정 봇 테스트
npm run test -w apps/youtube-bot
```

---

**End of Plan**
