# doai-me Dashboard API Specification

> Last Updated: 2026-02-07

## Table of Contents

- [AI](#ai)
- [Analytics](#analytics)
- [Appium](#appium)
- [Channels](#channels)
- [Comments](#comments)
- [Device Control](#device-control)
- [Devices](#devices)
- [Executions](#executions)
- [Issues](#issues)
- [Jobs](#jobs)
- [Keywords](#keywords)
- [Logs](#logs)
- [Nodes](#nodes)
- [Onboarding](#onboarding)
- [PCs](#pcs)
- [Queue](#queue)
- [Reports](#reports)
- [Schedules](#schedules)
- [Videos](#videos)
- [Workers](#workers)
- [YouTube Meta](#youtube-meta)

---

## AI

### POST /api/ai/generate

AI를 사용하여 YouTube 댓글을 생성합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes* | 영상 제목 (AI 생성 시 필수) |
| `count` | number | No | 생성할 댓글 수 (기본: 10, 최대: 50) |
| `tone` | string | No | 댓글 톤 (`casual`, `positive`, `mixed`) 기본: `casual` |
| `job_id` | string | No | 저장할 Job ID (제공 시 DB에 저장) |
| `save` | boolean | No | DB 저장 여부 (job_id와 함께 사용) |
| `comments` | string[] | No | 사용자가 제공한 댓글 (AI 생성 대신 저장) |

**Response:**

```json
{
  "success": true,
  "mode": "preview | generate_and_save | save_provided",
  "comments": ["댓글1", "댓글2", ...],
  "count": 10,
  "saved": 10
}
```

---

## Analytics

### GET /api/analytics/devices

디바이스 중심 분석 데이터를 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pcId` | string | PC ID로 필터링 |
| `status` | string | 상태로 필터링 (`online`, `offline`, `busy`, `error`) |

**Response:**

```json
{
  "devices": [{
    "id": "uuid",
    "serial_number": "string",
    "pc_id": "string",
    "status": "online | offline | busy | error",
    "last_heartbeat": "ISO8601",
    "today_completed_count": 5,
    "today_failed_count": 1,
    "recent_error_log": "string | null",
    "current_job": {
      "job_id": "string",
      "title": "string",
      "progress_pct": 50,
      "started_at": "ISO8601"
    },
    "next_pending_job": {
      "job_id": "string",
      "title": "string",
      "assigned_at": "ISO8601"
    }
  }]
}
```

### GET /api/analytics/jobs

작업 중심 분석 데이터를 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `days` | number | 조회 기간 (기본: 7일) |
| `activeOnly` | boolean | 활성 작업만 조회 |

**Response:**

```json
{
  "jobs": [{
    "id": "string",
    "title": "string",
    "target_url": "string",
    "created_at": "ISO8601",
    "is_active": true,
    "total_assignments": 100,
    "completed_count": 80,
    "running_count": 5,
    "pending_count": 10,
    "failed_count": 5,
    "avg_duration_sec": 65,
    "running_devices": [{
      "device_id": "string",
      "serial_number": "string",
      "progress_pct": 50
    }]
  }]
}
```

---

## Appium

### GET /api/appium

Appium 세션 메트릭을 조회합니다. FastAPI 서버와 연동됩니다.

**Response:**

```json
{
  "success": true,
  "data": {
    "appiumOnline": true,
    "appiumReady": true,
    "activeSessions": 5,
    "maxSessions": 10,
    "availablePorts": 5,
    "usedPorts": {},
    "activeDevices": []
  }
}
```

---

## Channels

### GET /api/channels

채널 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 (기본: 1) |
| `pageSize` | number | 페이지 크기 (기본: 20) |
| `search` | string | 검색어 (이름, 핸들) |
| `status` | string | 상태 필터 |
| `sortBy` | string | 정렬 기준 (`created_at`, `name`, `subscriber_count`, `video_count`) |
| `sortOrder` | string | 정렬 순서 (`asc`, `desc`) |

**Response:**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### POST /api/channels

새 채널을 등록합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `youtube_url` | string | Yes | YouTube 채널 URL |
| `name` | string | No | 채널 이름 |
| `handle` | string | No | 채널 핸들 |
| `thumbnail_url` | string | No | 썸네일 URL |
| `auto_collect` | boolean | No | 자동 수집 여부 |

### GET /api/channels/:id

단일 채널을 조회합니다.

### PATCH /api/channels/:id

채널 정보를 수정합니다.

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `auto_collect` | boolean | 자동 수집 여부 |
| `status` | string | 상태 |
| `name` | string | 채널 이름 |

### DELETE /api/channels/:id

채널을 삭제합니다.

### POST /api/channels/:id/collect

채널의 최신 영상을 수집합니다. YouTube API를 사용하여 최신 영상을 검색하고 DB에 저장합니다.

**Response:**

```json
{
  "success": true,
  "data": {
    "collected": 10,
    "total_found": 10,
    "message": "10개의 영상이 수집되었습니다"
  }
}
```

---

## Comments

### GET /api/comments

댓글을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | string | Job ID (필수, video_id가 없는 경우) |
| `video_id` | string | Video ID (job_id 대신 사용 가능) |
| `device_id` | string | 디바이스 ID (제공 시 원자적으로 댓글 할당) |
| `all` | boolean | 모든 댓글 조회 (기본: 미사용 댓글만) |

**Response:**

```json
{
  "success": true,
  "comments": [{
    "id": "string",
    "content": "댓글 내용",
    "is_used": false
  }],
  "total_unused": 50
}
```

### POST /api/comments

댓글을 대량 추가합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_id` | string | No | Job ID |
| `channel_id` | string | No | 채널 ID |
| `comments` | string[] | Yes | 댓글 배열 |

---

## Device Control

### POST /api/device/command

여러 디바이스에 ADB 명령을 전송합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceIds` | string[] | Yes | 디바이스 ID 배열 |
| `command` | string | Yes | 명령 타입 (`tap`, `swipe`, `keyevent`, `text`, `shell`) |
| `params` | object | No | 명령 파라미터 |

**Params for each command:**

- `tap`: `{ x: number, y: number }`
- `swipe`: `{ x: number, y: number, x2: number, y2: number, duration?: number }`
- `keyevent`: `{ keycode: number }`
- `text`: `{ text: string }`
- `shell`: `{ shellCommand: string }` (허용된 명령만)

### POST /api/device/screenshot

디바이스 스크린샷을 캡처합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceId` | string | Yes | 디바이스 ID |

**Response:**

```json
{
  "success": true,
  "imageUrl": "string"
}
```

### GET /api/device/stream

디바이스의 최신 프레임을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `deviceId` | string | 디바이스 ID (필수) |

### POST /api/device/stream

실시간 프레임 스트리밍을 시작/중지합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceId` | string | Yes | 디바이스 ID |
| `action` | string | Yes | `start` 또는 `stop` |
| `fps` | number | No | 초당 프레임 수 (기본: 2) |

---

## Devices

### GET /api/devices

디바이스 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | 상태 필터 (`online`, `busy`, `offline`, `error`) |
| `pc_id` | string | PC ID 프리픽스로 필터링 |
| `limit` | number | 조회 개수 제한 (기본: 500) |

**Response:**

```json
{
  "devices": [...],
  "stats": {
    "total": 100,
    "online": 80,
    "busy": 10,
    "offline": 5,
    "error": 5
  }
}
```

### PATCH /api/devices

디바이스 상태를 업데이트합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device_id` | string | No* | 디바이스 ID |
| `serial_number` | string | No* | 시리얼 번호 (* 둘 중 하나 필수) |
| `status` | string | No | 상태 |
| `...` | any | No | 기타 업데이트 필드 |

### DELETE /api/devices

상태별로 디바이스를 삭제합니다. (관리자 권한 필요)

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | 삭제할 상태 (필수) |
| `confirm` | string | `true`로 설정 필수 (삭제 확인) |

### GET /api/devices/:id

단일 디바이스를 조회합니다.

### PATCH /api/devices/:id

디바이스 정보를 수정합니다.

**Request Body:**

허용 필드: `serial_number`, `ip_address`, `model`, `android_version`, `connection_type`, `usb_port`, `status`, `battery_level`, `error_count`, `last_error`

### DELETE /api/devices/:id

디바이스를 삭제합니다.

### POST /api/devices/:id/assign

디바이스를 PC에 배정합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pc_id` | string | Yes | PC ID |
| `usb_port` | string | No | USB 포트 |

### DELETE /api/devices/:id/assign

디바이스를 PC에서 해제합니다.

### POST /api/devices/bulk

ADB 스캔 결과를 일괄 등록합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pc_id` | string | No | PC ID |
| `devices` | object[] | Yes | 디바이스 배열 |

**Device object:**

| Field | Type | Description |
|-------|------|-------------|
| `serial_number` | string | 시리얼 번호 |
| `ip_address` | string | IP 주소 |
| `model` | string | 모델명 |
| `android_version` | string | Android 버전 |
| `connection_type` | string | 연결 타입 (`usb`, `wifi`, `both`) |

### GET /api/devices/by-code/:code

관리번호로 디바이스를 조회합니다. (형식: `PC01-001`)

### GET /api/devices/by-serial/:serial

시리얼 번호로 디바이스를 조회합니다.

### POST /api/devices/command

디바이스에 명령을 전송합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device_ids` | string[] | Yes | 디바이스 ID 배열 |
| `command` | string | Yes | 명령 (`reboot`, `clear_cache`, `kill_app`, `screenshot`, `enable`, `disable`) |
| `params` | object | No | 추가 파라미터 |

### GET /api/devices/overview

전체 기기 현황을 조회합니다. (`device_overview` 뷰 사용)

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | 상태 필터 |
| `pc_number` | string | PC 번호 필터 |
| `page` | number | 페이지 번호 |
| `limit` | number | 페이지 크기 (기본: 100) |

### GET /api/devices/pcs

PC 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | 상태 필터 |
| `page` | number | 페이지 번호 |
| `limit` | number | 페이지 크기 (기본: 50) |

### POST /api/devices/pcs

새 PC를 등록합니다. (번호 자동 할당)

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `ip_address` | string | IP 주소 |
| `hostname` | string | 호스트명 |
| `label` | string | 라벨 |
| `location` | string | 위치 |
| `max_devices` | number | 최대 디바이스 수 (기본: 20) |

### GET /api/devices/pcs/:pcNumber

PC 상세 정보를 조회합니다. (연결된 디바이스 포함)

### PATCH /api/devices/pcs/:pcNumber

PC 정보를 수정합니다.

### DELETE /api/devices/pcs/:pcNumber

PC를 삭제합니다.

---

## Executions

### GET /api/executions

실행 이력을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 |
| `pageSize` | number | 페이지 크기 |
| `status` | string | 상태 필터 (`completed`, `failed`, `cancelled`, `all`) |
| `nodeId` | string | 노드 ID |
| `deviceId` | string | 디바이스 ID |
| `videoId` | string | 비디오 ID |
| `dateFrom` | string | 시작 날짜 |
| `dateTo` | string | 종료 날짜 |
| `sortBy` | string | 정렬 기준 (`started_at`, `duration`) |
| `sortOrder` | string | 정렬 순서 (`asc`, `desc`) |

### GET /api/executions/:id

단일 실행 기록을 조회합니다.

### POST /api/executions/:id/retry

실행을 재시도합니다. (실패/취소된 실행만)

---

## Issues

### GET /api/issues

디바이스 이슈 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 |
| `pageSize` | number | 페이지 크기 |
| `status` | string | 상태 필터 (`open`, `in_progress`, `resolved`, `ignored`) |
| `severity` | string | 심각도 필터 (`low`, `medium`, `high`, `critical`) |
| `type` | string | 이슈 타입 필터 |
| `nodeId` | string | 노드 ID |
| `deviceId` | string | 디바이스 ID |
| `sortBy` | string | 정렬 기준 (`created_at`, `severity`) |
| `sortOrder` | string | 정렬 순서 |

### POST /api/issues

이슈를 생성합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device_id` | string | Yes | 디바이스 ID |
| `type` | string | Yes | 이슈 타입 |
| `message` | string | Yes | 메시지 |
| `severity` | string | No | 심각도 (기본: `medium`) |
| `details` | object | No | 상세 정보 |
| `auto_recoverable` | boolean | No | 자동 복구 가능 여부 |

### POST /api/issues/:id/resolve

이슈를 해결 처리합니다.

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `resolution_note` | string | 해결 메모 |
| `resolved_by` | string | 해결자 |

### POST /api/issues/batch

이슈를 일괄 처리합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issue_ids` | string[] | Yes | 이슈 ID 배열 |
| `action` | string | Yes | 액션 (`resolve`, `ignore`, `retry`) |

---

## Jobs

### GET /api/jobs

작업 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | 상태 필터 (`active`, `paused`, `completed`, `cancelled`) |
| `limit` | number | 조회 개수 (기본: 50) |
| `offset` | number | 오프셋 (기본: 0) |

**Response:**

```json
{
  "jobs": [{
    "id": "string",
    "title": "string",
    "target_url": "string",
    "is_active": true,
    "stats": {
      "pending": 10,
      "paused": 0,
      "running": 5,
      "completed": 80,
      "failed": 5,
      "cancelled": 0
    },
    "total_assigned": 100,
    "comment_count": 50
  }],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### POST /api/jobs

새 작업을 생성합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | 작업 제목 |
| `video_url` / `target_url` | string | Yes* | YouTube 영상 URL (* VIDEO_URL 모드) |
| `channel_url` | string | Yes* | YouTube 채널 URL (* CHANNEL_AUTO 모드) |
| `job_type` | string | No | 작업 타입 (`VIDEO_URL`, `CHANNEL_AUTO`) 기본: `VIDEO_URL` |
| `duration_sec` | number | No | 시청 시간(초) 기본: 60 |
| `watch_duration_min` | number | No | 최소 시청 시간(초) |
| `watch_duration_max` | number | No | 최대 시청 시간(초) |
| `target_type` | string | No | 대상 타입 (`all_devices`, `percentage`, `device_count`) |
| `target_views` / `target_value` | number | No | 목표 조회수 기본: 100 |
| `prob_like` | number | No | 좋아요 확률 (0-100) |
| `prob_comment` | number | No | 댓글 확률 (0-100) |
| `prob_subscribe` | number | No | 구독 확률 (0-100) |
| `prob_playlist` | number | No | 재생목록 확률 (0-100) |
| `priority` | boolean | No | 우선순위 플래그 |
| `comments` | string[] | No | 댓글 목록 |
| `display_name` | string | No | 표시 이름 |
| `source_type` | string | No | 소스 타입 (`A`: Auto, `N`: Normal) |

**Response (VIDEO_URL 모드):**

```json
{
  "success": true,
  "job": {...},
  "commentCount": 50,
  "generatedCommentCount": 50,
  "isAutoGenerated": true,
  "assignments": [...],
  "stats": {
    "total_devices": 100,
    "assigned_devices": 80,
    "comments_count": 50
  }
}
```

**Response (CHANNEL_AUTO 모드):**

```json
{
  "success": true,
  "mode": "CHANNEL_AUTO",
  "channel": {...},
  "message": "채널이 등록되었습니다. 새 영상이 감지되면 자동으로 작업이 생성됩니다."
}
```

### GET /api/jobs/:id

단일 작업을 조회합니다.

### PATCH /api/jobs/:id

작업을 수정합니다. (일시정지/재개 포함)

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | 상태 (`active`, `paused`, `completed`, `cancelled`) |
| `title` | string | 제목 |
| `priority` | boolean | 우선순위 |

### DELETE /api/jobs/:id

작업을 삭제합니다. (실행 중인 assignment가 있으면 실패)

---

## Keywords

### GET /api/keywords

키워드 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 |
| `pageSize` | number | 페이지 크기 |
| `search` | string | 검색어 |
| `status` | string | 상태 필터 |
| `category` | string | 카테고리 필터 |
| `sortBy` | string | 정렬 기준 (`created_at`, `keyword`, `video_count`) |
| `sortOrder` | string | 정렬 순서 |

### POST /api/keywords

키워드를 추가합니다.

**Request Body (단일):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keyword` | string | Yes | 키워드 |
| `category` | string | No | 카테고리 |
| `auto_collect` | boolean | No | 자동 수집 여부 |
| `max_results` | number | No | 최대 결과 수 (기본: 10) |

**Request Body (벌크):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keywords` | string[] | Yes | 키워드 배열 |

### GET /api/keywords/:id

단일 키워드를 조회합니다.

### PATCH /api/keywords/:id

키워드를 수정합니다.

**Request Body:**

허용 필드: `auto_collect`, `status`, `category`, `max_results`

### DELETE /api/keywords/:id

키워드를 삭제합니다.

### POST /api/keywords/:id/collect

키워드로 YouTube 영상을 검색하고 수집합니다.

**Response:**

```json
{
  "success": true,
  "data": {
    "collected": 10,
    "total_found": 15,
    "filtered_count": 10,
    "message": "10개의 영상이 수집되었습니다"
  }
}
```

---

## Logs

### GET /api/logs

시스템 로그를 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 |
| `pageSize` | number | 페이지 크기 |
| `level` | string | 로그 레벨 필터 |
| `source` | string | 소스 필터 |
| `nodeId` | string | 노드 ID |
| `search` | string | 검색어 |
| `dateFrom` | string | 시작 날짜 |
| `dateTo` | string | 종료 날짜 |
| `sortOrder` | string | 정렬 순서 |

### POST /api/logs

로그를 생성합니다. (내부용)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `level` | string | Yes | 로그 레벨 |
| `source` | string | Yes | 소스 |
| `message` | string | Yes | 메시지 |
| `component` | string | No | 컴포넌트 |
| `details` | object | No | 상세 정보 |
| `node_id` | string | No | 노드 ID |
| `device_id` | string | No | 디바이스 ID |
| `request_id` | string | No | 요청 ID |

---

## Nodes

### GET /api/nodes

노드 목록을 조회합니다. (노드 테이블이 없으면 디바이스 기반으로 생성)

**Response:**

```json
{
  "success": true,
  "data": [{
    "id": "string",
    "name": "Node 1",
    "status": "online | offline",
    "ip_address": "string",
    "device_count": 20,
    "online_devices": 18,
    "busy_devices": 5,
    "active_tasks": 0,
    "cpu_usage": 0,
    "memory_usage": 0,
    "last_heartbeat": "ISO8601",
    "version": "1.0.0"
  }]
}
```

### GET /api/nodes/:id

단일 노드를 조회합니다.

---

## Onboarding

### GET /api/onboarding

온보딩 상태를 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 |
| `pageSize` | number | 페이지 크기 |
| `status` | string | 상태 필터 (`not_started`, `in_progress`, `completed`, `failed`) |
| `nodeId` | string | 노드 ID |

### POST /api/onboarding

온보딩을 시작합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceIds` | string[] | Yes | 디바이스 ID 배열 |
| `nodeId` | string | Yes | 노드 ID |
| `config` | object | No | 온보딩 설정 |
| `fromStep` | string | No | 시작 단계 |
| `skipSteps` | string[] | No | 건너뛸 단계 |
| `action` | string | No | `get_steps`로 설정 시 단계 목록 반환 |

### PATCH /api/onboarding

온보딩 상태를 업데이트합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceId` | string | Yes | 디바이스 ID |
| `status` | string | No | 상태 |
| `currentStep` | string | No | 현재 단계 |
| `completedSteps` | string[] | No | 완료된 단계 |
| `error` | string | No | 에러 메시지 |
| `action` | string | No | `retry_step` 또는 `cancel` |

### GET /api/onboarding/:deviceId

특정 디바이스의 온보딩 상태를 조회합니다.

### POST /api/onboarding/:deviceId

특정 단계를 실행합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `step` | string | Yes | 실행할 단계 |
| `force` | boolean | No | 완료된 단계도 재실행 |

### DELETE /api/onboarding/:deviceId

온보딩 기록을 삭제합니다.

---

## PCs

### GET /api/pcs

PC 목록을 조회합니다. (`pc_summary` 뷰 사용)

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | 상태 필터 |
| `page` | number | 페이지 번호 |
| `limit` | number | 페이지 크기 (기본: 50) |

### POST /api/pcs

새 PC를 등록합니다. (번호 자동 할당)

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `ip_address` | string | IP 주소 |
| `hostname` | string | 호스트명 |
| `label` | string | 라벨 |
| `location` | string | 위치 |
| `max_devices` | number | 최대 디바이스 수 (기본: 20) |

### GET /api/pcs/:id

PC 상세 정보를 조회합니다. (연결된 디바이스 포함)

### PATCH /api/pcs/:id

PC 정보를 수정합니다.

**Request Body:**

허용 필드: `label`, `location`, `hostname`, `ip_address`, `max_devices`, `status`, `metadata`

### DELETE /api/pcs/:id

PC를 삭제합니다. (연결된 디바이스가 있으면 실패)

---

## Queue

### GET /api/queue

대기열 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 |
| `pageSize` | number | 페이지 크기 |
| `status` | string | 상태 필터 (`pending`, `queued`, `assigned`, `all`) |
| `videoId` | string | 비디오 ID |
| `nodeId` | string | 노드 ID |
| `sortOrder` | string | 정렬 순서 |

### POST /api/queue

대기열에 추가합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `video_ids` | string[] | Yes | 비디오 ID 배열 |
| `priority` | number | No | 우선순위 (0-100) 기본: 50 |
| `target_watch_seconds` | number | No | 목표 시청 시간(초) 기본: 60 |
| `device_count` | number | No | 비디오당 디바이스 수 (1-10) 기본: 1 |

### POST /api/queue/batch

대기열 배치 액션을 수행합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `execution_ids` | string[] | Yes | 실행 ID 배열 |
| `action` | string | Yes | 액션 (`cancel`, `retry`, `prioritize`) |
| `priority` | number | No | 우선순위 (prioritize 액션에 필요) |

---

## Reports

### GET /api/reports/daily

일간 리포트를 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `date` | string | 날짜 (YYYY-MM-DD) 기본: 오늘 |

**Response:**

```json
{
  "success": true,
  "data": {
    "date": "2026-02-07",
    "total_tasks": 1000,
    "completed_tasks": 900,
    "failed_tasks": 50,
    "cancelled_tasks": 50,
    "total_watch_time": 60000,
    "avg_watch_time": 65,
    "unique_videos": 50,
    "active_devices": 100,
    "error_rate": 5.0,
    "tasks_per_hour": [0, 0, 0, ...]
  }
}
```

### GET /api/reports/summary

기간 요약 리포트를 조회합니다.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dateFrom` | string | Yes | 시작 날짜 (YYYY-MM-DD) |
| `dateTo` | string | Yes | 종료 날짜 (YYYY-MM-DD) |

**Response:**

```json
{
  "success": true,
  "data": {
    "total_tasks": 10000,
    "completed_tasks": 9000,
    "failed_tasks": 500,
    "total_watch_time": 600000,
    "unique_videos": 500,
    "active_devices": 100,
    "avg_success_rate": 90.0
  }
}
```

---

## Schedules

### GET /api/schedules

스케줄 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 |
| `pageSize` | number | 페이지 크기 |
| `status` | string | 상태 필터 |
| `type` | string | 타입 필터 (`once`, `interval`, `cron`) |
| `sortBy` | string | 정렬 기준 (`created_at`, `name`, `next_run_at`) |
| `sortOrder` | string | 정렬 순서 |

### POST /api/schedules

스케줄을 생성합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | 스케줄 이름 |
| `type` | string | Yes | 타입 (`once`, `interval`, `cron`) |
| `config` | object | No | 설정 |
| `video_ids` | string[] | Yes | 비디오 ID 배열 |

**Config by type:**

- `once`: `{ run_at: "ISO8601" }`
- `interval`: `{ interval_minutes: 30 }`
- `cron`: `{ cron: "0 * * * *" }`

### GET /api/schedules/:id

단일 스케줄을 조회합니다.

### PATCH /api/schedules/:id

스케줄을 수정합니다.

**Request Body:**

허용 필드: `name`, `config`, `video_ids`, `status`

### DELETE /api/schedules/:id

스케줄을 삭제합니다.

### POST /api/schedules/:id/run

스케줄을 즉시 실행합니다.

**Response:**

```json
{
  "success": true,
  "data": {
    "queued": 10
  }
}
```

---

## Videos

### GET /api/videos

영상 목록을 조회합니다.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 페이지 번호 |
| `pageSize` | number | 페이지 크기 |
| `search` | string | 검색어 (제목, 채널명) |
| `status` | string | 상태 필터 |
| `category` | string | 카테고리 필터 |
| `channelId` | string | 채널 ID 필터 |
| `sortBy` | string | 정렬 기준 (`created_at`, `priority`, `total_executions`, `title`) |
| `sortOrder` | string | 정렬 순서 |

### POST /api/videos

영상을 추가합니다.

**Request Body (단일):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `youtube_url` | string | Yes | YouTube URL |
| `title` | string | No | 제목 |
| `channel_name` | string | No | 채널명 |
| `duration_seconds` | number | No | 영상 길이(초) |
| `target_watch_seconds` | number | No | 목표 시청 시간(초) |
| `target_views` | number | No | 목표 조회수 |
| `prob_like` | number | No | 좋아요 확률 |
| `prob_comment` | number | No | 댓글 확률 |
| `prob_subscribe` | number | No | 구독 확률 |
| `prob_playlist` | number | No | 재생목록 확률 |
| `keyword` | string | No | 검색 키워드 |
| `priority` | string | No | 우선순위 (`urgent`, `high`, `normal`, `low`) |
| `tags` | string[] | No | 태그 |
| `auto_watch` | boolean | No | 자동 시청 작업 생성 (기본: true) |

**Request Body (벌크):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `youtube_urls` | string[] | Yes | YouTube URL 배열 |

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "videoId",
    "title": "string",
    ...
    "auto_job": {
      "jobId": "string",
      "assignedCount": 80,
      "commentCount": 50
    }
  }
}
```

### GET /api/videos/:id

단일 영상을 조회합니다.

### PATCH /api/videos/:id

영상을 수정합니다.

**Request Body:**

허용 필드: `status`, `priority`, `target_watch_seconds`, `category`, `tags`, `title`

### DELETE /api/videos/:id

영상을 삭제합니다.

---

## Workers

### GET /api/workers

연결된 Worker 목록을 조회합니다. (Desktop Agent Manager 연동)

**Response:**

```json
{
  "success": true,
  "data": {
    "managerOnline": true,
    "workers": [{
      "workerId": "string",
      "type": "string",
      "status": "online | offline | busy | error",
      "connectionState": "connected",
      "connectedAt": "ISO8601",
      "lastHeartbeat": "ISO8601",
      "deviceCount": 10,
      "devices": [{
        "deviceId": "string",
        "state": "string",
        "adbId": "string"
      }],
      "activeJobs": 5,
      "maxConcurrentJobs": 10,
      "metrics": {
        "totalJobsExecuted": 1000,
        "successfulJobs": 950,
        "failedJobs": 50,
        "averageJobDurationMs": 65000,
        "cpuUsage": 50,
        "memoryUsage": 60,
        "uptimeSeconds": 86400
      }
    }],
    "summary": {
      "totalWorkers": 5,
      "onlineWorkers": 5,
      "totalDevices": 50,
      "activeJobs": 25
    }
  }
}
```

### POST /api/workers

Worker에 작업을 디스패치합니다.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workerId` | string | No | 특정 Worker ID |
| `jobType` | string | Yes | 작업 타입 |
| `params` | object | No | 작업 파라미터 |
| `deviceIds` | string[] | No | 대상 디바이스 ID |
| `options` | object | No | 추가 옵션 |

---

## YouTube Meta

### GET /api/youtube-meta

YouTube 영상 메타데이터를 조회합니다.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | YouTube URL |

**Response:**

```json
{
  "videoId": "string",
  "title": "string",
  "description": "string (first 200 chars)",
  "thumbnail": "string (maxres or high)",
  "thumbnailMedium": "string",
  "channelTitle": "string",
  "channelId": "string",
  "publishedAt": "ISO8601",
  "duration": 180,
  "durationFormatted": "3:00"
}
```

---

## Common Response Formats

### Success Response

```json
{
  "success": true,
  "data": {...}
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | 잘못된 요청 |
| `INVALID_JSON` | 유효하지 않은 JSON |
| `NOT_FOUND` | 리소스를 찾을 수 없음 |
| `DUPLICATE` | 중복 리소스 |
| `DB_ERROR` | 데이터베이스 오류 |
| `INTERNAL_ERROR` | 내부 서버 오류 |
| `CONFIG_ERROR` | 설정 오류 |
| `MANAGER_OFFLINE` | Desktop Agent 오프라인 |
