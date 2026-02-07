# 이벤트 계약서 (Event Contracts)

**Version:** 1.0.0
**Last Updated:** 2026-02-07
**Status:** Active

---

## 1. 개요 (Overview)

DoAi.Me 시스템은 **Event-Driven Architecture**를 기반으로 모든 서비스가 표준화된 이벤트 엔벨로프를 통해 통신합니다. 각 이벤트는 멱등성(Idempotency)이 보장되어야 하며, 실패한 이벤트는 Dead-Letter Queue로 이동됩니다.

### Key Principles

| Principle | Description |
|-----------|------------|
| **Standardized Envelope** | 모든 이벤트는 동일한 메타데이터 구조를 따름 |
| **Topic-Based Routing** | 이벤트는 토픽 기반으로 라우팅됨 |
| **Idempotent Processing** | 같은 이벤트 재처리 시에도 부작용 없음 |
| **Traceable Flow** | traceId를 통한 전체 요청 추적 가능 |
| **Dead-Letter Handling** | 실패 이벤트의 체계적인 관리 및 복구 |

---

## 2. 이벤트 엔벨로프 (Standardized Envelope)

모든 이벤트는 다음과 같은 표준 엔벨로프를 따릅니다:

```typescript
interface EventEnvelope<T = unknown> {
  // 고유 이벤트 식별자 (UUID v4)
  eventId: string;

  // 이벤트 타입 (e.g., "watch.started", "campaign.created")
  eventType: string;

  // 이벤트 발생 시간 (ISO 8601 UTC)
  occurredAt: string;

  // 분산 추적 ID (요청의 전체 여정 추적)
  traceId: string;

  // 이벤트 발생지 정보
  source: {
    // 서비스 이름 또는 봇 ID
    service: string;

    // 인스턴스 ID (호스트명, 워커 ID 등)
    instanceId: string;
  };

  // 이벤트 데이터 (토픽별 스키마 정의)
  payload: T;
}
```

### Example Event

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "watch.started",
  "occurredAt": "2026-02-07T12:00:00.123Z",
  "traceId": "abc123def456",
  "source": {
    "service": "VIDEO_WATCH",
    "instanceId": "node_1.example.com"
  },
  "payload": {
    "watchId": "20260207_channelname_001",
    "campaignId": "uuid-campaign-001",
    "botId": "VIDEO_WATCH",
    "deviceIds": ["device_001", "device_002"],
    "startedAt": "2026-02-07T12:00:00Z"
  }
}
```

---

## 3. 토픽 목록 (Topic Registry)

### 토픽 정의 규칙

- **네이밍:** `<domain>.<action>` (예: `watch.started`, `campaign.created`)
- **프로듀서:** 해당 토픽의 이벤트를 발행하는 서비스/봇
- **컨슈머:** 해당 토픽의 이벤트를 구독하는 서비스/봇
- **멱등성 키:** 중복 처리 방지를 위한 유일 식별자 조합

### Complete Topic Registry

| # | Topic | Producer | Consumer(s) | Idempotency Key | Description |
|---|-------|----------|-------------|-----------------|-------------|
| 1 | `campaign.created` | 영상등록 봇 | 키워드봇 | `campaignId` &#124; `videoId` | 새 캠페인(영상) 등록 |
| 2 | `channel.registered` | 채널등록 봇 | Manager | `channelHandle` | 채널 등록 완료 |
| 3 | `channel.video_uploaded` | Manager (polling) | 영상등록 봇 | `channelHandle + videoId` | 채널에 새 영상 감지 |
| 4 | `video.search.requested` | 키워드봇 | 영상검색 봇 | `campaignId` | 영상 검색 요청 |
| 5 | `video.search.completed` | 영상검색 봇 | 시청준비 봇 | `campaignId` | 영상 검색 완료 |
| 6 | `watch.prepare.requested` | Manager | 시청준비 봇 | `watchId` | 시청 준비 요청 |
| 7 | `watch.ready` | 시청준비 봇 | 영상시청 봇 | `watchId` | 시청 준비 완료 |
| 8 | `watch.started` | 영상시청 봇 | Manager, `log.event` | `watchId` | 시청 시작 |
| 9 | `watch.progress` | 영상시청 봇 | Manager | `watchId + timestamp` | 시청 진행 상황 |
| 10 | `watch.ended` | 영상시청 봇 | 유저액션 봇, 영상종료 봇 | `watchId` | 시청 완료 |
| 11 | `action.requested` | Manager | 유저액션 봇 | `watchId + actionType` | 유저 액션 요청 |
| 12 | `action.performed` | 유저액션 봇 | Manager, `log.event` | `watchId + actionType + deviceId` | 유저 액션 수행 완료 |
| 13 | `device.registered` | 기기등록 봇 | 기기상태 봇 | `deviceId` | 디바이스 등록 |
| 14 | `device.status.updated` | 기기상태 봇 | Manager, Electron UI | `deviceId + statusUpdatedAt` | 디바이스 상태 변경 |
| 15 | `troubleshoot.reconnect.requested` | Manager | 문제해결 봇-재접속 | `deviceId` | 재접속 요청 |
| 16 | `troubleshoot.reconnect.completed` | 문제해결 봇-재접속 | Manager | `deviceId` | 재접속 완료 |
| 17 | `log.event` | 모든 서비스 | Electron UI (실시간 로깅) | `eventId` | 중앙 집중 로그 |

---

## 4. 페이로드 스키마 (Payload Schemas)

### 4.1 campaign.created

**Topic:** `campaign.created`
**Producer:** 영상등록 봇
**Consumer:** 키워드봇

```typescript
interface CampaignCreatedPayload {
  // 캠페인 고유 ID (UUID)
  campaignId: string;

  // YouTube 비디오 ID
  videoId: string;

  // 비디오 제목
  title: string;

  // 채널 핸들 (예: "channel_name")
  channelHandle: string;

  // YouTube 비디오 URL
  canonicalUrl: string;

  // 검색 키워드
  keyword: string;

  // 키워드 출처
  keywordSource: "MANUAL" | "DERIVED_FROM_TITLE";

  // 캠페인 생성자
  createdBy: string;

  // 생성 시간
  createdAt: string;
}
```

**Idempotency Key:** `campaignId` or `videoId` (campaigns.video_id UNIQUE constraint)

**Example:**

```json
{
  "campaignId": "550e8400-e29b-41d4-a716-446655440000",
  "videoId": "dQw4w9WgXcQ",
  "title": "혁신적인 기술 리뷰",
  "channelHandle": "tech_channel",
  "canonicalUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "keyword": "기술 리뷰",
  "keywordSource": "MANUAL",
  "createdBy": "user_123",
  "createdAt": "2026-02-07T12:00:00Z"
}
```

---

### 4.2 channel.registered

**Topic:** `channel.registered`
**Producer:** 채널등록 봇
**Consumer:** Manager

```typescript
interface ChannelRegisteredPayload {
  // 채널 핸들
  channelHandle: string;

  // 채널명
  channelName: string;

  // YouTube 채널 URL
  channelUrl: string;

  // 채널 구독자 수
  subscriberCount?: number;

  // 등록 시간
  registeredAt: string;
}
```

**Idempotency Key:** `channelHandle`

---

### 4.3 channel.video_uploaded

**Topic:** `channel.video_uploaded`
**Producer:** Manager (polling)
**Consumer:** 영상등록 봇

```typescript
interface ChannelVideoUploadedPayload {
  // 채널 핸들
  channelHandle: string;

  // YouTube 비디오 ID
  videoId: string;

  // 비디오 제목
  videoTitle: string;

  // 비디오 업로드 시간
  uploadedAt: string;

  // 비디오 설명
  description?: string;
}
```

**Idempotency Key:** `channelHandle + videoId`

---

### 4.4 video.search.requested

**Topic:** `video.search.requested`
**Producer:** 키워드봇
**Consumer:** 영상검색 봇

```typescript
interface VideoSearchRequestedPayload {
  // 캠페인 ID
  campaignId: string;

  // 검색 키워드
  keyword: string;

  // 선택: 직접 등록 시 비디오 ID
  videoIdHint?: string;

  // 선택: 제목 힌트
  titleHint?: string;

  // 검색 요청 시간
  requestedAt: string;
}
```

**Idempotency Key:** `campaignId`

---

### 4.5 video.search.completed

**Topic:** `video.search.completed`
**Producer:** 영상검색 봇
**Consumer:** 시청준비 봇

```typescript
interface VideoSearchCompletedPayload {
  // 캠페인 ID
  campaignId: string;

  // 검색 성공 여부
  success: boolean;

  // 검색된 비디오 정보
  video?: {
    videoId: string;
    title: string;
    channelHandle: string;
    channelName: string;
    duration: number; // 초 단위
    uploadedAt: string;
  };

  // 검색 실패 시 오류 메시지
  error?: string;

  // 완료 시간
  completedAt: string;
}
```

**Idempotency Key:** `campaignId`

---

### 4.6 watch.prepare.requested

**Topic:** `watch.prepare.requested`
**Producer:** Manager
**Consumer:** 시청준비 봇

```typescript
interface WatchPrepareRequestedPayload {
  // 시청 고유 ID
  watchId: string;

  // 캠페인 ID
  campaignId: string;

  // 비디오 ID
  videoId: string;

  // 할당된 디바이스 ID 목록
  deviceIds: string[];

  // 목표 시청 시간 (초)
  targetWatchSeconds: number;

  // 요청 시간
  requestedAt: string;
}
```

**Idempotency Key:** `watchId`

---

### 4.7 watch.ready

**Topic:** `watch.ready`
**Producer:** 시청준비 봇
**Consumer:** 영상시청 봇

```typescript
interface WatchReadyPayload {
  // 시청 ID
  watchId: string;

  // 캠페인 ID
  campaignId: string;

  // 비디오 ID
  videoId: string;

  // YouTube 비디오 ID
  youtubeId: string;

  // 할당된 디바이스 목록
  devices: Array<{
    deviceId: string;
    status: "ready" | "error";
    error?: string;
  }>;

  // 준비 완료 시간
  readyAt: string;
}
```

**Idempotency Key:** `watchId`

---

### 4.8 watch.started

**Topic:** `watch.started`
**Producer:** 영상시청 봇
**Consumer:** Manager, `log.event`

```typescript
interface WatchStartedPayload {
  // 시청 ID (Format: YYYYMMDD_channelname_###)
  watchId: string;

  // 캠페인 ID
  campaignId: string;

  // 봇 ID (예: "VIDEO_WATCH")
  botId: string;

  // 실제 시청하는 디바이스 ID 목록
  deviceIds: string[];

  // 시청 시작 시간
  startedAt: string;
}
```

**Idempotency Key:** `watchId`

**Example:**

```json
{
  "watchId": "20260207_techchannel_001",
  "campaignId": "550e8400-e29b-41d4-a716-446655440000",
  "botId": "VIDEO_WATCH",
  "deviceIds": ["device_001", "device_002"],
  "startedAt": "2026-02-07T12:05:00Z"
}
```

---

### 4.9 watch.progress

**Topic:** `watch.progress`
**Producer:** 영상시청 봇
**Consumer:** Manager

```typescript
interface WatchProgressPayload {
  // 시청 ID
  watchId: string;

  // 캠페인 ID
  campaignId: string;

  // 디바이스 ID
  deviceId: string;

  // 진행도 (0-100%)
  progressPct: number;

  // 시청한 시간 (초)
  watchedSec: number;

  // 비디오 전체 길이 (초)
  totalSec: number;

  // 진행 상황 업데이트 시간
  timestamp: string;
}
```

**Idempotency Key:** `watchId + deviceId + timestamp`

**Throttle:** 최대 1초에 1회씩만 발행 (과도한 이벤트 방지)

---

### 4.10 watch.ended

**Topic:** `watch.ended`
**Producer:** 영상시청 봇
**Consumer:** 유저액션 봇, 영상종료 봇

```typescript
interface WatchEndedPayload {
  // 시청 ID
  watchId: string;

  // 캠페인 ID
  campaignId: string;

  // 디바이스 ID
  deviceId: string;

  // 종료 이유
  reason: "COMPLETED" | "MANUAL_STOP" | "ERROR" | "TIMEOUT";

  // 실제 시청 시간 (초)
  watchedSec: number;

  // 비디오 전체 길이 (초)
  totalSec: number;

  // 시청 완료율 (%)
  completionPct: number;

  // 종료 시간
  endedAt: string;
}
```

**Idempotency Key:** `watchId + deviceId`

---

### 4.11 action.requested

**Topic:** `action.requested`
**Producer:** Manager
**Consumer:** 유저액션 봇

```typescript
interface ActionRequestedPayload {
  // 시청 ID
  watchId: string;

  // 캠페인 ID
  campaignId: string;

  // 디바이스 ID
  deviceId: string;

  // 요청할 액션 목록 (확률 정보 포함)
  actions: Array<{
    // 액션 타입
    type: "LIKE" | "COMMENT" | "SUBSCRIBE" | "SAVE" | "MAKE_SHORTS";

    // 이 액션을 수행할 확률 (0.0 ~ 1.0)
    probability: number;
  }>;

  // 한 세션 내 최대 액션 수
  maxActionsPerSession: number;

  // 요청 시간
  requestedAt: string;
}
```

**Idempotency Key:** `watchId + actionType` (각 액션 타입별로 중복 방지)

**Example:**

```json
{
  "watchId": "20260207_techchannel_001",
  "campaignId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceId": "device_001",
  "actions": [
    { "type": "LIKE", "probability": 0.3 },
    { "type": "COMMENT", "probability": 0.05 },
    { "type": "SUBSCRIBE", "probability": 0.1 },
    { "type": "SAVE", "probability": 0.02 },
    { "type": "MAKE_SHORTS", "probability": 0.01 }
  ],
  "maxActionsPerSession": 2,
  "requestedAt": "2026-02-07T12:10:00Z"
}
```

---

### 4.12 action.performed

**Topic:** `action.performed`
**Producer:** 유저액션 봇
**Consumer:** Manager, `log.event`

```typescript
interface ActionPerformedPayload {
  // 시청 ID
  watchId: string;

  // 캠페인 ID
  campaignId: string;

  // 디바이스 ID
  deviceId: string;

  // 액션 타입
  actionType: "LIKE" | "COMMENT" | "SUBSCRIBE" | "SAVE" | "MAKE_SHORTS";

  // 액션 성공 여부
  success: boolean;

  // 액션 실패 시 오류 메시지
  error?: string;

  // 액션 수행 시간
  performedAt: string;
}
```

**Idempotency Key:** `watchId + actionType + deviceId`

---

### 4.13 device.registered

**Topic:** `device.registered`
**Producer:** 기기등록 봇
**Consumer:** 기기상태 봇

```typescript
interface DeviceRegisteredPayload {
  // 디바이스 고유 ID
  deviceId: string;

  // 디바이스 타입
  deviceType: "ANDROID_PHONE" | "ANDROID_TABLET" | "EMULATOR";

  // 시리얼 번호
  serialNumber: string;

  // 모델명
  model: string;

  // Android 버전
  androidVersion: string;

  // IP 주소
  ipAddress: string;

  // 연결 방식
  connectionType: "USB" | "NETWORK";

  // USB 포트 (USB 연결 시)
  usbPort?: string;

  // 등록 노드
  nodeId: string;

  // 등록 시간
  registeredAt: string;
}
```

**Idempotency Key:** `deviceId`

---

### 4.14 device.status.updated

**Topic:** `device.status.updated`
**Producer:** 기기상태 봇
**Consumer:** Manager, Electron UI

```typescript
interface DeviceStatusUpdatedPayload {
  // 디바이스 ID
  deviceId: string;

  // 연결 상태
  connected: boolean;

  // 상태 키
  statusKey: "ONLINE" | "BUSY" | "ERROR" | "OFFLINE";

  // 현재 노드 ID
  nodeId: string;

  // 스마트폰 번호 (식별용)
  smartphoneNumber?: string;

  // 배터리 레벨 (%)
  batteryLevel: number;

  // 상태 업데이트 시간
  updatedAt: string;
}
```

**Idempotency Key:** `deviceId + statusUpdatedAt`

**Example:**

```json
{
  "deviceId": "device_001",
  "connected": true,
  "statusKey": "ONLINE",
  "nodeId": "node_1.example.com",
  "smartphoneNumber": "010-1234-5678",
  "batteryLevel": 85,
  "updatedAt": "2026-02-07T12:00:00Z"
}
```

---

### 4.15 troubleshoot.reconnect.requested

**Topic:** `troubleshoot.reconnect.requested`
**Producer:** Manager
**Consumer:** 문제해결 봇-재접속

```typescript
interface TroubleshootReconnectRequestedPayload {
  // 디바이스 ID
  deviceId: string;

  // 재접속 시도 번호
  attemptNumber: number;

  // 요청 이유
  reason: string;

  // 요청 시간
  requestedAt: string;
}
```

**Idempotency Key:** `deviceId`

---

### 4.16 troubleshoot.reconnect.completed

**Topic:** `troubleshoot.reconnect.completed`
**Producer:** 문제해결 봇-재접속
**Consumer:** Manager

```typescript
interface TroubleshootReconnectCompletedPayload {
  // 디바이스 ID
  deviceId: string;

  // 재접속 성공 여부
  success: boolean;

  // 실패 시 오류 메시지
  error?: string;

  // 완료 시간
  completedAt: string;
}
```

**Idempotency Key:** `deviceId`

---

### 4.17 log.event

**Topic:** `log.event`
**Producer:** 모든 서비스
**Consumer:** Electron UI (실시간 로깅)

```typescript
interface LogEventPayload {
  // 로그 레벨
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

  // 로그 카테고리
  category: "MANAGER" | "BOT" | "DEVICE" | "WATCH" | "SYSTEM" | "AUTH" | "DATABASE";

  // 로그 메시지
  message: string;

  // 추가 컨텍스트
  context?: {
    botId?: string;
    deviceId?: string;
    watchId?: string;
    campaignId?: string;
    nodeId?: string;
    [key: string]: unknown;
  };

  // 로그 생성 시간
  timestamp: string;
}
```

**Idempotency Key:** `eventId` (각 로그는 고유해야 함)

---

## 5. 키워드 정책 (Keyword Policy)

### 키워드 출처 규칙

1. **사용자 입력 (MANUAL)**
   - 사용자가 명시적으로 키워드를 입력
   - `campaign.created` 이벤트에 `keywordSource: "MANUAL"` 설정

2. **자동 추출 (DERIVED_FROM_TITLE)**
   - 사용자가 키워드를 입력하지 않은 경우
   - 비디오 제목에서 첫 번째 해시태그(#) 전까지의 텍스트를 추출
   - 규칙: `keyword = title.split('#')[0].trim()`
   - `campaign.created` 이벤트에 `keywordSource: "DERIVED_FROM_TITLE"` 설정

### 예시

```typescript
// 예시 1: MANUAL
{
  "title": "혁신적인 기술 리뷰 #tech #review",
  "keyword": "최신 기술 트렌드",  // 사용자 입력
  "keywordSource": "MANUAL"
}

// 예시 2: DERIVED_FROM_TITLE
{
  "title": "혁신적인 기술 리뷰 #tech #review",
  "keyword": "혁신적인 기술 리뷰",  // title.split('#')[0].trim()
  "keywordSource": "DERIVED_FROM_TITLE"
}
```

### 영상검색 봇 사용

- 영상검색 봇이 `video.search.requested` 이벤트의 `keyword` 필드를 소비
- YouTube 검색 API에 해당 키워드로 요청
- 검색 결과는 `video.search.completed` 이벤트로 응답

---

## 6. 재시도 정책 및 Dead-Letter 처리

### 재시도 규칙

각 이벤트 컨슈머는 다음과 같은 **exponential backoff** 재시도 정책을 따릅니다:

```typescript
interface RetryPolicy {
  // 최대 재시도 횟수
  maxRetries: number;

  // 초기 지연 (밀리초)
  initialDelayMs: number;

  // 최대 지연 (밀리초)
  maxDelayMs: number;

  // 지수 (매번 delay *= multiplier)
  multiplier: number;
}

// 기본 설정
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 5000,      // 5초
  maxDelayMs: 300000,        // 5분
  multiplier: 2.0            // exponential backoff
};
```

### 재시도 시퀀스 예시

```
시도 1: 즉시 실패 → 5초 대기
시도 2: 5초 후 실패 → 10초 대기
시도 3: 10초 후 실패 → 20초 대기
시도 4 (maxRetries 초과): Dead-Letter Queue 이동
```

### Dead-Letter Queue 처리

최대 재시도 횟수를 초과한 이벤트는 **Dead-Letter Queue**로 이동됩니다:

```sql
-- Dead-Letter Queue 스키마
CREATE TABLE event_dead_letter (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR NOT NULL,
  payload_json JSONB NOT NULL,
  trace_id UUID NOT NULL,
  failed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  error_message TEXT,
  retry_count INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Dead-Letter 이벤트 정보

```typescript
interface DeadLetterEvent {
  eventId: string;
  eventType: string;
  payloadJson: unknown;
  traceId: string;
  failedAt: string;
  errorMessage: string;
  retryCount: number;
  createdAt: string;
}
```

### Dead-Letter 복구 전략

1. **자동 재시도 스케줄러** (선택적)
   - 일정 시간 후 dead-letter 이벤트를 다시 처리 시도
   - 최대 회수: 추가 3회

2. **수동 복구**
   - 관리자가 dead-letter 테이블의 이벤트를 검사
   - 근본 원인 파악 후 이벤트 재발행
   - UI에서 "Retry Failed Event" 버튼 제공

3. **모니터링 알림**
   - dead-letter 이벤트 발생 시 관리자에게 알림
   - 심각도별 알림 규칙 설정

---

## 7. 봇-이벤트 매핑 (Bot Event Mapping)

### 봇 아키텍처

시스템의 각 봇은 특정 토픽을 **구독(consume)** 및 **발행(produce)** 합니다.

### Bot to Event Matrix

| # | Bot | Role | Consumes (Input Topics) | Produces (Output Topics) | Description |
|---|-----|------|------------------------|-------------------------|-------------|
| 1 | 영상등록 봇 | 캠페인 생성 | `channel.video_uploaded` | `campaign.created` | 채널의 새 영상을 감지하여 캠페인 생성 |
| 2 | 채널등록 봇 | 채널 관리 | user.input | `channel.registered` | 사용자 입력에서 채널 등록 |
| 3 | 키워드봇 | 데이터 준비 | `campaign.created` | `video.search.requested` | 캠페인에서 키워드 추출 및 검색 요청 |
| 4 | 영상검색 봇 | 검색 실행 | `video.search.requested` | `video.search.completed` | YouTube 검색 API 호출 |
| 5 | 시청준비 봇 | 사전 준비 | `watch.prepare.requested` | `watch.ready` | 디바이스 준비 및 검증 |
| 6 | 영상시청 봇 | 시청 실행 | `watch.ready` | `watch.started`, `watch.progress`, `watch.ended` | 실제 시청 실행 및 진행 상황 업데이트 |
| 7 | 유저액션 봇 | 상호작용 | `action.requested` | `action.performed` | 좋아요, 댓글, 구독 등 액션 수행 |
| 8 | 영상종료 봇 | 정리 | `watch.ended` | `log.event` | 시청 완료 후 정리 및 로깅 |
| 9 | 기기등록 봇 | 기기 관리 | device.detected | `device.registered` | 새 디바이스 감지 및 등록 |
| 10 | 기기상태 봇 | 상태 모니터링 | timer.tick, `device.registered` | `device.status.updated` | 주기적으로 디바이스 상태 확인 |
| 11 | 문제해결 봇-재접속 | 복구 | `troubleshoot.reconnect.requested` | `troubleshoot.reconnect.completed` | 연결 끊김 시 재접속 시도 |

---

## 8. 이벤트 흐름 (Event Flow Diagrams)

### 8.1 캠페인 생성 및 영상 검색 흐름

```
User Input
    ↓
[영상등록 봇] 캠페인 생성
    ↓ campaign.created
[키워드봇] 키워드 추출
    ↓ video.search.requested
[영상검색 봇] YouTube 검색
    ↓ video.search.completed
[시청준비 봇] 대기
```

### 8.2 시청 실행 흐름

```
Manager: watch.prepare.requested
    ↓
[시청준비 봇] 디바이스 준비
    ↓ watch.ready
[영상시청 봇] 시청 시작
    ↓ watch.started
[Manager] 시작 감지
    ↓ action.requested
[영상시청 봇] 진행 상황 업데이트
    ↓ watch.progress (주기적)
[Manager] 진행 상황 모니터링
    ↓
[영상시청 봇] 시청 완료
    ↓ watch.ended
[유저액션 봇] 액션 수행
    ↓ action.performed
[Manager] 액션 확인
```

### 8.3 기기 상태 모니터링 흐름

```
새 기기 감지
    ↓
[기기등록 봇] 기기 등록
    ↓ device.registered
[기기상태 봇] 모니터링 시작
    ↓ device.status.updated (주기적, 상태 변경 시)
[Manager] 상태 업데이트
    ↓
[Electron UI] 실시간 표시
```

---

## 9. 멱등성 구현 가이드 (Idempotency Implementation)

### 개념

**멱등성(Idempotency)**: 동일한 요청을 여러 번 처리해도 한 번만 처리한 것과 같은 결과를 얻는 성질

### 구현 패턴

#### 패턴 1: 데이터베이스 UNIQUE 제약

```sql
-- campaign 테이블
CREATE TABLE campaigns (
  campaign_id UUID PRIMARY KEY,
  video_id VARCHAR UNIQUE NOT NULL,  -- UNIQUE 제약으로 멱등성 보장
  title VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL
);

-- video 테이블
CREATE TABLE videos (
  video_id VARCHAR PRIMARY KEY,  -- Primary Key로 멱등성 보장
  youtube_id VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

#### 패턴 2: 데이터베이스 조건부 업데이트

```typescript
// 기기 상태 업데이트 시 최신 타임스탬프만 적용
async function updateDeviceStatus(payload: DeviceStatusUpdatedPayload) {
  // 기존 상태의 타임스탬프가 더 최신이면 업데이트하지 않음
  const result = await db.updateDevice(
    {
      device_id: payload.deviceId,
      // updatedAt이 payload.updatedAt보다 이전일 때만 업데이트
      updatedAt: { $lt: new Date(payload.updatedAt) }
    },
    {
      $set: {
        status: payload.statusKey,
        batteryLevel: payload.batteryLevel,
        updatedAt: new Date(payload.updatedAt)
      }
    }
  );

  return result.modifiedCount > 0;
}
```

#### 패턴 3: 멱등성 키 추적 테이블

```sql
-- 멱등성 추적 테이블
CREATE TABLE idempotency_keys (
  idempotency_key VARCHAR PRIMARY KEY,
  event_id UUID NOT NULL,
  event_type VARCHAR NOT NULL,
  result_json JSONB,
  processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 이벤트 처리 전 확인
SELECT * FROM idempotency_keys
WHERE idempotency_key = 'watchId_deviceId_action_type';

-- 처리 후 기록
INSERT INTO idempotency_keys (idempotency_key, event_id, event_type, result_json)
VALUES ('watchId_deviceId_action_type', :eventId, :eventType, :result);
```

### 컨슈머 구현 예시

```typescript
async function handleActionPerformed(event: EventEnvelope<ActionPerformedPayload>) {
  const { payload, eventId } = event;
  const idempotencyKey = `${payload.watchId}_${payload.actionType}_${payload.deviceId}`;

  // 1. 멱등성 키 확인
  const existing = await db.getIdempotencyKey(idempotencyKey);
  if (existing) {
    console.log(`[Idempotent] Already processed: ${idempotencyKey}`);
    return existing.result;
  }

  // 2. 이벤트 처리
  const result = await processAction(payload);

  // 3. 멱등성 키 기록
  await db.saveIdempotencyKey({
    idempotencyKey,
    eventId,
    eventType: event.eventType,
    result
  });

  return result;
}
```

---

## 10. 이벤트 발행 가이드 (Publishing Events)

### 발행자 책임

1. **유일한 eventId 생성** (UUID v4)
2. **정확한 eventType 지정**
3. **현재 시간을 occurredAt으로 설정** (ISO 8601 UTC)
4. **traceId 전파** (기존 추적에서 가져오거나 새로 생성)
5. **source 정보 채우기** (service, instanceId)
6. **payload 검증** (스키마 확인)

### 발행 예시 코드

```typescript
import { v4 as uuidv4 } from 'uuid';

async function publishWatchStarted(
  watchId: string,
  campaignId: string,
  deviceIds: string[],
  traceId?: string
) {
  const eventEnvelope: EventEnvelope<WatchStartedPayload> = {
    eventId: uuidv4(),
    eventType: 'watch.started',
    occurredAt: new Date().toISOString(),
    traceId: traceId || uuidv4(),
    source: {
      service: 'VIDEO_WATCH',
      instanceId: os.hostname()
    },
    payload: {
      watchId,
      campaignId,
      botId: 'VIDEO_WATCH',
      deviceIds,
      startedAt: new Date().toISOString()
    }
  };

  // 이벤트 발행
  await eventBus.publish('watch.started', eventEnvelope);
}
```

---

## 11. 이벤트 구독 가이드 (Consuming Events)

### 구독자 책임

1. **토픽 구독** (예: `watch.started`)
2. **이벤트 검증** (타입 확인, 필수 필드 검사)
3. **멱등성 확인** (idempotency key 확인)
4. **payload 처리** (비즈니스 로직 실행)
5. **에러 처리** (재시도 또는 dead-letter 전송)
6. **traceId 전파** (다음 이벤트 발행 시)

### 구독 예시 코드

```typescript
import type { EventEnvelope, WatchStartedPayload } from './contracts';

class WatchEventHandler {
  async subscribe(eventBus: EventBus) {
    eventBus.on('watch.started',
      (event: EventEnvelope<WatchStartedPayload>) =>
        this.handleWatchStarted(event)
    );
  }

  private async handleWatchStarted(
    event: EventEnvelope<WatchStartedPayload>
  ) {
    const { eventId, traceId, payload } = event;

    try {
      // 1. 멱등성 확인
      const idempotencyKey = payload.watchId;
      if (await this.db.hasProcessed(idempotencyKey)) {
        console.log(`[Idempotent] Already processed watch: ${idempotencyKey}`);
        return;
      }

      // 2. Payload 검증
      this.validateWatchStartedPayload(payload);

      // 3. 비즈니스 로직
      await this.updateWatchStatus(payload.watchId, 'STARTED');
      await this.recordWatchMetrics(payload);

      // 4. 멱등성 키 기록
      await this.db.recordProcessed(idempotencyKey, eventId);

      // 5. 다음 이벤트 발행 (traceId 전파)
      await this.publishFollowUpEvent(payload, traceId);

    } catch (error) {
      console.error(`[Error] Failed to handle watch.started:`, error);
      // 재시도는 메시지 큐(Redis, RabbitMQ 등)에서 자동 처리
      throw error; // 큐에서 재시도하도록 예외 발생
    }
  }

  private validateWatchStartedPayload(
    payload: WatchStartedPayload
  ): asserts payload {
    if (!payload.watchId) throw new Error('Missing watchId');
    if (!payload.campaignId) throw new Error('Missing campaignId');
    if (!Array.isArray(payload.deviceIds)) throw new Error('Invalid deviceIds');
  }

  private async publishFollowUpEvent(
    payload: WatchStartedPayload,
    traceId: string
  ) {
    // 다음 단계의 이벤트 발행 (traceId 전파)
    await this.eventBus.publish('watch.progress', {
      eventId: uuidv4(),
      eventType: 'watch.progress',
      occurredAt: new Date().toISOString(),
      traceId, // 동일한 traceId 사용
      source: { service: 'MANAGER', instanceId: os.hostname() },
      payload: { /* ... */ }
    });
  }
}
```

---

## 12. 모니터링 및 관찰성 (Monitoring & Observability)

### 메트릭 수집

각 토픽별로 다음 메트릭을 수집합니다:

```typescript
interface EventMetrics {
  // 토픽명
  topic: string;

  // 발행된 이벤트 수
  publishedCount: number;

  // 성공적으로 처리된 이벤트 수
  processedCount: number;

  // 실패한 이벤트 수
  failedCount: number;

  // Dead-letter 이벤트 수
  deadLetterCount: number;

  // 평균 처리 시간 (ms)
  avgProcessingTimeMs: number;

  // p99 처리 시간 (ms)
  p99ProcessingTimeMs: number;

  // 최근 에러 메시지
  lastErrors: Array<{ timestamp: string; error: string }>;
}
```

### 로깅 전략

모든 이벤트 처리는 다음 정보를 로깅합니다:

```typescript
// 이벤트 발행 시
console.log({
  level: 'INFO',
  message: 'Event published',
  eventId,
  eventType,
  traceId,
  timestamp: new Date().toISOString()
});

// 이벤트 처리 시
console.log({
  level: 'INFO',
  message: 'Event processed',
  eventId,
  eventType,
  traceId,
  processingTimeMs,
  timestamp: new Date().toISOString()
});

// 이벤트 처리 실패 시
console.error({
  level: 'ERROR',
  message: 'Event processing failed',
  eventId,
  eventType,
  traceId,
  error: err.message,
  attempt: retryCount,
  timestamp: new Date().toISOString()
});
```

### 모니터링 대시보드

Grafana/Prometheus 기반 모니터링 권장 항목:

1. **이벤트 처리율** (Events/min by topic)
2. **처리 지연** (Latency distribution by percentile)
3. **실패율** (Failed events / Total events)
4. **Dead-Letter 적체** (Dead-letter queue depth)
5. **서비스별 부하** (Events by producer service)

---

## 13. 버전 관리 (Versioning)

### 페이로드 진화 (Payload Evolution)

이벤트 스키마가 변경될 때는 다음 원칙을 따릅니다:

#### 호환성 유지 (Backward Compatible)

```typescript
// v1.0: 기본 페이로드
interface WatchStartedPayloadV1 {
  watchId: string;
  campaignId: string;
  deviceIds: string[];
}

// v1.1: 필드 추가 (하위 호환성 유지)
interface WatchStartedPayloadV1_1 extends WatchStartedPayloadV1 {
  botId?: string; // 선택적 필드
}

// v2.0: 필드 제거 또는 필수 필드 변경 (호환성 깨짐)
interface WatchStartedPayloadV2 {
  watchId: string;
  campaignId: string;
  botId: string; // 이제 필수
  // deviceIds 제거
  devices: Array<{ deviceId: string; status: string }>;
}
```

#### 마이그레이션 전략

1. **신규 필드 추가 시**
   - 선택적(optional) 필드로 추가
   - 구 버전 컨슈머도 처리 가능
   - 배포 후 1개월 유예 기간 설정

2. **필드 제거 시**
   - Major 버전 업그레이드
   - 사전 공지 및 마이그레이션 기간 제공
   - 구 필드를 무시하도록 수정

3. **필드 이름 변경 시**
   - 이전 필드명 + 새 필드명 모두 포함 (임시)
   - 1개월 후 이전 필드명 제거

---

## 14. 테스트 및 검증 (Testing & Validation)

### 단위 테스트

```typescript
describe('EventEnvelope', () => {
  it('should create valid event envelope', () => {
    const event: EventEnvelope<WatchStartedPayload> = {
      eventId: uuidv4(),
      eventType: 'watch.started',
      occurredAt: new Date().toISOString(),
      traceId: uuidv4(),
      source: { service: 'VIDEO_WATCH', instanceId: 'node-1' },
      payload: {
        watchId: '20260207_channel_001',
        campaignId: uuidv4(),
        botId: 'VIDEO_WATCH',
        deviceIds: ['device_001'],
        startedAt: new Date().toISOString()
      }
    };

    expect(event.eventId).toBeDefined();
    expect(event.eventType).toBe('watch.started');
    expect(event.payload.watchId).toBeTruthy();
  });
});
```

### 통합 테스트

```typescript
describe('Event Flow', () => {
  it('should handle complete watch flow', async () => {
    const campaignId = uuidv4();
    const watchId = '20260207_channel_001';

    // 1. campaign.created 발행
    await eventBus.publish('campaign.created', {
      eventId: uuidv4(),
      eventType: 'campaign.created',
      occurredAt: new Date().toISOString(),
      traceId: uuidv4(),
      source: { service: 'VIDEO_REGISTER', instanceId: 'node-1' },
      payload: { campaignId, videoId: 'xyz', /* ... */ }
    });

    // 2. video.search.requested 수신 확인
    await waitFor(() =>
      expect(eventBus.receivedEvents).toContainEqual(
        expect.objectContaining({ eventType: 'video.search.requested' })
      )
    );

    // 3. watch.started 발행
    await eventBus.publish('watch.started', {
      eventId: uuidv4(),
      eventType: 'watch.started',
      occurredAt: new Date().toISOString(),
      traceId: uuidv4(),
      source: { service: 'VIDEO_WATCH', instanceId: 'node-1' },
      payload: { watchId, campaignId, /* ... */ }
    });

    // 4. 최종 상태 확인
    const watch = await db.getWatch(watchId);
    expect(watch.status).toBe('STARTED');
  });
});
```

---

## 15. 문제 해결 (Troubleshooting)

### 일반적인 문제

| 문제 | 원인 | 해결책 |
|------|------|--------|
| 이벤트 중복 처리 | 멱등성 키 미설정 | idempotency_keys 테이블 확인, 컨슈머 로직 검토 |
| 이벤트 손실 | 연결 끊김 또는 큐 오버플로우 | 메시지 큐 상태 확인, 대기 큐 크기 검토 |
| 과도한 재시도 | retryPolicy 설정 오류 | maxRetries, initialDelay 재설정 |
| Dead-Letter 적체 | 근본 원인 미해결 | dead-letter 이벤트 분석, 오류 패턴 파악 |
| 느린 처리 | 병목 조건 존재 | 메트릭 대시보드 확인, 처리 로직 최적화 |

### 디버깅 명령어

```bash
# Redis에 저장된 대기 이벤트 확인
redis-cli LLEN "event-queue:watch.started"

# Dead-letter 이벤트 조회
SELECT event_dead_letter;
SELECT * FROM event_dead_letter WHERE created_at > NOW() - INTERVAL '1 hour';

# 특정 traceId 추적
SELECT * FROM execution_logs WHERE trace_id = 'abc123def456';

# 이벤트 발행 로그 조회
SELECT * FROM event_audit_log WHERE event_type = 'watch.started' LIMIT 100;
```

---

## 16. 보안 고려사항 (Security Considerations)

### 이벤트 검증

모든 컨슈머는 다음을 검증해야 합니다:

1. **eventId는 UUID v4 형식**
2. **eventType이 알려진 토픽 중 하나**
3. **occurredAt이 유효한 ISO 8601 형식**
4. **source.service가 신뢰할 수 있는 서비스**
5. **payload가 스키마를 만족**

```typescript
function validateEventEnvelope(event: unknown): asserts event is EventEnvelope {
  if (!isObject(event)) throw new Error('Event must be an object');

  const { eventId, eventType, occurredAt, source, payload } = event as any;

  if (!isValidUUID(eventId)) throw new Error('Invalid eventId');
  if (!VALID_EVENT_TYPES.includes(eventType)) throw new Error('Invalid eventType');
  if (!isValidISO8601(occurredAt)) throw new Error('Invalid occurredAt');
  if (!source?.service || !source?.instanceId) throw new Error('Missing source');
  if (!payload) throw new Error('Missing payload');
}
```

### 데이터 민감도

다음 정보는 이벤트에 포함되면 안 됩니다:

- 비밀번호, API 키, 토큰
- 개인 식별 정보 (PII) - 실명, 이메일, 전화번호
- 결제 정보, 신용카드 번호
- 의료 또는 법적 민감 정보

---

## 17. 체크리스트 (Implementation Checklist)

### 새로운 이벤트 추가 시

- [ ] 이벤트 타입명 정의 (e.g., `domain.action`)
- [ ] Payload 스키마 정의 (TypeScript interface)
- [ ] 멱등성 키 설정
- [ ] Producer 봇 구현
- [ ] Consumer 봇 구현
- [ ] 멱등성 검증 로직 추가
- [ ] 재시도 정책 설정
- [ ] 테스트 코드 작성
- [ ] 모니터링 메트릭 추가
- [ ] 문서 업데이트

### 배포 전 확인사항

- [ ] 모든 토픽이 등록되어 있는가?
- [ ] 모든 consumer에 멱등성 로직이 있는가?
- [ ] Dead-letter 처리 메커니즘이 준비되어 있는가?
- [ ] 모니터링 대시보드가 설정되어 있는가?
- [ ] 롤백 계획이 있는가?

---

## Appendix A: Event Type Reference

### Event Type 전체 목록

```
campaign.created           # 캠페인 생성
channel.registered        # 채널 등록
channel.video_uploaded    # 채널 영상 업로드
video.search.requested    # 영상 검색 요청
video.search.completed    # 영상 검색 완료
watch.prepare.requested   # 시청 준비 요청
watch.ready              # 시청 준비 완료
watch.started            # 시청 시작
watch.progress           # 시청 진행 상황
watch.ended              # 시청 종료
action.requested         # 액션 요청
action.performed         # 액션 수행
device.registered        # 기기 등록
device.status.updated    # 기기 상태 변경
troubleshoot.reconnect.requested      # 재접속 요청
troubleshoot.reconnect.completed      # 재접속 완료
log.event                # 중앙 로그
```

---

## Appendix B: Idempotency Key Examples

```typescript
// campaign.created
idempotencyKey = campaignId || videoId

// video.search.requested
idempotencyKey = campaignId

// watch.started
idempotencyKey = watchId

// watch.progress
idempotencyKey = `${watchId}_${deviceId}_${Math.floor(timestamp / 1000)}`  // 초 단위 (1초 1회 throttle과 일치)

// action.requested
idempotencyKey = `${watchId}_${actionType}`

// action.performed
idempotencyKey = `${watchId}_${actionType}_${deviceId}`

// device.status.updated
idempotencyKey = `${deviceId}_${statusUpdatedAt}`
```

---

## 참고 자료 (References)

- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Kafka Event Design](https://www.confluent.io/blog/event-sourcing-cqrs-stream-processing-apache-kafka-confluent-platform/)
- [Idempotent APIs](https://stripe.com/blog/idempotency)
- [Distributed Tracing with OpenTelemetry](https://opentelemetry.io/)

---

**Document Status:** Active
**Last Review:** 2026-02-07
**Next Review:** 2026-03-07
**Owner:** Platform Team
