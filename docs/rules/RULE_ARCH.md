# DOAI.ME 시스템 아키텍처 규칙

> **이 문서는 모든 에이전트가 참조해야 하는 핵심 아키텍처 규칙입니다.**

---

## 1. 시스템 정체성

이 시스템은 **Command & Control (C2) + State Machine** 패턴을 따르는 **디바이스 팜 오케스트레이션** 플랫폼입니다.

| 분야 | 유사 시스템 | 공통점 |
|------|------------|--------|
| DevOps | Jenkins Agent, GitLab Runner | 중앙 서버가 작업 정의, 에이전트가 실행 |
| IoT | AWS IoT, Azure IoT Hub | 대량 디바이스 원격 제어, 상태 추적 |
| 모바일 테스트 | STF (Smartphone Test Farm) | 폰 팜 관리, 원격 명령 |
| 분산 시스템 | Temporal, Celery | 워크플로우 오케스트레이션 |

---

## 2. 핵심 원칙

### 2.1 Command & Control (C2) 원칙

```
┌─────────────────────────────────────────────────────────────┐
│                      서버 (Commander)                        │
│  • "무엇을 할지" 정의                                        │
│  • Single Source of Truth (진실의 원천)                      │
│  • 상태 결정 권한                                            │
└─────────────────────────────┬───────────────────────────────┘
                              │ 명령 (Command)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      노드 (Agent)                            │
│  • "어떻게 할지" 실행                                        │
│  • 상태 보고만 (결정 권한 없음)                               │
│  • 명령 수신 → 실행 → 결과 보고                              │
└─────────────────────────────────────────────────────────────┘
```

**규칙:**
- ✅ 서버만 디바이스 상태를 변경할 수 있음
- ✅ 노드는 이벤트를 보고하고, 서버가 상태 전이를 결정
- ❌ 노드가 직접 상태를 결정하는 코드 금지

### 2.2 State Machine 원칙

```
                    ┌──────────────────────────────────────┐
                    │        DEVICE STATE MACHINE          │
                    └──────────────────────────────────────┘

    ┌──────────────┐                           ┌──────────────┐
    │ DISCONNECTED │◄──────── timeout ─────────│    IDLE      │
    └──────┬───────┘                           └──────┬───────┘
           │                                          │
           │ connect                                  │ execute
           ▼                                          ▼
    ┌──────────────┐                           ┌──────────────┐
    │    IDLE      │◄──────── complete ────────│   RUNNING    │
    └──────────────┘                           └──────┬───────┘
                                                      │
                    ┌─────────────────────────────────┤
                    │ fail (count < 3)                │ fail (count >= 3)
                    ▼                                 ▼
             ┌──────────────┐               ┌──────────────┐
             │    ERROR     │               │  QUARANTINE  │
             └──────────────┘               └──────────────┘
```

**허용된 상태 전이:**

| From | To | Trigger |
|------|----|---------|
| DISCONNECTED | IDLE | connect (heartbeat 수신) |
| IDLE | QUEUED | execute_workflow (큐에 추가) |
| QUEUED | RUNNING | worker가 Job 시작 |
| RUNNING | IDLE | workflow_complete |
| RUNNING | ERROR | workflow_fail (count < 3) |
| RUNNING | QUARANTINE | workflow_fail (count >= 3) |
| ERROR | IDLE | manual_reset |
| QUARANTINE | IDLE | manual_release |
| * | DISCONNECTED | heartbeat_timeout (30초) |

**규칙:**
- ✅ 상태 전이는 반드시 위 표에 정의된 경로만 허용
- ✅ 모든 상태 변경은 `stateService.updateDeviceState()` 통해서만
- ❌ 직접 Redis에 상태 쓰기 금지
- ❌ 정의되지 않은 상태 전이 금지

---

## 3. 통신 프로토콜 규칙

### 3.1 메시지 방향

```
┌─────────────────────────────────────────────────────────────┐
│ SERVER → NODE (Commands)                                     │
│ Prefix: cmd:                                                 │
├─────────────────────────────────────────────────────────────┤
│ cmd:execute_workflow  워크플로우 실행 명령                    │
│ cmd:cancel_workflow   워크플로우 취소 명령                    │
│ cmd:reset_device      디바이스 리셋 명령                      │
│ cmd:release_quarantine 격리 해제 명령                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ NODE → SERVER (Events)                                       │
│ Prefix: evt:                                                 │
├─────────────────────────────────────────────────────────────┤
│ evt:state_update      상태 보고                              │
│ evt:heartbeat         생존 신호 (10초마다)                    │
│ evt:log               로그 전송                              │
│ evt:workflow_progress Step 진행 보고                         │
│ evt:workflow_complete 워크플로우 완료                         │
│ evt:workflow_failed   워크플로우 실패                         │
│ evt:command_ack       명령 수신 확인                          │
└─────────────────────────────────────────────────────────────┘
```

**규칙:**
- ✅ 서버→노드: `cmd:` prefix 사용
- ✅ 노드→서버: `evt:` prefix 사용
- ✅ 모든 메시지에 `timestamp`, `requestId` 포함
- ❌ 노드가 `cmd:` 이벤트 emit 금지
- ❌ 서버가 `evt:` 이벤트 emit 금지

### 3.2 Heartbeat 규칙

| 설정 | 값 | 설명 |
|------|-----|------|
| INTERVAL | 10초 | 노드가 heartbeat 보내는 주기 |
| TIMEOUT | 30초 | 이 시간 동안 heartbeat 없으면 DISCONNECTED |
| RECONNECT_INTERVAL | 5초 | 연결 끊김 후 재연결 시도 주기 |
| MAX_RECONNECT_ATTEMPTS | 10 | 최대 재연결 시도 횟수 |

---

## 4. 워크플로우 엔진 규칙

### 4.1 워크플로우 구조

```yaml
# 워크플로우 정의 (YAML)
name: youtube_watch
version: "1.0"
timeout: 300000  # 5분

steps:
  - id: open_app
    action: autox          # autox | adb | system | wait | condition
    script: open_youtube
    timeout: 10000
    retry:
      attempts: 3
      delay: 1000
      backoff: exponential  # fixed | exponential | linear
    errorPolicy: fail       # fail | skip | goto
    
  - id: error_handler
    action: system
    params:
      action: take_screenshot
    # errorPolicy: 'goto' 일 때 nextOnError: 'error_handler' 로 점프
```

**규칙:**
- ✅ 워크플로우는 YAML로 정의
- ✅ 각 step은 고유한 `id` 필수
- ✅ `timeout`, `retry` 설정 필수
- ✅ `errorPolicy` 명시적 설정 권장
- ❌ 하드코딩된 워크플로우 금지 (YAML 파일 사용)

### 4.2 Step 액션 타입

| 액션 | 용도 | 파라미터 |
|------|------|----------|
| `autox` | AutoX.js 스크립트 실행 | `script`, `params` |
| `adb` | ADB 명령 실행 | `command` |
| `system` | 시스템 액션 | `action`, `params` |
| `wait` | 대기 | `duration` (초) |
| `condition` | 조건 분기 | `expression`, `onTrue`, `onFalse` |

### 4.3 에러 처리 정책

```
┌─────────────────┐
│  Step 실행 실패  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Retry 남았나?                                             │
│    ├─ YES → delay 후 재시도 (backoff 적용)                   │
│    └─ NO  → errorPolicy 확인                                 │
├─────────────────────────────────────────────────────────────┤
│ 2. errorPolicy                                               │
│    ├─ 'fail'  → 워크플로우 실패, errorCount++                │
│    ├─ 'skip'  → 이 step 건너뛰고 다음 step                   │
│    └─ 'goto'  → nextOnError로 지정된 step으로 이동           │
├─────────────────────────────────────────────────────────────┤
│ 3. errorCount >= 3                                           │
│    ├─ YES → 디바이스 상태: QUARANTINE                        │
│    └─ NO  → 디바이스 상태: ERROR                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 데이터 흐름 규칙

### 5.1 Redis 키 구조

```
# 디바이스 상태 (Hash)
device:{device_id}
  ├─ state: "RUNNING"
  ├─ node_id: "node_001"
  ├─ workflow_id: "youtube_watch"
  ├─ current_step: "play_video"
  ├─ progress: 66
  ├─ last_heartbeat: 1699999999
  └─ error_count: 0

# 노드 상태 (Hash)
node:{node_id}
  ├─ status: "online"
  ├─ device_count: 100
  ├─ active_jobs: 45
  ├─ last_seen: 1699999999
  ├─ cpu: 23
  └─ memory: 67

# 실시간 통계 (Sorted Set)
stats:devices:by_state
  ├─ IDLE: 320
  ├─ RUNNING: 150
  ├─ ERROR: 25
  └─ DISCONNECTED: 5
```

**규칙:**
- ✅ 모든 Redis 접근은 `redisService` 통해서만
- ✅ 키 이름은 `KEYS` 상수 사용
- ❌ 직접 키 문자열 하드코딩 금지
- ❌ 실시간 데이터를 Supabase에 직접 쓰기 금지 (Redis 우선)

### 5.2 BullMQ 큐 구조

```
# 워크플로우 실행 큐 (노드별)
workflow:node_001
workflow:node_002
...

# 시스템 작업 큐
system:health_check
system:sync

# 우선순위 큐
priority:urgent  # 긴급 명령 (취소, 중지 등)
```

**규칙:**
- ✅ 워크플로우 Job은 노드별 큐에 분배
- ✅ 긴급 명령은 `priority:urgent` 큐 사용
- ✅ Job 생성 시 `priority`, `timeout`, `attempts` 필수
- ❌ 전역 단일 큐 사용 금지 (노드별 분리 필수)

---

## 6. 계층별 책임

### 6.1 서버 (apps/backend)

| 파일 | 책임 |
|------|------|
| `socketio-server.js` | Socket.IO 연결 관리, 이벤트 라우팅 |
| `services/redisService.js` | Redis 상태 관리 |
| `services/queueService.js` | BullMQ 큐 관리 |
| `services/stateService.js` | 상태 머신 로직 (전이 결정) |
| `routes/workflow.js` | REST API (대시보드 연동) |
| `workers/workflowWorker.js` | BullMQ Worker (Job 처리) |

### 6.2 노드 (apps/desktop-agent)

| 파일 | 책임 |
|------|------|
| `src/bot.js` | Socket.IO 클라이언트, 명령 수신/이벤트 발송 |
| `src/executor.js` | 워크플로우 Step 실행 |
| `src/adb-controller.js` | ADB 명령 실행 |

### 6.3 공유 (packages/shared)

| 파일 | 책임 |
|------|------|
| `device-state.ts` | 상태 정의, 메타데이터 |
| `state-machine.ts` | 상태 전이 규칙 |
| `protocol.ts` | 통신 메시지 타입 |

### 6.4 워크플로우 엔진 (packages/workflow-engine)

| 파일 | 책임 |
|------|------|
| `types.ts` | 워크플로우/Step 타입 정의 |
| `parser.ts` | YAML 파싱 |
| `runner.ts` | Step 순차 실행 |
| `retry.ts` | 재시도 로직 |

---

## 7. 금지 패턴

### 7.1 아키텍처 위반

```javascript
// ❌ 노드가 직접 상태 변경
socket.emit('evt:state_update', { state: 'IDLE' });  // 노드가 상태 결정

// ✅ 노드는 이벤트만 보고, 서버가 결정
socket.emit('evt:workflow_complete', { deviceId, result });  // 완료 보고
// 서버에서: stateService.updateDeviceState(deviceId, 'WORKFLOW_COMPLETE');
```

### 7.2 통신 위반

```javascript
// ❌ 접두사 없는 이벤트
socket.emit('start_workflow', { ... });

// ✅ 명확한 접두사
socket.emit('cmd:execute_workflow', { ... });  // 서버
socket.emit('evt:workflow_progress', { ... }); // 노드
```

### 7.3 상태 접근 위반

```javascript
// ❌ 직접 Redis 접근
await redis.hset(`device:${deviceId}`, 'state', 'RUNNING');

// ✅ 서비스 통해 접근
await redisService.setDeviceState(deviceId, { state: DeviceState.RUNNING });
```

### 7.4 큐 사용 위반

```javascript
// ❌ 전역 큐에 모든 Job 추가
await queue.add('workflow', { deviceIds: allDevices });

// ✅ 노드별 큐에 분배
await queueService.distributeWorkflowJobs(distribution, workflowId, params);
```

---

## 8. 체크리스트

### 새 기능 추가 시

- [ ] 상태 전이가 필요하면 `VALID_TRANSITIONS`에 정의했는가?
- [ ] 통신 메시지는 `cmd:`/`evt:` 접두사를 사용했는가?
- [ ] Redis 접근은 `redisService`를 통하는가?
- [ ] 워크플로우는 YAML로 정의했는가?
- [ ] 에러 처리 정책(retry, errorPolicy)을 설정했는가?

### 코드 리뷰 시

- [ ] 노드가 상태를 결정하는 코드가 있는가? → 거부
- [ ] 하드코딩된 워크플로우가 있는가? → YAML로 이동
- [ ] 직접 Redis 키를 조작하는가? → 서비스 사용으로 변경
- [ ] Heartbeat 관련 매직 넘버가 있는가? → 상수 사용

---

## 9. 참조 코드

### 상태 전이 예시

```typescript
// packages/shared/src/state-machine.ts
import { DeviceStates, StateTransitionTriggers } from './device-state';

export function transitionByTrigger(
  currentState: DeviceState,
  trigger: StateTransitionTrigger
): DeviceState {
  const nextState = TRIGGER_TRANSITIONS[trigger]?.[currentState];
  if (!nextState) {
    throw new Error(`Invalid transition: ${currentState} + ${trigger}`);
  }
  return nextState;
}
```

### 이벤트 핸들링 예시

```javascript
// apps/backend/socketio-server.js
socket.on('evt:workflow_complete', async (data) => {
  const { deviceId, result } = data;
  
  // 서버가 상태 전이 결정
  await stateService.updateDeviceState(
    deviceId,
    StateTransitionTriggers.WORKFLOW_COMPLETE,
    { result }
  );
  
  // Pub/Sub로 대시보드에 알림
  await redisService.publishDeviceUpdate(deviceId, { state: 'IDLE' });
});
```
