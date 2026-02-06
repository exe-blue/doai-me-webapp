# 마이크로서비스 분리 점검 (Microservices Separation Audit)

**문서 버전**: 1.0
**작성일**: 2026-02-07
**프로젝트**: DoAi.Me Device Automation Platform
**모노레포**: apps/*, packages/*, infra/*

---

## 1. 시스템 아키텍처 개요

### 1.1 전체 컴포넌트 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                  Electron UI (Desktop Agent)                 │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ 실시간 로깅   │  │  히트맵   │  │ 기기상태/로그 뷰    │  UI 계층   │
│  │ (event-log)  │  │ (canvas) │  │ (dashboard)        │   │
│  └─────────────┘  └──────────┘  └──────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Electron Manager Process (Main Thread)                 │ │
│  │  ├─ IPC Channel to Renderer                             │ │
│  │  ├─ WorkerRegistry + TaskDispatcher                     │ │
│  │  └─ ScreenStreamProxy                                   │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────┬─────────────────────────────────────────┘
                     │ Socket.IO + IPC
┌────────────────────▼─────────────────────────────────────────┐
│           Backend API Server (Node.js + Socket.IO)            │
│  ┌────────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ Socket.IO      │ │ REST API     │ │ Job Queue Worker   │  │
│  │ Manager        │ │ (Express)    │ │ (BullMQ/Redis)     │  │
│  │                │ │ • Projects   │ │                    │  │
│  │ Event Handlers │ │ • Campaigns  │ │ WorkflowWorker:    │  │
│  │ • cmd:*        │ │ • Sessions   │ │ execute jobs       │  │
│  │ • evt:*        │ │ • Analytics  │ │ from queue         │  │
│  └────────────────┘ └──────────────┘ └────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  QueueManager (BullMQ Integration)                     │  │
│  │  ├─ workflowQueue (job processing)                     │  │
│  │  ├─ AlertManager (health checks)                       │  │
│  │  └─ MetricsCollector (observability)                   │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────────────┘
                     │ Socket.IO (cmd:*, evt:*)
┌────────────────────▼─────────────────────────────────────────┐
│                    Worker Processes                            │
│  ┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐   │
│  │ youtube-bot     │ │ health-bot   │ │ install-bot      │   │
│  │ (@doai/youtube) │ │ (@doai/health)│ │ (TBD)            │   │
│  │                 │ │              │ │                  │   │
│  │ • Video watch   │ │ • Heartbeat  │ │ • App install    │   │
│  │ • Interactions  │ │ • Status     │ │ • Onboarding     │   │
│  │ • Engagement    │ │ • Metrics    │ │                  │   │
│  └─────────────────┘ └──────────────┘ └──────────────────┘   │
│  ┌─────────────────┐ ┌──────────────┐                         │
│  │ Custom Workers  │ │ Future Bots  │                         │
│  │ (Extensible)    │ │ (Registry)   │                         │
│  └─────────────────┘ └──────────────┘                         │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│          Message Broker & Task Queue                           │
│  ┌──────────────┐  ┌──────────┐  ┌─────────────────────────┐ │
│  │ BullMQ       │  │  Redis   │  │ Event Outbox (PG)       │ │
│  │ (Job Queue)  │  │ (Cache)  │  │ (Transactional Events)  │ │
│  └──────────────┘  └──────────┘  └─────────────────────────┘ │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│       Database (Supabase / PostgreSQL)                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ campaigns │ channels │ devices │ watch_sessions         │ │
│  │ event_outbox │ event_log │ bot_registry │ alerts        │ │
│  │ device_metrics │ user_settings                          │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 서비스 배포 단위

| 컴포넌트 | 배포 방식 | 프로세스 | 독립성 |
|---------|---------|--------|--------|
| Desktop Agent | Electron 앱 | Main (Manager) + Renderer (UI) | PARTIAL |
| Backend API | Node.js 서버 | Single process + Worker thread | YES |
| YouTube Bot | Node.js 워커 | Standalone process | YES |
| Health Bot | Node.js 워커 | Standalone process | YES |
| Install Bot | Node.js 워커 | Standalone process | YES |
| Dashboard | Next.js | SSR/Static | YES |
| Message Broker | Redis | Standalone service | YES |
| Database | PostgreSQL/Supabase | Managed service | YES |

---

## 2. 현재 아키텍처 분석

### 2.1 서비스별 책임 (Service Responsibilities)

#### Desktop Agent (apps/desktop-agent)
**역할**: 로컬 디바이스 컨트롤 매니저
- **Book**: Electron + Manager Process
- **책임**:
  - 로컬 기기 목록 관리 (ADB 연결)
  - 워커 프로세스 생명주기 관리
  - 백엔드와의 Socket.IO 통신
  - UI 이벤트 렌더링
- **독립성**: PARTIAL
  - ✅ 로컬에서 독립 실행 가능
  - ❌ Manager가 Electron에 강하게 임베디드 (SPOF)
- **의존성**:
  - `@doai/shared` (타입/유틸)
  - `socket.io-client` (백엔드 통신)
  - `bullmq`, `ioredis` (로컬 큐)

#### Backend API (apps/backend)
**역할**: 중앙 오케스트레이션 서버
- **스택**: Node.js + Express + Socket.IO
- **책임**:
  - 클라이언트(Electron/Dashboard) 접속 관리
  - 워커 명령 라우팅
  - 이벤트 로깅 및 상태 관리
  - 작업 큐(BullMQ) 관리
  - 데이터베이스 I/O
- **독립성**: YES
  - ✅ 완전히 독립 실행 가능
  - ✅ Docker/systemd 배포 가능
- **의존성**:
  - `@doai/shared` (타입)
  - `socket.io`, `express` (통신)
  - `bullmq`, `ioredis` (큐/캐시)
  - `@supabase/supabase-js` (DB)

#### YouTube Bot (apps/youtube-bot)
**역할**: 유튜브 자동화 워커
- **스택**: Node.js + TypeScript
- **책임**:
  - 유튜브 영상 시청 자동화
  - 사용자 상호작용 시뮬레이션
  - 상태 리포팅
- **독립성**: YES
  - ✅ `npm start` 또는 `node dist/index.js`로 독립 실행
  - ✅ 환경변수로 매니저 URL 지정
  - ✅ BullMQ 작업 처리 가능
- **의존성**:
  - `@doai/worker-core` (ADB/device 제어)
  - `@doai/worker-types` (타입)
  - `socket.io-client` (백엔드 통신)

#### Health Bot (apps/health-bot)
**역할**: 기기 상태 모니터링
- **스택**: Node.js + TypeScript
- **책임**:
  - 정기 헬스체크
  - CPU/메모리/온도 수집
  - 이상 상황 리포팅
- **독립성**: YES
  - ✅ 완전히 독립 실행 가능
  - ✅ 크론/스케줄 기반 동작
- **의존성**: YouTube Bot과 동일

#### Install Bot (apps/install-bot)
**역할**: 앱 설치 및 온보딩
- **상태**: TBD (구조는 youtube-bot/health-bot와 동일)
- **의존성**: 동일 패턴

#### Worker Core (packages/worker-core)
**역할**: 공유 워커 프레임워크
- **export**:
  - Logger, AdbController, DeviceManager, HumanSimulator
- **역할**:
  - 모든 워커가 사용하는 기본 라이브러리
  - ADB 프로토콜 추상화
  - 기기 관리 통합
- **독립성**: N/A (라이브러리)

#### Worker Types (packages/worker-types)
**역할**: 공유 타입 정의
- **export**: 모든 워커/서비스가 사용하는 인터페이스
- **독립성**: N/A (타입 라이브러리)

### 2.2 통신 프로토콜 및 패턴

#### Socket.IO 메시지 패턴

**Manager → Worker (명령)**
```typescript
// cmd:* namespace
socket.emit('cmd:execute', {
  taskId: string,
  action: string,
  payload: unknown,
  timestamp: number
});

// Worker → Manager (응답)
socket.emit('evt:result', {
  taskId: string,
  status: 'success' | 'failed',
  data: unknown,
  timestamp: number
});

// Worker → Manager (상태)
socket.emit('evt:status', {
  workerId: string,
  status: 'online' | 'busy' | 'idle' | 'error',
  metrics: object,
  timestamp: number
});
```

**문제점**:
- ❌ 표준 이벤트 엔벨로프 미정의
- ❌ eventId/traceId 없음 (추적 어려움)
- ❌ source 필드 없음 (출처 파악 어려움)

#### BullMQ 작업 큐

**WorkflowWorker가 처리하는 작업**
```typescript
queue.process('workflow', async (job) => {
  // job.data = { workflowId, steps, config }
  // 각 단계 실행
});
```

**현재 상황**:
- ✅ BullMQ 기반 큐 있음
- ❌ idempotency key 미정의
- ❌ retry policy 명확하지 않음
- ❌ dead-letter queue 없음

#### REST API

**사용 중인 엔드포인트** (apps/backend/src/routes)
- `/api/projects` - 프로젝트 관리
- `/api/campaigns` - 캠페인 관리
- `/api/devices` - 기기 목록
- `/api/sessions` - 세션 조회
- (Socket.IO로 실시간 기능 대체)

### 2.3 데이터베이스 구조

**주요 테이블**:
```
campaigns
├─ id (uuid)
├─ project_id (fk)
├─ name (string)
├─ status (enum)
└─ created_at (timestamp)

devices
├─ id (uuid)
├─ device_id (string, ADB ID)
├─ status (enum)
├─ metrics (jsonb)
└─ last_seen (timestamp)

watch_sessions
├─ id (uuid)
├─ campaign_id (fk)
├─ device_id (fk)
├─ video_url (string)
├─ duration_seconds (int)
└─ completed_at (timestamp)

event_outbox  ← 트랜잭션 보장용 (TBD)
├─ id (uuid)
├─ event_type (string)
├─ payload (jsonb)
├─ published (boolean)
└─ created_at (timestamp)

event_log  ← 이벤트 감사 로그
├─ id (uuid)
├─ event_type (string)
├─ source (string)
├─ payload (jsonb)
└─ created_at (timestamp)

bot_registry  ← 봇 메타데이터 (TBD)
├─ id (uuid)
├─ bot_name (string)
├─ bot_type (enum)
├─ status (enum)
├─ config (jsonb)
└─ updated_at (timestamp)
```

---

## 3. 마이크로서비스 평가 기준

### 3.1 평가 매트릭스

| 기준 | 현재 상태 | 근거 | 가중치 |
|------|---------|------|--------|
| **독립 배포 가능성** | ✅ PASS | 모든 워커가 독립 프로세스 | 20% |
| **독립 실행 가능성** | ⚠️ PARTIAL | Manager Electron 임베디드 | 15% |
| **이벤트 표준화** | ❌ FAIL | 공통 엔벨로프 미정의 | 20% |
| **Idempotency** | ❌ FAIL | 중복 방지 키 없음 | 15% |
| **재시도 정책** | ❌ FAIL | retry logic 미정의 | 10% |
| **장애 격리** | ⚠️ PARTIAL | 워커는 격리, Manager SPOF | 10% |
| **Dead-letter 처리** | ❌ FAIL | 실패 작업 처리 메커니즘 없음 | 5% |
| **봇 레지스트리** | ❌ FAIL | 하드코딩된 봇 목록 | 5% |

### 3.2 점수 계산

```
독립 배포: 85 × 20% = 17
독립 실행: 40 × 15% = 6
이벤트표준: 0 × 20% = 0
Idempotency: 0 × 15% = 0
재시도: 20 × 10% = 2
장애격리: 50 × 10% = 5
DLQ: 0 × 5% = 0
레지스트리: 0 × 5% = 0
─────────────────────
합계: 30/100 = PARTIAL (30%)
```

### 3.3 종합 판정: **PARTIAL**

**근거**:

✅ **이미 구현된 것** (Strengths):
- 봇 워커들이 독립 앱으로 분리되어 있음
- BullMQ/Redis 기반 작업 큐 인프라 존재
- Socket.IO 통신 인프라 구축됨
- 각 워커가 CLI 명령(`npm start`)으로 독립 실행 가능
- 환경변수 기반 설정 가능

❌ **부족한 것** (Weaknesses):
- 이벤트 메시지 엔벨로프 표준 미정의
  - eventId, traceId, source, occurredAt 필드 없음
  - 이벤트 추적 불가능
- Idempotency key 정의 부재
  - 중복 메시지 처리 불가능
  - 네트워크 재전송 시 중복 실행 위험
- 재시도 정책 미정의
  - exponential backoff 없음
  - max retries 미정의
- Dead-letter queue 없음
  - 실패한 이벤트/작업 처리 불가
  - 문제 원인 파악 어려움
- 봇 레지스트리 없음
  - 새 봇 추가 시 코드 수정 필요
  - 동적 봇 관리 불가능
- Manager가 Electron에 임베디드
  - Manager 장애 = 전체 데스크톱 에이전트 중단 (SPOF)
  - 로컬에서만 실행 가능 (서버 배포 불가)

---

## 4. Gap Actions: PARTIAL → PASS 로드맵

### Phase 1: 이벤트 표준화 (1-2주, 우선순위: 🔴 HIGH)

#### 1.1 Event Envelope 정의

**파일**: `packages/shared/src/events.ts`

```typescript
// 모든 이벤트가 따를 표준 구조
interface EventEnvelope<T = unknown> {
  // 고유 식별자 (중복 방지)
  eventId: string;

  // 분산 추적 (trace across services)
  traceId: string;

  // 이벤트 출처
  source: 'manager' | 'backend' | 'youtube-bot' | 'health-bot' | 'dashboard';

  // 이벤트 타입 (topic)
  eventType: 'campaign.started' | 'device.online' | 'task.completed' | ...;

  // 실제 데이터
  payload: T;

  // 발생 시간 (ISO 8601)
  occurredAt: string;

  // 선택: idempotency key (중복 방지)
  idempotencyKey?: string;
}

// 예시
const event: EventEnvelope<{deviceId: string}> = {
  eventId: 'evt_12345',
  traceId: 'trace_abc123',
  source: 'manager',
  eventType: 'device.online',
  payload: { deviceId: 'emulator-5554' },
  occurredAt: new Date().toISOString(),
  idempotencyKey: 'device.online:emulator-5554'
};
```

#### 1.2 Socket.IO 메시지 업그레이드

**Before**:
```typescript
socket.emit('evt:status', {
  workerId: 'youtube-bot-1',
  status: 'online'
});
```

**After**:
```typescript
socket.emit('evt:status', {
  eventId: generateId(),
  traceId: getTraceId(),
  source: 'youtube-bot',
  eventType: 'worker.status.changed',
  payload: {
    workerId: 'youtube-bot-1',
    status: 'online'
  },
  occurredAt: new Date().toISOString(),
  idempotencyKey: `worker.status.youtube-bot-1:${timestamp}`
} as EventEnvelope);
```

#### 1.3 토픽 네이밍 규칙

**표준 format**: `{domain}.{entity}.{action}`

```
Domain examples:
- campaign.* (캠페인 관련)
- device.* (기기 관련)
- worker.* (워커 관련)
- task.* (작업 관련)
- health.* (모니터링)
- system.* (시스템)

Examples:
campaign.created
campaign.started
campaign.completed
campaign.failed

device.online
device.offline
device.error

worker.registered
worker.status.changed
worker.task.accepted
worker.task.completed

task.queued
task.executing
task.completed
task.failed

health.check.started
health.check.completed

system.error
system.alert
```

### Phase 2: 신뢰성 강화 (2-3주, 우선순위: 🔴 HIGH)

#### 2.1 Event Outbox 패턴 구현

**목표**: DB 트랜잭션과 이벤트 발행의 원자성 보장

**패턴**:
```typescript
// 1. 비즈니스 로직 + 이벤트를 한 트랜잭션으로 처리
async function startCampaign(campaignId: string) {
  const result = await db.transaction(async (tx) => {
    // 1a. 상태 변경
    const campaign = await tx.table('campaigns')
      .update({ status: 'running', started_at: now })
      .where({ id: campaignId });

    // 1b. 이벤트 저장 (같은 트랜잭션)
    await tx.table('event_outbox').insert({
      event_id: generateId(),
      event_type: 'campaign.started',
      payload: { campaignId },
      published: false,  // 아직 발행 안 됨
      created_at: now
    });

    return campaign;
  });

  // 2. 별도 프로세스가 event_outbox 폴링
  // 발행되지 않은 이벤트를 찾아서 Socket.IO/RabbitMQ로 발행
}
```

**Event Outbox Poller** (백엔드 서비스):
```typescript
// 1초마다 실행
setInterval(async () => {
  const unpublished = await db.table('event_outbox')
    .where({ published: false })
    .limit(100);

  for (const event of unpublished) {
    try {
      // Socket.IO 또는 Redis Pub/Sub으로 발행
      io.emit('event:published', event);

      // 발행 완료 표시
      await db.table('event_outbox')
        .update({ published: true })
        .where({ id: event.id });
    } catch (error) {
      logger.error('Failed to publish event', event.id);
      // 다음 루프에서 재시도
    }
  }
}, 1000);
```

#### 2.2 Dead-Letter Queue 구현

**BullMQ DLQ 설정**:
```typescript
const workflowQueue = new Queue('workflow', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,  // 최대 3회 시도
    backoff: {
      type: 'exponential',
      delay: 2000  // 2초부터 시작
    },
    removeOnComplete: true,
    removeOnFail: false  // 실패 작업 보관
  }
});

// 실패한 작업 이벤트 리스너
workflowQueue.on('failed', async (job, error) => {
  logger.error('Job failed', {
    jobId: job.id,
    attempts: job.attemptsMade,
    error: error.message
  });

  // DLQ 테이블에 기록
  await db.table('dead_letter_queue').insert({
    job_id: job.id,
    queue_name: 'workflow',
    job_data: job.data,
    error_message: error.message,
    failed_at: new Date(),
    retry_count: job.attemptsMade
  });

  // 알림 발송 (Slack/Email)
  await alerting.send({
    severity: 'error',
    message: `Job ${job.id} failed after ${job.attemptsMade} attempts`,
    context: { jobData: job.data }
  });
});

// DLQ 수동 재처리
app.post('/api/dlq/:jobId/retry', async (req, res) => {
  const dlqEntry = await db.table('dead_letter_queue')
    .where({ job_id: req.params.jobId })
    .first();

  if (!dlqEntry) {
    return res.status(404).json({ error: 'Not found' });
  }

  // 작업을 큐에 다시 추가
  await workflowQueue.add(dlqEntry.job_data, {
    jobId: `${dlqEntry.job_id}-retry`
  });

  res.json({ status: 'requeued' });
});
```

#### 2.3 Idempotency Key 처리

**미들웨어**:
```typescript
import { LRUCache } from 'lru-cache';

const idempotencyCache = new LRUCache<string, unknown>({
  max: 10000,  // 최대 10k 요청 저장
  ttl: 1000 * 60 * 60 * 24  // 24시간
});

// 모든 Socket.IO 이벤트 핸들러에 적용
function withIdempotency(handler: (event: EventEnvelope) => Promise<void>) {
  return async (event: EventEnvelope) => {
    if (!event.idempotencyKey) {
      return handler(event);
    }

    // 이미 처리한 요청이면 스킵
    if (idempotencyCache.has(event.idempotencyKey)) {
      logger.debug('Duplicate event, skipping', {
        eventId: event.eventId,
        idempotencyKey: event.idempotencyKey
      });
      return;
    }

    try {
      const result = await handler(event);
      idempotencyCache.set(event.idempotencyKey, result);
      return result;
    } catch (error) {
      // 에러는 캐시하지 않음 (재시도 가능)
      throw error;
    }
  };
}

// 사용
io.on('cmd:execute', withIdempotency(async (event) => {
  // 실제 작업 로직
}));
```

### Phase 3: 봇 레지스트리 & 관찰성 (1-2주, 우선순위: 🟡 MEDIUM)

#### 3.1 Bot Registry 테이블

**마이그레이션**:
```sql
CREATE TABLE bot_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id VARCHAR(100) UNIQUE NOT NULL,
  bot_name VARCHAR(255) NOT NULL,
  bot_type ENUM('youtube', 'health', 'install', 'custom') NOT NULL,
  status ENUM('active', 'inactive', 'deprecated') DEFAULT 'active',
  entry_point VARCHAR(500) NOT NULL,  -- 'node dist/index.js' 등
  config JSONB DEFAULT '{}'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  last_heartbeat TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 예시 데이터
INSERT INTO bot_registry (bot_id, bot_name, bot_type, entry_point, config) VALUES
  ('youtube-bot', 'YouTube Automation', 'youtube', 'node dist/index.js', '{"maxConcurrent": 5}'),
  ('health-bot', 'Device Health Monitor', 'health', 'node dist/index.js', '{"interval": 30000}'),
  ('install-bot', 'App Installation', 'install', 'node dist/index.js', '{}');
```

#### 3.2 Bot Registry API

**Backend API** (`apps/backend/src/routes/bots.ts`):
```typescript
// 모든 봇 조회
app.get('/api/bots/registry', async (req, res) => {
  const bots = await db.table('bot_registry')
    .where({ status: 'active' })
    .select('*');
  res.json(bots);
});

// 특정 봇 상태 조회
app.get('/api/bots/:botId/status', async (req, res) => {
  const bot = await db.table('bot_registry')
    .where({ bot_id: req.params.botId })
    .first();

  if (!bot) {
    return res.status(404).json({ error: 'Not found' });
  }

  // 마지막 헬스체크
  const lastHeartbeat = bot.last_heartbeat;
  const isHealthy = lastHeartbeat &&
    (Date.now() - new Date(lastHeartbeat).getTime()) < 60000;

  res.json({
    bot_id: bot.bot_id,
    status: isHealthy ? 'healthy' : 'unhealthy',
    last_heartbeat: lastHeartbeat,
    uptime_percent: await getUptimePercent(bot.bot_id)
  });
});

// 봇 등록 (동적)
app.post('/api/bots/register', async (req, res) => {
  const { botId, botName, botType, entryPoint, config } = req.body;

  const result = await db.table('bot_registry').insert({
    bot_id: botId,
    bot_name: botName,
    bot_type: botType,
    entry_point: entryPoint,
    config: config || {},
    status: 'active'
  });

  res.status(201).json(result);
});
```

#### 3.3 Desktop UI 업데이트

**Electron Renderer** (`apps/desktop-agent/src/renderer.tsx`):
```typescript
// 버튼이나 메뉴에서 동적으로 봇 레지스트리 로드
async function loadBots() {
  const response = await fetch('http://localhost:3000/api/bots/registry');
  const bots = await response.json();

  // 레지스트리 기반 UI 생성 (하드코딩 제거)
  return bots.map(bot => ({
    id: bot.bot_id,
    label: bot.bot_name,
    type: bot.bot_type,
    status: 'unknown'  // 실시간으로 업데이트됨
  }));
}

// 메뉴 구성
const botMenu = await loadBots();
botMenu.forEach(bot => {
  menuItem({
    label: bot.label,
    enabled: bot.status === 'healthy',
    click: () => startBot(bot.id)
  });
});
```

#### 3.4 중앙 집중 로깅 (선택)

**로깅 토픽**:
```typescript
// 모든 워커에서
logger.info('Bot started', {
  workerId: 'youtube-bot-1',
  timestamp: new Date().toISOString()
});

// 백엔드의 로깅 수신기
io.on('log:event', async (logEntry) => {
  await db.table('event_log').insert({
    event_type: 'log',
    source: logEntry.source,
    level: logEntry.level,
    message: logEntry.message,
    payload: logEntry,
    created_at: new Date()
  });
});
```

### Phase 4: Manager 분리 (선택, 3-4주, 우선순위: 🟢 LOW)

**목표**: Electron에 임베디드된 Manager를 독립 서비스로 분리

#### 4.1 아키텍처 변경

**Before**:
```
[Electron] = [Manager (Process)] + [Renderer (UI)]
```

**After**:
```
[Electron UI] ←IPC→ [Manager Service] ←Socket.IO→ [Backend]
```

#### 4.2 Manager를 별도 서비스로 추출

**새 앱**: `apps/manager`
- WorkerRegistry 로직
- TaskDispatcher 로직
- ScreenStreamProxy 로직
- Electron과는 IPC 또는 REST로만 통신

#### 4.3 배포 옵션

**로컬 배포** (현재):
```bash
# Terminal 1
npm run start:agent  # Electron UI

# Terminal 2
npm run start:manager  # Manager service (localhost:3001)
```

**서버 배포** (선택):
```bash
# Docker 컨테이너로 배포 가능
docker run -e BACKEND_URL=https://api.doai.me \
           -e WORKER_PORT=3001 \
           doai-manager:latest
```

**HA 구성** (고급):
```
[Load Balancer]
├─ [Manager Service 1]
├─ [Manager Service 2]
└─ [Manager Service 3]
    ↓
[Shared Redis] (워커 상태 공유)
```

---

## 5. 점검 체크리스트

### 현재 상태 (Baseline)

- [ ] Socket.IO 기반 cmd/evt 통신 구현되어 있음
- [ ] BullMQ/Redis 작업 큐 설정되어 있음
- [ ] 봇 워커들이 독립 프로세스로 분리됨
- [ ] 모든 워커가 `npm start`로 독립 실행 가능
- [ ] 데이터베이스 기본 스키마 있음

### Phase 1 체크리스트 (이벤트 표준화)

- [ ] EventEnvelope 인터페이스 정의 (`packages/shared/src/events.ts`)
- [ ] eventId 생성 유틸 구현
- [ ] traceId 생성 및 전파 로직
- [ ] 모든 Socket.IO 이벤트 업그레이드
- [ ] 토픽 네이밍 규칙 문서화
- [ ] 백엔드 이벤트 핸들러 수정
- [ ] 워커 이벤트 발행 로직 수정
- [ ] 타입 체크 통과 (`npm run typecheck`)
- [ ] 통합 테스트 통과

### Phase 2 체크리스트 (신뢰성)

- [ ] event_outbox 테이블 마이그레이션
- [ ] Event Outbox Poller 구현
- [ ] BullMQ dead-letter queue 설정
- [ ] DLQ 모니터링 대시보드
- [ ] Idempotency 미들웨어 구현
- [ ] 재시도 정책 테스트
- [ ] 장애 시뮬레이션 테스트

### Phase 3 체크리스트 (레지스트리)

- [ ] bot_registry 테이블 마이그레이션
- [ ] Bot Registry REST API 구현
- [ ] Electron UI 업데이트 (동적 봇 로드)
- [ ] 봇 헬스체크 로직
- [ ] Uptime 추적
- [ ] 중앙 로깅 (선택)

### Phase 4 체크리스트 (Manager 분리, 선택)

- [ ] `apps/manager` 앱 생성
- [ ] WorkerRegistry 로직 이동
- [ ] TaskDispatcher 로직 이동
- [ ] Electron IPC 통신 구현
- [ ] 로컬 테스트
- [ ] Docker 이미지 빌드
- [ ] 서버 배포 테스트

---

## 6. 권장 사항 및 Best Practices

### 6.1 이벤트 설계 원칙

1. **도메인 기반 이벤트 분류**: `campaign.*`, `device.*` 등으로 명확히 분류
2. **버전 관리**: 이벤트 스키마 변경 시 `v1`, `v2` 접미사 사용
3. **페이로드 설계**: 필드는 immutable하게, 충분한 정보 포함
4. **타임스탬프**: 모든 이벤트에 `occurredAt` 포함 (UTC ISO 8601)

### 6.2 워커 개발 가이드

**새 봇 추가 시 반드시**:
1. EventEnvelope 사용 → `packages/shared` 타입 활용
2. bot_registry에 등록 → API 통해 동적 로드 가능
3. Idempotency key 설정 → 중복 처리 방지
4. Error handling → 재시도 가능한 상태로
5. Graceful shutdown → SIGTERM 처리

### 6.3 모니터링 및 알림

**필수 메트릭**:
- 워커별 가동률 (uptime %)
- 작업 큐 길이 (pending jobs)
- 작업 처리 시간 (latency p50, p95, p99)
- 실패율 (failed/total)
- DLQ 크기

**알림 조건**:
- 워커 오프라인 > 5분
- DLQ에 이벤트 > 10개
- 작업 지연 > 1시간

### 6.4 보안 고려사항

1. **이벤트 페이로드**: 민감한 정보(비밀번호, 토큰) 제외
2. **접근 제어**: Manager-Worker 통신 인증 추가
3. **감사 로깅**: 모든 중요 이벤트 기록
4. **에러 메시지**: 외부 노출 최소화

---

## 7. 예상 효과

### Phase 1-3 완료 후

| 항목 | Before | After |
|-----|--------|-------|
| 마이크로서비스 성숙도 | 30% (PARTIAL) | 75% (MATURE) |
| 이벤트 추적 가능성 | ❌ | ✅ 100% |
| 중복 메시지 방지 | ❌ | ✅ |
| 자동 재시도 | ❌ | ✅ exponential backoff |
| DLQ 처리 | ❌ | ✅ 자동 + 수동 |
| 봇 동적 로드 | ❌ | ✅ 코드 수정 불필요 |
| 운영 오버헤드 | 높음 | 낮음 |

### Phase 4 완료 후 (선택)

| 항목 | Before | After |
|-----|--------|-------|
| Manager SPOF | ✅ (위험) | ❌ (이중화 가능) |
| 배포 유연성 | 낮음 | 높음 |
| 확장성 | 로컬 한정 | 전역 분산 가능 |
| 마이크로서비스 성숙도 | 75% | 90%+ |

---

## 8. 참고 자료

### 마이크로서비스 아키텍처 패턴

- **Event Sourcing**: 모든 상태 변화를 이벤트로 기록
- **Event Outbox**: 트랜잭션 보장 (Transactional Outbox Pattern)
- **Dead-Letter Queue**: 실패 처리 (DLQ Pattern)
- **Saga Pattern**: 분산 트랜잭션 (향후 고려)
- **Circuit Breaker**: 장애 격리 (향후 고려)

### 관련 문서

- [Event Contracts](./event-contracts.md) - 이벤트 스키마 상세
- [DB Schema](./db-schema-draft.md) - 데이터베이스 구조
- [Bot Catalog](./bot-catalog.md) - 봇 목록 및 사양

### 외부 참고

- [BullMQ Documentation](https://docs.bullmq.io)
- [Socket.IO Best Practices](https://socket.io/docs/v4/socket-io-protocol/)
- [Event-driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [Microservices Patterns](https://microservices.io/patterns/index.html)

---

## 9. 다음 단계

1. **이해관계자 검토**: 현재 평가 공유 및 피드백 수집
2. **Phase 1 시작**: 2주 스프린트로 이벤트 표준화 착수
3. **CI/CD 업데이트**: 테스트 및 타입 체크 강화
4. **문서화**: 각 phase 완료 후 개발자 가이드 작성
5. **정기 검토**: 매월 진행도 점검 및 로드맵 조정

---

**문서 정보**:
- 마지막 업데이트: 2026-02-07
- 작성자: DoAi.Me Team
- 상태: Draft (검토 대기)
