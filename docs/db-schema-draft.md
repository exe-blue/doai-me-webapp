# DB 스키마 초안 (Database Schema Draft)

**Last Updated:** 2026-02-07
**Status:** Draft
**Database:** PostgreSQL (Supabase)

---

## 목차

1. [개요](#1-개요)
2. [핵심 테이블 정의](#2-핵심-테이블-정의)
3. [상태 머신](#3-상태-머신)
4. [워크플로우 파이프라인](#4-워크플로우-파이프라인)
5. [Idempotency 제약 조건](#5-idempotency-제약-조건)
6. [이벤트 기반 아키텍처](#6-이벤트-기반-아키텍처)
7. [인덱스 전략](#7-인덱스-전략)
8. [뷰 및 유틸리티 함수](#8-뷰-및-유틸리티-함수)

---

## 1. 개요

### 1.1 설계 원칙

- **Event-Driven**: 모든 상태 변화는 이벤트로 발행
- **Idempotency-First**: 중복 처리 방지를 위한 UNIQUE 제약
- **Outbox Pattern**: 신뢰성 있는 이벤트 발행 (At-Least-Once Delivery)
- **State Machine**: 명확한 상태 전환 규칙
- **Audit Trail**: 모든 변경 사항 추적 가능

### 1.2 데이터 모델 계층

```
┌─────────────────────────────────────────────┐
│ 입력 계층 (campaigns, channels, keywords)   │
├─────────────────────────────────────────────┤
│ 실행 계층 (watch_sessions, devices)         │
├─────────────────────────────────────────────┤
│ 이벤트 계층 (event_outbox, event_log)       │
├─────────────────────────────────────────────┤
│ 인프라 계층 (nodes, workflows, bot_registry)│
└─────────────────────────────────────────────┘
```

---

## 2. 핵심 테이블 정의

### 2.1 campaigns (캠페인/영상 등록)

YouTube 영상의 등록 및 상태 관리. 시청 작업의 최상위 단위입니다.

```sql
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  channel_handle TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  keyword TEXT,
  keyword_source TEXT DEFAULT 'MANUAL'
    CHECK (keyword_source IN ('MANUAL', 'DERIVED_FROM_TITLE')),
  registration_method TEXT DEFAULT 'manual'
    CHECK (registration_method IN ('manual', 'API')),
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),

  -- 통계
  target_views INT DEFAULT 100,
  completed_views INT DEFAULT 0,
  failed_views INT DEFAULT 0,

  -- 메타데이터
  metadata JSONB DEFAULT '{}',

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE UNIQUE INDEX idx_campaigns_video_id ON campaigns (video_id);
CREATE INDEX idx_campaigns_status ON campaigns (status);
CREATE INDEX idx_campaigns_channel ON campaigns (channel_handle, created_at DESC);
CREATE INDEX idx_campaigns_created ON campaigns (created_at DESC);

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON campaigns
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read campaigns" ON campaigns
  FOR SELECT USING (true);
```

**컬럼 설명:**
- `video_id`: YouTube 영상 ID (유일성 보장)
- `channel_handle`: @handle 형식의 채널 구분자
- `canonical_url`: 영상 URL (youtube.com/watch?v=...)
- `keyword`: 이 캠페인 관련 검색 키워드
- `keyword_source`: 키워드가 수동 입력인지, 제목에서 추출된 것인지 구분
- `registration_method`: API vs 수동 등록 구분 (감사 용도)
- `metadata`: 추가 메타데이터 (영상 길이, 업로더, 등록 정보 등)

---

### 2.2 channels (채널)

YouTube 채널 정보 및 모니터링 상태.

```sql
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL UNIQUE,
  youtube_channel_id TEXT,
  display_name TEXT,
  thumbnail_url TEXT,

  -- 모니터링
  push_subscription_status TEXT DEFAULT 'none'
    CHECK (push_subscription_status IN ('none', 'active', 'expired', 'failed')),
  monitoring_enabled BOOLEAN DEFAULT true,
  last_video_check_at TIMESTAMPTZ,

  -- 통계
  subscriber_count INT,
  video_count INT DEFAULT 0,
  total_views INT DEFAULT 0,

  -- 메타데이터
  metadata JSONB DEFAULT '{}',

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE UNIQUE INDEX idx_channels_handle ON channels (handle);
CREATE INDEX idx_channels_monitoring ON channels (monitoring_enabled)
  WHERE monitoring_enabled = true;
CREATE INDEX idx_channels_created ON channels (created_at DESC);

-- RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON channels
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read channels" ON channels
  FOR SELECT USING (true);
```

**컬럼 설명:**
- `handle`: @채널명 형식 또는 정규화된 채널 식별자
- `push_subscription_status`: YouTube Data API 푸시 구독 상태
- `monitoring_enabled`: 자동 신규 영상 감지 활성화 여부

---

### 2.3 devices (디바이스)

Android 스마트폰 디바이스 등록 및 상태 관리.

```sql
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 노드 연결 (선택사항)
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,

  -- 식별자
  device_number INTEGER,
  smartphone_number TEXT,
  serial_number TEXT UNIQUE,

  -- 디바이스 정보
  model TEXT DEFAULT 'Galaxy S9',
  android_version TEXT,

  -- 연결 상태
  connected BOOLEAN DEFAULT false,
  status_key TEXT DEFAULT 'OFFLINE'
    CHECK (status_key IN ('ONLINE', 'BUSY', 'ERROR', 'OFFLINE', 'MAINTENANCE')),

  -- 모니터링
  battery_level INTEGER CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100)),
  ip_address TEXT,
  last_seen_at TIMESTAMPTZ,

  -- 에러 추적
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,

  -- 메타데이터
  metadata JSONB DEFAULT '{}',

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_devices_node ON devices (node_id);
CREATE INDEX idx_devices_connected ON devices (connected);
CREATE INDEX idx_devices_status ON devices (status_key);
CREATE INDEX idx_devices_serial ON devices (serial_number);
CREATE INDEX idx_devices_last_seen ON devices (last_seen_at DESC);

-- RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON devices
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read devices" ON devices
  FOR SELECT USING (true);
```

**컬럼 설명:**
- `serial_number`: ADB 시리얼 번호 (고유성 보장)
- `status_key`: ONLINE/BUSY/ERROR/OFFLINE/MAINTENANCE
- `device_number`: PC 내 순차 번호 (선택사항)
- `smartphone_number`: 비즈니스 레벨 관리번호

---

### 2.4 watch_sessions (시청 세션)

개별 시청 작업의 상태 및 진행 상황.

```sql
CREATE TABLE IF NOT EXISTS watch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 고유 식별자
  watch_id TEXT NOT NULL UNIQUE,  -- YYYYMMDD_handle_###

  -- 관계
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- 상태
  status TEXT DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'READY', 'RUNNING', 'PAUSED', 'ENDED', 'FAILED')),

  -- 우선순위
  priority_enabled BOOLEAN DEFAULT false,
  priority_updated_at TIMESTAMPTZ,

  -- 시청 설정
  target_views INTEGER,
  completed_views INTEGER DEFAULT 0,
  watch_duration_min_pct INTEGER DEFAULT 30,
  watch_duration_max_pct INTEGER DEFAULT 100,

  -- 사용자 행동 (구독, 좋아요, 댓글 확률)
  prob_like INTEGER DEFAULT 0 CHECK (prob_like >= 0 AND prob_like <= 100),
  prob_comment INTEGER DEFAULT 0 CHECK (prob_comment >= 0 AND prob_comment <= 100),
  prob_subscribe INTEGER DEFAULT 0 CHECK (prob_subscribe >= 0 AND prob_subscribe <= 100),

  -- 실행 타임스탬프
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- 메타데이터
  metadata JSONB DEFAULT '{}',

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE UNIQUE INDEX idx_watch_sessions_watch_id ON watch_sessions (watch_id);
CREATE INDEX idx_watch_sessions_status ON watch_sessions (status);
CREATE INDEX idx_watch_sessions_campaign ON watch_sessions (campaign_id);
CREATE INDEX idx_watch_sessions_priority ON watch_sessions
  (priority_enabled DESC, priority_updated_at DESC NULLS LAST);
CREATE INDEX idx_watch_sessions_created ON watch_sessions (created_at DESC);

-- RLS
ALTER TABLE watch_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON watch_sessions
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read watch_sessions" ON watch_sessions
  FOR SELECT USING (true);
```

**컬럼 설명:**
- `watch_id`: 포맷: `YYYYMMDD_<normalizedHandle>_<seq3>` (예: `20260207_techreview_001`)
- `status`: QUEUED → READY → RUNNING → ENDED/PAUSED/FAILED
- `priority_enabled`: 우선 처리 플래그
- `watch_duration_min_pct/max_pct`: 영상의 30~100% 시청 (무작위 구간)
- `prob_*`: 각 행동의 실행 확률 (0~100%)

---

### 2.5 watch_session_devices (시청-디바이스 매핑)

Watch Session이 어느 디바이스에서 실행되는지 추적.

```sql
CREATE TABLE IF NOT EXISTS watch_session_devices (
  watch_session_id UUID NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,

  -- 상태
  viewing_state TEXT DEFAULT 'ASSIGNED'
    CHECK (viewing_state IN ('ASSIGNED', 'VIEWING', 'ENDED', 'ERROR')),

  -- 타임스탬프
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- 메타데이터
  error_message TEXT,
  metadata JSONB DEFAULT '{}',

  PRIMARY KEY (watch_session_id, device_id)
);

-- 인덱스
CREATE INDEX idx_wsd_device ON watch_session_devices (device_id);
CREATE INDEX idx_wsd_state ON watch_session_devices (viewing_state);
CREATE INDEX idx_wsd_assigned ON watch_session_devices (assigned_at DESC);

-- RLS
ALTER TABLE watch_session_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON watch_session_devices
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read watch_session_devices" ON watch_session_devices
  FOR SELECT USING (true);
```

**컬럼 설명:**
- `viewing_state`: ASSIGNED (대기) → VIEWING (진행중) → ENDED (완료) / ERROR
- 복합 PK로 중복 할당 방지

---

### 2.6 event_outbox (이벤트 아웃박스)

신뢰성 있는 이벤트 발행을 위한 Outbox Pattern 구현.

```sql
CREATE TABLE IF NOT EXISTS event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 이벤트 정의
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,

  -- 추적
  trace_id UUID,
  source_service TEXT,  -- 'backend', 'desktop-agent', etc.
  source_instance TEXT,  -- 서비스 인스턴스 ID

  -- 발행 상태
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,  -- NULL = 미발행

  -- 메타데이터
  metadata JSONB DEFAULT '{}'
);

-- 인덱스
CREATE INDEX idx_outbox_unpublished ON event_outbox (created_at)
  WHERE published_at IS NULL;
CREATE INDEX idx_outbox_type ON event_outbox (event_type);
CREATE INDEX idx_outbox_trace ON event_outbox (trace_id)
  WHERE trace_id IS NOT NULL;
CREATE INDEX idx_outbox_created ON event_outbox (created_at DESC);

-- RLS
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON event_outbox
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read event_outbox" ON event_outbox
  FOR SELECT USING (true);
```

**컬럼 설명:**
- `event_type`: 'campaign.created', 'watch.started', 'action.performed' 등
- `trace_id`: 분산 추적 ID (전체 요청 흐름 추적)
- `published_at`: NULL이면 아직 발행 대기 중

**이벤트 타입 예시:**

```json
{
  "event_type": "campaign.created",
  "payload_json": {
    "campaign_id": "550e8400-e29b-41d4-a716-446655440000",
    "video_id": "dQw4w9WgXcQ",
    "title": "Example Video",
    "keyword": "example"
  }
}
```

---

### 2.7 event_dead_letter (Dead Letter Queue)

발행 실패한 이벤트 격리 및 재처리.

```sql
CREATE TABLE IF NOT EXISTS event_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 원본 이벤트
  original_event_id UUID,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,

  -- 추적
  trace_id UUID,

  -- 실패 정보
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- 재처리 상태
  failed_at TIMESTAMPTZ DEFAULT NOW(),
  reprocessed_at TIMESTAMPTZ,

  -- 메타데이터
  metadata JSONB DEFAULT '{}'
);

-- 인덱스
CREATE INDEX idx_dead_letter_unprocessed ON event_dead_letter (failed_at)
  WHERE reprocessed_at IS NULL;
CREATE INDEX idx_dead_letter_type ON event_dead_letter (event_type);
CREATE INDEX idx_dead_letter_created ON event_dead_letter (failed_at DESC);

-- RLS
ALTER TABLE event_dead_letter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON event_dead_letter
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read event_dead_letter" ON event_dead_letter
  FOR SELECT USING (true);
```

---

### 2.8 event_log (실시간 이벤트 로그)

UI 실시간 모니터링용 구조화된 로그.

```sql
CREATE TABLE IF NOT EXISTS event_log (
  id BIGSERIAL PRIMARY KEY,

  -- 타임스탐프
  ts TIMESTAMPTZ DEFAULT NOW(),

  -- 로그 레벨 및 분류
  level TEXT CHECK (level IN ('INFO', 'WARN', 'ERROR')) DEFAULT 'INFO',
  category TEXT CHECK (category IN ('MANAGER', 'BOT', 'DEVICE', 'WATCH', 'SYSTEM')),

  -- 메시지
  message TEXT NOT NULL,
  context_json JSONB,

  -- 관련 엔티티
  bot_key TEXT,
  device_id TEXT,
  watch_id TEXT,
  trace_id UUID,

  -- 메타데이터
  metadata JSONB DEFAULT '{}'
);

-- 인덱스
CREATE INDEX idx_event_log_ts ON event_log (ts DESC);
CREATE INDEX idx_event_log_level ON event_log (level);
CREATE INDEX idx_event_log_category ON event_log (category);
CREATE INDEX idx_event_log_watch ON event_log (watch_id)
  WHERE watch_id IS NOT NULL;
CREATE INDEX idx_event_log_device ON event_log (device_id)
  WHERE device_id IS NOT NULL;

-- RLS
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON event_log
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read event_log" ON event_log
  FOR SELECT USING (true);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE event_log;
```

**로그 예시:**

```json
{
  "level": "INFO",
  "category": "WATCH",
  "message": "Video watch started",
  "context_json": {
    "duration_sec": 185,
    "watch_progress": 0
  },
  "watch_id": "20260207_techreview_001",
  "device_id": "R58M41XXXXX"
}
```

---

### 2.9 bot_registry (봇 레지스트리)

시스템에 등록된 모든 봇(자동화 규칙)의 정의 및 메타데이터.

```sql
CREATE TABLE IF NOT EXISTS bot_registry (
  key TEXT PRIMARY KEY,

  -- 기본 정보
  name_ko TEXT NOT NULL,
  description_ko TEXT,

  -- 분류
  category TEXT CHECK (category IN ('VIDEO', 'CHANNEL', 'DEVICE', 'INFRA', 'TROUBLESHOOTING')),

  -- 기능 정의
  capabilities_json JSONB DEFAULT '[]',
  inputs_json JSONB DEFAULT '[]',
  outputs_json JSONB DEFAULT '[]',

  -- Idempotency
  idempotency_keys_json JSONB DEFAULT '[]',

  -- 재시도 정책
  retry_policy_json JSONB DEFAULT '{"maxRetries": 3, "backoffMs": [1000, 3000, 10000]}',

  -- 상태
  enabled BOOLEAN DEFAULT true,

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_bot_registry_enabled ON bot_registry (enabled)
  WHERE enabled = true;
CREATE INDEX idx_bot_registry_category ON bot_registry (category);

-- RLS
ALTER TABLE bot_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON bot_registry
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Public read bot_registry" ON bot_registry
  FOR SELECT USING (true);
```

**봇 레지스트리 예시:**

```json
{
  "key": "VIDEO_SEARCH_BOT",
  "name_ko": "영상 검색 봇",
  "description_ko": "YouTube API를 통해 키워드로 영상 검색",
  "category": "VIDEO",
  "capabilities_json": [
    "search_youtube",
    "fetch_metadata"
  ],
  "inputs_json": [
    {
      "name": "keyword",
      "type": "string",
      "required": true
    }
  ],
  "outputs_json": [
    {
      "name": "video_id",
      "type": "string"
    },
    {
      "name": "title",
      "type": "string"
    }
  ],
  "idempotency_keys_json": ["keyword"],
  "retry_policy_json": {
    "maxRetries": 3,
    "backoffMs": [1000, 3000, 10000]
  }
}
```

---

### 2.10 기존 테이블 (nodes, workflows, workflow_executions, execution_logs)

이미 001_initial_schema.sql에서 정의된 인프라 테이블.

```sql
-- nodes: PC 클라이언트 노드
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
  ip_address TEXT,
  device_capacity INT DEFAULT 100,
  connected_devices INT DEFAULT 0,
  last_seen TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- workflows: 워크플로우 정의
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  version INT DEFAULT 1,
  steps JSONB NOT NULL DEFAULT '[]',
  params JSONB DEFAULT '{}',
  timeout INT DEFAULT 300000,
  retry_policy JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- workflow_executions: 워크플로우 실행 기록
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id TEXT UNIQUE,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  device_ids TEXT[] DEFAULT '{}',
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed', 'cancelled')),
  params JSONB DEFAULT '{}',
  result JSONB,
  current_step TEXT,
  progress INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- execution_logs: 상세 실행 로그
CREATE TABLE IF NOT EXISTS execution_logs (
  id BIGSERIAL PRIMARY KEY,
  execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
  device_id TEXT,
  workflow_id TEXT,
  step_id TEXT,
  level TEXT DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  status TEXT CHECK (status IN ('started', 'progress', 'completed', 'failed', 'skipped', 'retrying')),
  message TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. 상태 머신

### 3.1 Campaign 상태 전환

```
┌─────────────┐
│   active    │ ◄──────────┐
└────┬────────┘            │
     │                      │ toggle
     │ all views done       │
     ▼                      │
┌─────────────┐            │
│  completed  │            │
└─────────────┘            │
     ▲                      │
     │ cancel               │
     │               ┌──────┴──────┐
     │               │   paused    │
     │               └─────────────┘
     │
┌────┴────────┐
│  cancelled  │
└─────────────┘
```

**상태 정의:**
- `active`: 활성 상태, 시청 작업 진행 중
- `paused`: 일시 정지 상태, 재개 가능
- `completed`: 모든 시청 완료 또는 수동 완료 처리
- `cancelled`: 취소됨, 재개 불가능

---

### 3.2 Watch Session 상태 전환

```
┌────────┐
│ QUEUED │  디바이스 미할당, 대기 중
└────┬───┘
     │ 디바이스 할당 + 준비 완료
     ▼
┌───────┐
│ READY │  할당 완료, 시청 대기
└────┬──┘
     │ 시청 시작
     ▼
┌────────┐
│ RUNNING│  진행 중
└────┬────┘
     │ pause
     ▼
┌───────┐
│ PAUSED│  일시 정지
└────┬──┘
     │ resume
     ▼ (RUNNING으로 돌아감)

또는 (RUNNING/PAUSED에서)
     │ 정상 완료
     ▼
┌──────┐
│ ENDED│  정상 종료
└──────┘

또는 (아무 상태에서)
     │ 에러 발생
     ▼
┌───────┐
│ FAILED│  오류로 실패
└───────┘
```

**상태 정의:**
- `QUEUED`: 생성됨, 디바이스 아직 미할당
- `READY`: 디바이스 할당 완료, 앱/환경 준비 완료
- `RUNNING`: 영상 재생 중
- `PAUSED`: 일시정지 (인사이드 RUNNING)
- `ENDED`: 정상 종료 (시청 완료)
- `FAILED`: 오류로 인한 실패

---

### 3.3 Watch Session Device 상태 전환

```
┌──────────┐
│ ASSIGNED │  디바이스에 할당
└────┬─────┘
     │ 시청 시작
     ▼
┌────────┐
│ VIEWING│  영상 재생 중
└────┬───┘
     │ 시청 완료
     ▼
┌──────┐
│ ENDED│  정상 종료
└──────┘

또는 (ASSIGNED/VIEWING에서)
     │ 에러 발생
     ▼
┌──────┐
│ ERROR│  오류 종료
└──────┘
```

---

## 4. 워크플로우 파이프라인

Campaign 등록부터 종료까지의 전체 이벤트 흐름:

```
1. campaign.created
   ↓
2. KEYWORD_BOT: 키워드 추출/설정
   ↓ → event: keyword.set
   ↓
3. video.search.requested
   ↓
4. VIDEO_SEARCH_BOT: YouTube API 검색
   ↓ → event: video.search.completed
   ↓
5. watch.prepare.requested
   ↓
6. WATCH_PREPARE_BOT:
   - 디바이스 할당
   - 앱 설치/업데이트
   - 계정 준비
   ↓ → event: watch.ready
   ↓
7. watch.started (watch_sessions.status = RUNNING)
   ↓
8. VIDEO_WATCH_BOT:
   - 영상 재생
   - 진행도 모니터링
   - 재시도 로직
   ↓ → event: watch.progress (진행 중)
   ↓
9. watch.ended (watch_sessions.status = ENDED)
   ↓
10. USER_ACTION_BOT:
    - 좋아요 클릭 (확률 기반)
    - 댓글 작성 (확률 기반)
    - 구독 (확률 기반)
    ↓ → event: action.performed
    ↓
11. VIDEO_END_BOT:
    - 리소스 해제
    - 통계 기록
    - cleanup
    ↓ → event: campaign.updated
```

**Event Outbox에 저장되는 이벤트:**
1. `campaign.created` - Campaign 생성
2. `keyword.set` - 키워드 설정
3. `video.search.requested` - 검색 요청
4. `video.search.completed` - 검색 완료
5. `watch.prepare.requested` - 준비 요청
6. `watch.ready` - 준비 완료
7. `watch.started` - 시청 시작
8. `watch.progress` - 진행도 업데이트
9. `watch.ended` - 시청 종료
10. `action.performed` - 사용자 행동 수행
11. `campaign.updated` - Campaign 상태 업데이트

---

## 5. Idempotency 제약 조건

### 5.1 UNIQUE 제약

| 테이블 | 컬럼 | 목적 |
|--------|------|------|
| `campaigns` | `video_id` | 동일 영상 재등록 방지 |
| `watch_sessions` | `watch_id` | 시청 고유 번호 유일성 |
| `channels` | `handle` | 채널 중복 등록 방지 |
| `devices` | `serial_number` | 디바이스 중복 등록 방지 |
| `event_outbox` | `id` (UUID PK) | 이벤트 중복 발행 방지 |
| `bot_registry` | `key` | 봇 키 유일성 |

### 5.2 Composite Key

| 테이블 | 컬럼 조합 | 목적 |
|--------|---------|------|
| `watch_session_devices` | `(watch_session_id, device_id)` | 1 세션 = 1 디바이스 |

### 5.3 Partial Unique Index

```sql
-- 동일 campaign 내에서 device 중복 할당 방지
CREATE UNIQUE INDEX idx_watch_session_devices_unique
ON watch_session_devices (watch_session_id, device_id);
```

---

## 6. 이벤트 기반 아키텍처

### 6.1 Outbox Pattern Flow

```
┌──────────────┐
│ Application  │
└──────┬───────┘
       │ 1. 데이터 변경 + 이벤트 함께 저장 (트랜잭션)
       │
       ▼
┌───────────────────┐
│ event_outbox      │
│ published_at=NULL │
└──────┬────────────┘
       │ 2. Outbox Poller (background job)
       │    아직 발행 안 된 이벤트 발견
       │
       ▼
┌─────────────────────────┐
│ Event Publisher Service │
│ (Kafka/RabbitMQ/etc)    │
└──────┬──────────────────┘
       │ 3. 이벤트 발행
       │
       ▼
┌────────────────┐
│ Event Handlers │
│ (Subscribers)  │
└────────────────┘

4. Handler 처리 완료 후
   ↓
event_outbox.published_at = NOW()
```

### 6.2 Dead Letter Queue Flow

```
이벤트 발행 실패
       │
       ▼
┌──────────────────────────────┐
│ event_dead_letter            │
│ retry_count < max_retries    │
└──────┬───────────────────────┘
       │ 재시도 (백그라운드)
       │
       ├─ Success: 이동 → event_outbox
       │
       └─ 최대 재시도 초과
          ↓
          알림 + 수동 처리 필요
```

### 6.3 Event 페이로드 구조

```json
{
  "event_type": "watch.started",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-07T14:30:00Z",
  "source_service": "backend",
  "source_instance": "backend-instance-1",
  "payload": {
    "watch_session_id": "550e8400-e29b-41d4-a716-446655440001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440002",
    "device_id": "550e8400-e29b-41d4-a716-446655440003",
    "started_at": "2026-02-07T14:30:00Z"
  }
}
```

---

## 7. 인덱스 전략

### 7.1 성능 최적화 인덱스

```sql
-- campaigns
CREATE INDEX idx_campaigns_channel ON campaigns (channel_handle, created_at DESC);
CREATE INDEX idx_campaigns_status ON campaigns (status);

-- watch_sessions
CREATE INDEX idx_watch_sessions_status ON watch_sessions (status);
CREATE INDEX idx_watch_sessions_priority ON watch_sessions
  (priority_enabled DESC, priority_updated_at DESC NULLS LAST);

-- devices
CREATE INDEX idx_devices_status ON devices (status_key);
CREATE INDEX idx_devices_node ON devices (node_id);

-- event_outbox
CREATE INDEX idx_outbox_unpublished ON event_outbox (created_at)
  WHERE published_at IS NULL;

-- event_log
CREATE INDEX idx_event_log_ts ON event_log (ts DESC);
CREATE INDEX idx_event_log_watch ON event_log (watch_id)
  WHERE watch_id IS NOT NULL;
```

### 7.2 쿼리 최적화 팁

1. **status 조회**: 인덱스 활용
   ```sql
   SELECT * FROM watch_sessions WHERE status = 'RUNNING';
   ```

2. **우선순위 정렬**: Composite index 활용
   ```sql
   SELECT * FROM watch_sessions
   WHERE status = 'QUEUED'
   ORDER BY priority_enabled DESC, priority_updated_at DESC NULLS LAST
   LIMIT 10;
   ```

3. **미발행 이벤트**: Partial index (published_at IS NULL)
   ```sql
   SELECT * FROM event_outbox
   WHERE published_at IS NULL
   ORDER BY created_at ASC
   LIMIT 100;
   ```

---

## 8. 뷰 및 유틸리티 함수

### 8.1 유용한 뷰

```sql
-- 캠페인별 진행 상황
CREATE OR REPLACE VIEW campaign_progress AS
SELECT
  c.id,
  c.video_id,
  c.title,
  c.status,
  c.completed_views,
  c.target_views,
  ROUND(100.0 * c.completed_views / NULLIF(c.target_views, 0), 2) as progress_pct,
  COUNT(ws.id) as total_watch_sessions,
  COUNT(ws.id) FILTER (WHERE ws.status = 'RUNNING') as running_sessions,
  COUNT(ws.id) FILTER (WHERE ws.status = 'ENDED') as completed_sessions,
  COUNT(ws.id) FILTER (WHERE ws.status = 'FAILED') as failed_sessions
FROM campaigns c
LEFT JOIN watch_sessions ws ON ws.campaign_id = c.id
GROUP BY c.id, c.video_id, c.title, c.status, c.completed_views, c.target_views;

-- 디바이스별 활동 현황
CREATE OR REPLACE VIEW device_activity AS
SELECT
  d.id,
  d.serial_number,
  d.model,
  d.status_key,
  d.battery_level,
  COUNT(wsd.watch_session_id) as total_watches,
  COUNT(wsd.watch_session_id) FILTER (WHERE wsd.viewing_state = 'VIEWING') as active_watches,
  MAX(wsd.started_at) as last_activity
FROM devices d
LEFT JOIN watch_session_devices wsd ON wsd.device_id = d.id
GROUP BY d.id, d.serial_number, d.model, d.status_key, d.battery_level;

-- 실시간 시스템 상태
CREATE OR REPLACE VIEW system_status AS
SELECT
  (SELECT COUNT(*) FROM nodes WHERE status = 'online') as online_nodes,
  (SELECT COUNT(*) FROM nodes) as total_nodes,
  (SELECT COUNT(*) FROM devices WHERE status_key = 'ONLINE') as online_devices,
  (SELECT COUNT(*) FROM devices) as total_devices,
  (SELECT COUNT(*) FROM watch_sessions WHERE status = 'RUNNING') as active_watches,
  (SELECT COUNT(*) FROM watch_sessions WHERE status = 'QUEUED') as queued_watches,
  (SELECT COUNT(*) FROM event_outbox WHERE published_at IS NULL) as unpublished_events,
  (SELECT COUNT(*) FROM event_dead_letter WHERE reprocessed_at IS NULL) as failed_events;
```

### 8.2 유틸리티 함수

```sql
-- watch_id 생성 함수
CREATE OR REPLACE FUNCTION generate_watch_id(
  p_date DATE DEFAULT CURRENT_DATE,
  p_handle TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_seq INT;
  v_watch_id TEXT;
BEGIN
  -- Format: YYYYMMDD_handle_###
  v_prefix := TO_CHAR(p_date, 'YYYYMMDD') || '_' ||
              LOWER(REGEXP_REPLACE(p_handle, '[^a-zA-Z0-9_.-]', '_', 'g'));

  -- Advisory lock per prefix to prevent race conditions
  -- hashtext() returns a stable int4 hash; concurrent calls with
  -- the same prefix serialize here, different prefixes proceed in parallel.
  PERFORM pg_advisory_xact_lock(hashtext(v_prefix));

  -- Get next sequence (safe under advisory lock)
  SELECT COALESCE(MAX(CAST(SPLIT_PART(watch_id, '_', -1) AS INT)), 0) + 1
  INTO v_seq
  FROM watch_sessions
  WHERE watch_id LIKE v_prefix || '_%';

  v_watch_id := v_prefix || '_' || LPAD(v_seq::TEXT, 3, '0');

  RETURN v_watch_id;
END;
$$ LANGUAGE plpgsql;

-- 캠페인 진행도 업데이트
CREATE OR REPLACE FUNCTION update_campaign_progress(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET
    completed_views = (
      SELECT COUNT(*)
      FROM watch_sessions
      WHERE campaign_id = p_campaign_id AND status = 'ENDED'
    ),
    failed_views = (
      SELECT COUNT(*)
      FROM watch_sessions
      WHERE campaign_id = p_campaign_id AND status = 'FAILED'
    ),
    status = CASE
      WHEN completed_views >= target_views THEN 'completed'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- 이벤트 발행 표시
CREATE OR REPLACE FUNCTION mark_event_published(p_event_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE event_outbox
  SET published_at = NOW()
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;
```

### 8.3 RLS (Row Level Security) 정책

```sql
-- 모든 테이블에 대해 서비스 역할 전체 접근
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_session_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_registry ENABLE ROW LEVEL SECURITY;

-- Backend (service_role) 전체 접근
DO $$
BEGIN
  FOREACH var IN ARRAY ARRAY['campaigns', 'channels', 'devices', 'watch_sessions',
                              'watch_session_devices', 'event_outbox', 'event_dead_letter',
                              'event_log', 'bot_registry'] LOOP
    EXECUTE format('CREATE POLICY "Service role full access on %I" ON %I FOR ALL USING (auth.role() = ''service_role'')', var, var);
  END LOOP;
END $$;

-- Dashboard (anon/authenticated) 읽기 전용
DO $$
BEGIN
  FOREACH var IN ARRAY ARRAY['campaigns', 'channels', 'devices', 'watch_sessions',
                              'watch_session_devices', 'event_outbox', 'event_dead_letter',
                              'event_log', 'bot_registry'] LOOP
    EXECUTE format('CREATE POLICY "Public read on %I" ON %I FOR SELECT USING (true)', var, var);
  END LOOP;
END $$;
```

---

## 9. 초기화 및 유지보수

### 9.1 타임스탬프 자동 갱신 트리거

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 모든 주요 테이블에 적용
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_watch_sessions_updated_at BEFORE UPDATE ON watch_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_bot_registry_updated_at BEFORE UPDATE ON bot_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 9.2 정기 유지보수

```sql
-- Dead Letter Queue 정리 (7일 이상 미처리)
DELETE FROM event_dead_letter
WHERE reprocessed_at IS NULL
  AND failed_at < NOW() - INTERVAL '7 days'
  AND retry_count >= max_retries;

-- 오래된 로그 삭제 (30일 이상)
DELETE FROM execution_logs
WHERE created_at < NOW() - INTERVAL '30 days';

-- 오래된 이벤트 로그 삭제 (90일 이상, 이미 발행된 것만)
DELETE FROM event_log
WHERE ts < NOW() - INTERVAL '90 days';
```

---

## 10. 마이그레이션 체크리스트

배포 시 확인 사항:

- [ ] 모든 테이블 생성
- [ ] 모든 인덱스 생성
- [ ] RLS 정책 활성화
- [ ] 트리거 생성 (updated_at)
- [ ] Realtime 발행 활성화 (event_log)
- [ ] 초기 bot_registry 데이터 삽입
- [ ] 권한 설정 (GRANT)
- [ ] Backup 테스트
- [ ] 성능 테스트 (대량 데이터)

---

## 11. 참고 자료

### Event Types

```
campaign.*: created, updated, cancelled, completed
keyword.*: set, updated
video.*: search.requested, search.completed, search.failed
watch.*: prepare.requested, ready, started, progress, paused, resumed, ended, failed
action.*: performed (like, comment, subscribe)
device.*: online, offline, error, quarantine
node.*: online, offline, error
bot.*: executed, failed, retrying
```

### 향후 개선 사항

1. **Event Streaming**: Kafka 통합 (고성능 이벤트 처리)
2. **CQRS**: 읽기 모델 분리 (대시보드 성능 최적화)
3. **Time Series Data**: InfluxDB 연동 (metrics)
4. **Full-Text Search**: elasticsearch 연동 (로그 검색)
5. **Message Queue**: 비동기 작업 처리 (Celery/Bull)

---

**마지막 업데이트:** 2026-02-07
**작성자:** DoAi.Me 개발팀
