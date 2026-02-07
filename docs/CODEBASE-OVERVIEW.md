# DoAi.Me - Codebase Overview

> AI-driven automation platform managing 600+ physical Android devices for autonomous YouTube content consumption, engagement tracking, and behavioral analysis.

---

## 1. Project Architecture

**Monorepo** (npm workspaces + Turbo 2.8.0)

```
doai-me-webapp/
├── apps/                    # 실행 가능한 애플리케이션
│   ├── backend/             # Express + Socket.IO + BullMQ 서버
│   ├── dashboard/           # Next.js 관리자 대시보드
│   ├── desktop-agent/       # Electron 데스크톱 에이전트 (PC당 1개)
│   ├── youtube-bot/         # YouTube 자동화 워커
│   ├── install-bot/         # 앱 설치 워커
│   ├── health-bot/          # 디바이스 헬스 모니터링 워커
│   ├── server/              # FastAPI (Celery) 백엔드 (레거시)
│   └── worker/              # Celery 태스크 워커 (레거시)
├── packages/                # 공유 라이브러리
│   ├── shared/              # 타입, 상수, API 스펙
│   ├── ui/                  # React 컴포넌트 라이브러리
│   ├── worker-core/         # ADB/디바이스 제어 코어
│   ├── worker-types/        # 워커 통신 프로토콜 타입
│   ├── ui-automator/        # Android UIAutomator2 래퍼
│   ├── script-engine/       # 샌드박스 JS 실행 엔진
│   ├── stream-hub/          # 멀티 디바이스 스트리밍 허브
│   ├── emulator-manager/    # Docker 기반 에뮬레이터 풀 관리
│   └── workflow-engine/     # 워크플로우 오케스트레이션 (스캐폴딩)
├── infra/                   # Docker, Nginx 등 인프라 설정
├── docs/                    # 프로젝트 문서
└── scripts/                 # 빌드/유틸리티 스크립트
```

---

## 2. Tech Stack

### Frontend
| 레이어 | 기술 | 버전 |
|--------|------|------|
| 프레임워크 | Next.js | 16.1.6 |
| UI | React | 19.2.3 |
| 스타일링 | TailwindCSS | 4 (Oxide) |
| 컴포넌트 | Radix UI | 1.x |
| 폼 | React Hook Form + Zod | 7.71 / 4.3 |
| 데이터 | React Query | 5.90 |
| 실시간 | Socket.IO client | 4.8.3 |
| 차트 | Recharts | 3.7.0 |
| 애니메이션 | Framer Motion | 12.29 |

### Backend
| 레이어 | 기술 | 버전 |
|--------|------|------|
| 서버 | Express.js | 4.21.0 |
| 실시간 | Socket.IO | 4.8.3 |
| 잡 큐 | BullMQ | 5.0.0 |
| 캐시/브로커 | Redis | 7-alpine |
| 데이터베이스 | Supabase (PostgreSQL) | - |
| AI | OpenAI SDK | 6.17.0 |
| 언어 | TypeScript | 5.5.0 |

### Desktop Agent
| 레이어 | 기술 | 버전 |
|--------|------|------|
| 프레임워크 | Electron | 40.1.0 |
| 디바이스 제어 | adbkit | 3.2.6 |
| 자동 업데이트 | electron-updater | 6.3.9 |
| 시스템 정보 | systemInformation | 5.21 |

---

## 3. Applications

### 3.1 Backend (`apps/backend`)

중앙 조율 서버. 디바이스 관리, 실시간 통신, 작업 오케스트레이션 담당.

```
src/
├── server.ts              # Express + Socket.IO 메인 서버
├── socket/handlers/       # 소켓 이벤트 핸들러 (device, workflow)
├── db/repositories/       # Supabase Repository 패턴 (Device, Workflow 등)
├── queue/                 # BullMQ 잡 관리
│   ├── QueueManager.ts    # 큐 생성/관리
│   ├── WorkflowWorker.ts  # 워크플로우 실행
│   ├── SupabaseSync.ts    # DB 동기화
│   └── CeleryBridge.ts    # Python Celery 연동
├── state/StateManager.ts  # Redis 상태 관리
└── monitor/               # 메트릭 수집 및 알림
```

**핵심 기능:**
- WebSocket 기반 실시간 디바이스 상태 업데이트
- BullMQ 분산 잡 큐 (VIDEO_EXECUTION, DEVICE_COMMAND 등 8종)
- Supabase 동기화 서비스
- 메트릭 수집 및 알림 관리 (Discord/Slack webhook)

### 3.2 Dashboard (`apps/dashboard`)

관리자용 웹 UI. 디바이스 모니터링, 작업 관리, 원격 제어 제공.

```
src/
├── app/                   # Next.js App Router
│   └── api/               # Route handlers
├── components/            # 28+ 재사용 컴포넌트
├── contexts/              # React Context (auth, theme 등)
├── hooks/                 # 커스텀 훅 (useSocket, useDevices 등)
└── lib/                   # 유틸리티 (API 클라이언트, 인증, 포맷팅)
```

**핵심 기능:**
- 실시간 디바이스 상태 대시보드
- 작업 생성/배포/모니터링 UI
- 디바이스 그룹 관리 및 배치 작업
- Scrcpy 기반 원격 스크린 뷰어
- 비디오/채널 관리

### 3.3 Desktop Agent (`apps/desktop-agent`)

각 PC에 설치되는 Electron 앱. ADB 연결, 디바이스 제어, 로컬 스크립트 실행 담당.

```
src/
├── main.ts                # Electron 메인 프로세스
├── device/                # ADB 디바이스 관리
├── manager/               # 태스크 조율
├── workflow/              # 작업 실행 엔진
└── recovery/              # 디바이스 복구 로직
```

**핵심 기능:**
- ADB 디바이스 자동 탐색 및 연결
- Scrcpy 스크린 미러링/원격 제어
- 잡 실행 (타임아웃/재시도 로직)
- 자동 디바이스 헬스 모니터링 및 복구
- GitHub Releases 기반 자동 업데이트

### 3.4 Worker Bots

| 봇 | 패키지명 | 역할 |
|----|---------|------|
| youtube-bot | @doai/youtube-bot | YouTube 시청, 좋아요, 댓글, 구독 자동화 |
| install-bot | @doai/install-bot | APK 설치, 앱 라이프사이클 관리 |
| health-bot | @doai/health-bot | 배터리/온도/네트워크 모니터링, 복구 트리거 |

---

## 4. Shared Packages

### `@doai/shared` - 타입 및 상수

모든 앱에서 공유하는 타입, API 스펙, 이벤트 정의의 단일 소스.

```typescript
// 주요 Export
import type { Device, Video, Channel, Job, JobAssignment } from '@doai/shared'
import type { CreateJobBody, GetDevicesParams } from '@doai/shared/api'
import { CANONICAL_WORKER_EVENTS, CANONICAL_DASHBOARD_EVENTS } from '@doai/shared/events'
import type { VideoExecutionJobData } from '@doai/shared/queue'
import { ERROR_CODES, QUEUE_NAMES, BOT_TEMPLATES } from '@doai/shared'
```

### `@doai/worker-core` - 디바이스 제어 코어

ADB 명령 실행, 디바이스 라이프사이클, 자연스러운 인터랙션 시뮬레이션.

```typescript
class AdbController {
  shell(cmd: string): Promise<string>
  screencap(): Promise<Buffer>
  tap(x: number, y: number): Promise<void>
  swipe(x1, y1, x2, y2): Promise<void>
}

class HumanSimulator {
  randomTap(bounds: Bounds): Promise<void>
  naturalScroll(distance: number, duration: number): Promise<void>
}
```

### `@packages/ui` - React 컴포넌트 라이브러리

Radix UI + TailwindCSS 기반 28+ 컴포넌트. Storybook으로 문서화.
- Forms: Input, Select, Checkbox, RadioGroup, TextArea
- Layouts: Card, Separator, ScrollArea
- Overlays: Dialog, Popover, Tooltip, DropdownMenu
- Data: Table, Tabs, Progress, Badge

### 기타 패키지

| 패키지 | 역할 | 핵심 의존성 |
|--------|------|------------|
| `@doai/worker-types` | 워커 ↔ 매니저 통신 프로토콜 타입 | TypeScript only |
| `@doai/ui-automator` | Android UIAutomator2 래퍼 | worker-core |
| `@doai/script-engine` | 샌드박스 JS 실행 (isolated-vm) | isolated-vm 5.0 |
| `@doai/stream-hub` | 100+ 동시 디바이스 스트리밍 | sharp 0.33 |
| `@doai/emulator-manager` | Docker 기반 에뮬레이터 풀 | dockerode 4.0 |

---

## 5. Database Schema (Supabase PostgreSQL)

### devices
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | 디바이스 고유 ID |
| serial_number | TEXT UNIQUE | ADB 시리얼 |
| pc_id | TEXT | 호스트 PC 식별자 |
| group_id | TEXT | 그룹 (P1-G1 형식) |
| status | TEXT | online / busy / offline |
| last_seen_at | TIMESTAMPTZ | 마지막 활동 시각 |

### jobs
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | 작업 고유 ID |
| title | TEXT | 작업 제목 |
| keyword | TEXT | YouTube 검색 키워드 |
| target_url | TEXT NOT NULL | YouTube URL |
| target_group | TEXT | 대상 디바이스 그룹 |
| duration_sec | INTEGER | 시청 시간 (초) |
| duration_min_pct / max_pct | INTEGER | 시청 비율 범위 |
| prob_like / comment / playlist | INTEGER 0-100 | 행동 확률 |
| base_reward | INTEGER | 작업당 보상 |
| is_active | BOOLEAN | 활성 여부 |

### job_assignments
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | 할당 고유 ID |
| job_id | UUID FK → jobs | 작업 참조 |
| device_id | UUID FK → devices | 디바이스 참조 |
| status | TEXT | pending / running / completed / failed / cancelled |
| progress_pct | INTEGER 0-100 | 진행률 |
| did_like / comment / playlist | BOOLEAN | 실행된 행동 |
| error_code | TEXT | 에러 코드 (E1001-E4001) |
| retry_count | INTEGER 0-10 | 재시도 횟수 |

### monitored_channels
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | 채널 고유 ID |
| channel_id | TEXT UNIQUE | YouTube 채널 ID |
| channel_name | TEXT | 채널명 |
| is_active | BOOLEAN | 모니터링 활성 여부 |
| preset_settings | JSONB | 자동 수집 기본 설정 |

### salary_logs
| 컬럼 | 타입 | 설명 |
|------|------|------|
| assignment_id | UUID FK | 할당 참조 |
| watch_percentage | INTEGER | 시청 비율 |
| actual_duration_sec | INTEGER | 실제 시청 시간 |
| rank_in_group | INTEGER | 그룹 내 순위 |

> Realtime: 모든 주요 테이블에 활성화. RLS: 현재 개발 모드 (allow-all).

---

## 6. Real-time Communication

### Socket.IO 네임스페이스

#### `/worker` (디바이스 ↔ 백엔드)

```
Backend → Worker:
  worker:heartbeat       하트비트 요청
  device:init            디바이스 초기화
  device:command         ADB/UIAutomator 명령
  job:assign             작업 할당

Worker → Backend:
  job:started            실행 시작
  job:progress           진행률 (0-100%)
  job:completed          완료 결과
  job:failed             실패 상세
  scrcpy:thumbnail       스크린 프레임
```

#### `/dashboard` (대시보드 ↔ 백엔드)

```
Backend → Dashboard:
  devices:initial        초기 디바이스 목록
  device:update          상태 변경
  device:online/offline  연결/해제

Dashboard → Backend:
  job:distribute         작업 배포
  command:send           개별 명령
  command:broadcast      전체 브로드캐스트
  scrcpy:start/stop      스트리밍 제어
```

### Canonical Event System (신규)

기존 4개 이벤트 시스템을 하나로 통합하는 중.

```typescript
// packages/shared/src/events.ts
CANONICAL_WORKER_EVENTS   // 워커 이벤트 맵 + 페이로드 타입
CANONICAL_DASHBOARD_EVENTS // 대시보드 이벤트 맵 + 페이로드 타입
```

**주요 페이로드:**

```typescript
interface JobAssignPayload {
  jobId: string
  assignmentId: string
  deviceId: string
  botTemplateId: string          // 'youtube-watch-v1'
  params: {
    keyword: string
    videoUrl: string
    durationMinPct: number
    durationMaxPct: number
    actionProbabilities: { like, comment, subscribe, playlist }
    skipAdTimeout: number
    watchTimeout: number
  }
  timeoutMs: number
}

interface JobCompletePayload {
  jobId: string
  assignmentId: string
  success: boolean
  durationMs: number
  result?: { actualWatchPct, didLike, didComment, didSubscribe, didPlaylist }
  error?: { code, message, stepId, recoverable }
}
```

---

## 7. REST API Endpoints

### Jobs

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/jobs` | 작업 목록 (페이징, 필터) |
| POST | `/api/jobs` | 작업 생성 |
| GET | `/api/jobs/:id` | 작업 상세 |
| PATCH | `/api/jobs/:id` | 작업 수정 |
| DELETE | `/api/jobs/:id` | 작업 삭제 |
| POST | `/api/jobs/:id/distribute` | 디바이스 그룹에 배포 |

### Devices

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/devices` | 디바이스 목록 |
| GET | `/api/devices/:id` | 디바이스 상세 + 헬스 |
| POST | `/api/devices/:id/command` | ADB 명령 실행 (reboot, screenshot 등) |
| POST | `/api/devices/batch-command` | 그룹 브로드캐스트 |

### Videos / Channels

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET/POST | `/api/videos` | 비디오 CRUD |
| POST | `/api/videos/bulk` | 대량 임포트 |
| GET/POST | `/api/channels` | 채널 모니터링 CRUD |

### System

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/health` | 서버 헬스 체크 |
| GET | `/ready` | Readiness probe |
| GET | `/metrics` | Prometheus 메트릭 |

---

## 8. Job Queue (BullMQ)

| 큐 이름 | 용도 | 재시도 |
|---------|------|--------|
| VIDEO_EXECUTION | 메인 작업 (YouTube 시청) | 3회, 지수 백오프 (5s) |
| DEVICE_COMMAND | 디바이스 제어 명령 | 2회, 고정 (3s) |
| METADATA_FETCH | YouTube 메타데이터 조회 | 3회, 지수 백오프 (2s) |
| COMMENT_GENERATION | AI 댓글 생성 (OpenAI) | 2회, 지수 백오프 (3s) |
| SCHEDULED_TASK | 크론 기반 스케줄 실행 | - |
| CLEANUP | 오래된 데이터 정리 | - |
| SCRIPT_EXECUTION | 커스텀 스크립트 실행 | - |
| DEVICE_REGISTRATION | 신규 디바이스 온보딩 | - |

---

## 9. Bot Catalog (Uncertainty Engine)

작업 실행 시 확률 기반 행동 결정 시스템.

```typescript
// 봇 템플릿 예시
{
  id: 'youtube-watch-v1',
  actions: {
    watch: { required: true },
    like: { probability: 0-100 },       // 작업별 설정
    comment: { probability: 0-100 },
    subscribe: { probability: 0-100 },
    playlist: { probability: 0-100 },
  },
  timing: {
    durationMinPct: 30,                 // 최소 시청 비율
    durationMaxPct: 100,                // 최대 시청 비율
    skipAdTimeout: 5000,
    watchTimeout: 300000,
  }
}
```

---

## 10. Error Code System

| 코드 | 카테고리 | 설명 |
|------|---------|------|
| E1001-E1xxx | 디바이스 | ADB 연결 실패, 디바이스 오프라인 등 |
| E2001-E2xxx | 작업 실행 | 타임아웃, 스크립트 오류 등 |
| E3001-E3xxx | 네트워크 | YouTube 접근 불가, API 한도 초과 등 |
| E4001-E4xxx | 시스템 | 내부 오류, 큐 장애 등 |

---

## 11. Deployment

### Docker Compose 구성

| 서비스 | 포트 | 역할 |
|--------|------|------|
| redis | 6379 | BullMQ/Celery 브로커 (512MB, LRU) |
| flower | 5555 | Celery 모니터링 UI |
| api | 8000 | FastAPI 서버 |
| appium | 4723 | Android UI 자동화 |
| celery-beat | - | 크론 스케줄러 (선택) |

### Dashboard Dockerfile

Multi-stage build: Node 20 Alpine → `next build` → standalone 서버 (포트 3000)

### 환경 변수 (주요)

```bash
# Supabase (필수)
SUPABASE_URL, SUPABASE_KEY, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET

# 서비스
REDIS_URL, SOCKET_PORT, CELERY_API_URL

# 인증
WORKER_SECRET_TOKEN, YOUTUBE_API_KEY, OPENAI_API_KEY

# 알림 (선택)
DISCORD_WEBHOOK, SLACK_WEBHOOK
```

---

## 12. Testing

- **프레임워크:** Vitest 4.0.18
- **대상:** desktop-agent (device, manager, workflow, recovery), backend (repositories), worker-core (HumanSimulator, InternalQueue)
- **실행:** `npm run test`, `npm run test:watch`, `npm run test:coverage`

---

## 13. 구현 완료 기능

### Phase 1 (MVP)
- YouTube 자동 시청 (시간/행동 커스터마이징)
- 확률 기반 행동 엔진 (좋아요/댓글/재생목록 0-100%)
- Supabase Realtime 실시간 모니터링
- 자동 재시도 (3회, 지수 백오프)
- 600+ 디바이스 추적/헬스 모니터링
- 배치 작업 배포 (디바이스 그룹 타겟팅)
- 실시간 진행률 업데이트 (WebSocket)

### Phase 2 (현재)
- Scrcpy 기반 실시간 스크린 미러링
- 대시보드에서 원격 터치/키보드 입력
- 샌드박스 JavaScript 실행 엔진
- 멀티 디바이스 동시 스트리밍 허브 (100+)
- Docker 기반 에뮬레이터 풀 프로비저닝
- OpenAI 기반 AI 댓글 자동 생성
- YouTube 채널 모니터링 (신규 영상 자동 수집)
- 키워드 검색 기반 작업

### Architecture
- 타입 안전성: 전체 코드베이스 100% TypeScript
- Repository 패턴: 타입 안전 Supabase 추상화 계층
- Canonical Event System: 4개 레거시 → 1개 통합 이벤트 맵
- Monorepo: Turbo 기반 멀티 패키지 관리

---

## 14. Tech Debt & 향후 과제

| 항목 | 상태 | 우선순위 |
|------|------|---------|
| RLS 정책 강화 (현재 allow-all) | 미완 | 높음 |
| 이벤트 시스템 통합 (4개 → 1개) | 진행중 | 높음 |
| 레거시 Celery → Node.js 전환 | 진행중 | 중간 |
| 디바이스 ID UUID 통합 | 부분 완료 | 중간 |
| E2E 테스트 프레임워크 | 미시작 | 중간 |
| 수평 확장 (Redis 클러스터링) | 미시작 | 낮음 |
| 분산 트레이싱 (Jaeger/Datadog) | 미시작 | 낮음 |
| 재해 복구 절차 | 미시작 | 낮음 |
