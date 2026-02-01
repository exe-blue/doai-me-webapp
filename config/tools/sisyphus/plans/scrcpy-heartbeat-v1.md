# Work Plan: Scrcpy Remote Trigger + Smart Heartbeat

**Plan ID:** `scrcpy-heartbeat-v1`
**Created:** 2026-01-29
**Status:** Ready for Execution
**Estimated Tasks:** 12

---

## Overview

두 가지 핵심 기능 구현:

1. **Scrcpy Remote Trigger** - 대시보드에서 PC Worker로 Scrcpy 실행 신호 전송
2. **Smart Heartbeat** - 3단계 기기 상태 모니터링 (Green/Red/Gray)

---

## Prerequisites

- [x] System Analysis 문서 완료
- [ ] Supabase 접근 권한 확인
- [ ] PC Worker에 Scrcpy 설치 확인

---

## Phase 1: Database Schema (DB)

### Task DB-01: devices 테이블 확장
**Priority:** Critical
**Files:** `supabase-schema.sql`

```sql
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_job_activity_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS adb_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) DEFAULT 'offline';

-- health_status에 대한 CHECK 제약조건 추가
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_health_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_health_status_check 
  CHECK (health_status IN ('healthy', 'zombie', 'offline'));
```

**Acceptance Criteria:**

- [ ] 5개 컬럼 추가됨
- [ ] health_status CHECK constraint 적용
- [ ] 기존 데이터 마이그레이션 (모두 'offline'으로 초기화)

---

### Task DB-02: scrcpy_commands 테이블 생성
**Priority:** Critical
**Files:** `supabase-schema.sql`

```sql
CREATE TABLE scrcpy_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  pc_id VARCHAR(50) NOT NULL,
  command_type VARCHAR(20) NOT NULL CHECK (command_type IN ('scrcpy_start', 'scrcpy_stop')),
  options JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT scrcpy_commands_status_check CHECK (status IN ('pending', 'received', 'executing', 'completed', 'failed', 'timeout')),
  process_pid INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  owner_user_id UUID REFERENCES auth.users(id),
  assigned_worker_id VARCHAR(50)
);

-- RLS 활성화
ALTER TABLE scrcpy_commands ENABLE ROW LEVEL SECURITY;

-- Dashboard 사용자: 자신이 소유한 PC의 명령만 INSERT 가능
CREATE POLICY scrcpy_insert_dashboard ON scrcpy_commands
  FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM devices d 
      WHERE d.id = device_id 
      AND d.owner_id = auth.uid()
    )
  );

-- PC Worker: 자신의 PC에 할당된 pending 명령만 SELECT 가능
CREATE POLICY scrcpy_select_worker ON scrcpy_commands
  FOR SELECT
  USING (
    pc_id = current_setting('app.current_pc_id', true)
    AND status = 'pending'
  );

-- PC Worker: 자신이 처리 중인 명령만 UPDATE 가능
CREATE POLICY scrcpy_update_worker ON scrcpy_commands
  FOR UPDATE
  USING (
    pc_id = current_setting('app.current_pc_id', true)
    AND status IN ('pending', 'received', 'executing')
  );

-- Admin: 모든 권한
CREATE POLICY scrcpy_full_admin ON scrcpy_commands
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');
```

**Acceptance Criteria:**

- [ ] 테이블 생성됨
- [ ] Realtime 활성화됨
- [ ] RLS 정책 적용됨

---

### Task DB-03: Realtime Publication 설정
**Priority:** High
**Files:** `supabase-schema.sql`

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE scrcpy_commands;
CREATE INDEX idx_scrcpy_commands_pending ON scrcpy_commands(pc_id, status) WHERE status = 'pending';
CREATE INDEX idx_devices_health ON devices(pc_id, health_status);
```

**Acceptance Criteria:**

- [ ] scrcpy_commands Realtime 구독 가능
- [ ] 인덱스 생성됨

---

## Phase 2: Backend - PC Worker (BE)

### Task BE-01: Heartbeat Loop 구현
**Priority:** Critical
**Files:** `client-pc/worker.js`
**Depends On:** DB-01

**Implementation:**
```
1. 30초 간격 setInterval 추가
2. 연결된 모든 기기에 대해:
   - `adb -s {serial} shell echo 1` 실행 (timeout: 5s)
   - 성공: last_heartbeat_at 업데이트, health_status='healthy'
   - 실패: consecutive_failures++
   - 3회 연속 실패: health_status='zombie'
3. ADB 목록에 없는 기기: health_status='offline'
4. 작업 완료 시 (BE-03에서 호출):
   - last_job_activity_at = NOW() 업데이트 (성공/실패 모두)
   - computeHealthStatus에서 last_heartbeat_at과 last_job_activity_at 중 
     최신 값을 사용하여 건강 상태 판단
```

**Acceptance Criteria:**

- [ ] Heartbeat가 30초마다 실행됨
- [ ] devices 테이블의 last_heartbeat_at이 업데이트됨
- [ ] 연결 끊긴 기기가 'offline'으로 마킹됨
- [ ] 응답 없는 기기가 'zombie'로 마킹됨

---

### Task BE-02: Scrcpy Command Polling 구현
**Priority:** High
**Files:** `client-pc/worker.js`
**Depends On:** DB-02

**Implementation:**
```
1. 2초 간격 setInterval 추가
2. scrcpy_commands 테이블에서 pending 명령 조회
   - WHERE pc_id = $PC_ID AND status = 'pending'
   - AND created_at > NOW() - INTERVAL '3 minutes'
3. 명령 발견 시:
   - status='received' 업데이트
   - executeScrcpy() 호출
4. 타임아웃 처리:
   - created_at이 3분 이상 경과한 pending 명령 감지
   - status='timeout'으로 업데이트
   - 프론트엔드에서 재시도 버튼 표시 가능
```

**Acceptance Criteria:**

- [ ] Pending 명령이 2초 내 감지됨
- [ ] 30초 이상 된 명령은 무시됨
- [ ] status 전이가 정확히 기록됨

---

### Task BE-03: Scrcpy Execution Logic 구현
**Priority:** High
**Files:** `client-pc/worker.js`
**Depends On:** BE-02

**Implementation:**
```javascript
// PID 추적 맵 (device_id -> pid)
const processPidMap = new Map();

async function executeScrcpy(command) {
  const { device_id, command_type, options } = command;
  const serial = deviceIdCache.getSerial(device_id);

  if (command_type === 'scrcpy_start') {
    // 1. Validate scrcpy installation
    // 2. Spawn scrcpy process with options
    // 3. Track process PID
    processPidMap.set(device_id, process.pid);
    // 4. Handle process exit/error events
    // 5. Update command status
    // 6. 작업 완료 시 last_job_activity_at 업데이트
  } 
  else if (command_type === 'scrcpy_stop') {
    // 1. PID 조회
    const pid = processPidMap.get(device_id);
    if (!pid) {
      // PID 없음 - 이미 종료되었거나 시작되지 않음
      await updateCommandStatus(command.id, 'completed', { 
        error_message: 'Process not found (already stopped)' 
      });
      return;
    }

    try {
      // 2. 우아한 종료 시도 (SIGTERM)
      process.kill(pid, 'SIGTERM');
      
      // 3. 종료 대기 (3초 타임아웃)
      const exitPromise = waitForProcessExit(pid, 3000);
      const exited = await exitPromise;
      
      if (!exited) {
        // 4. 강제 종료 (SIGKILL)
        process.kill(pid, 'SIGKILL');
      }
      
      // 5. PID 추적 제거
      processPidMap.delete(device_id);
      
      // 6. 상태 업데이트
      await updateCommandStatus(command.id, 'completed');
      
    } catch (err) {
      // ENOENT/ESRCH: 프로세스가 이미 종료됨
      if (err.code === 'ESRCH' || err.code === 'ENOENT') {
        processPidMap.delete(device_id);
        await updateCommandStatus(command.id, 'completed', {
          error_message: 'Process already terminated'
        });
      } else {
        await updateCommandStatus(command.id, 'failed', {
          error_message: err.message
        });
      }
    }
  }
}
```

**Acceptance Criteria:**

- [ ] Scrcpy 창이 PC에서 열림
- [ ] process_pid가 DB에 기록됨
- [ ] 에러 시 error_message가 기록됨
- [ ] scrcpy_stop 명령으로 프로세스 종료 가능

---

### Task BE-04: Zombie Recovery Logic 구현
**Priority:** Medium
**Files:** `client-pc/worker.js`
**Depends On:** BE-01

**Implementation:**
```
Zombie 상태 5분 이상 지속 시:
1. adb shell input keyevent 26 (화면 깨우기)
2. 3초 대기 후 재확인
3. 여전히 zombie면 AutoX.js 재시작
```

**Acceptance Criteria:**

- [ ] Zombie 기기에 자동 복구 시도됨
- [ ] 복구 시도 로그가 기록됨

---

## Phase 3: Frontend - Dashboard (FE)

### Task FE-01: Health Status UI 컴포넌트
**Priority:** Critical
**Files:** `dashboard/src/components/StatusBoard.tsx`
**Depends On:** DB-01

**Implementation:**
```typescript
function getHealthIndicator(device: Device) {
  const status = computeHealthStatus(device);

  return {
    healthy: { color: 'bg-green-500', animation: 'animate-pulse' },
    zombie: { color: 'bg-red-500', animation: 'animate-ping' },
    offline: { color: 'bg-gray-400', animation: '' }
  }[status];
}
```

**Acceptance Criteria:**

- [ ] 3가지 색상이 올바르게 표시됨
- [ ] Healthy 기기에 미세한 펄스 애니메이션
- [ ] Zombie 기기에 경고 애니메이션
- [ ] Hover 시 상세 정보 표시

---

### Task FE-02: computeHealthStatus 함수 구현
**Priority:** Critical
**Files:** `dashboard/src/lib/healthStatus.ts` (신규)
**Depends On:** FE-01

**Implementation:**
```typescript
export function computeHealthStatus(device: Device): 'healthy' | 'zombie' | 'offline' {
  // ADB 연결이 끊긴 경우 오프라인
  if (!device.adb_connected) return 'offline';

  // 마지막 활동 시간 계산 (heartbeat와 job activity 중 최신 값)
  const lastHeartbeat = device.last_heartbeat_at 
    ? new Date(device.last_heartbeat_at).getTime() 
    : 0;
  const lastJobActivity = device.last_job_activity_at 
    ? new Date(device.last_job_activity_at).getTime() 
    : 0;
  const lastActivity = Math.max(lastHeartbeat, lastJobActivity);

  // 활동 기록이 없으면 오프라인
  if (lastActivity === 0) return 'offline';

  const elapsedMs = Date.now() - lastActivity;

  // 60초 이내 활동 → healthy
  if (elapsedMs <= 60_000) return 'healthy';
  
  // 180초 초과 무활동 → zombie
  if (elapsedMs > 180_000) return 'zombie';
  
  // 60초~180초 중간 상태 → healthy 유지 (경계 구간)
  return 'healthy';
}
```

**Acceptance Criteria:**

- [x] 60초 이내 활동: healthy
- [x] 180초 초과 무활동: zombie
- [x] ADB 연결 끊김: offline

---

### Task FE-03: Scrcpy Trigger Button UI
**Priority:** High
**Files:** `dashboard/src/components/StatusBoard.tsx`
**Depends On:** DB-02

**Implementation:**
```
1. 각 기기 셀에 [화면] 버튼 추가
2. 클릭 시 scrcpy_commands INSERT
3. 버튼 상태: idle → loading → success/error
4. PC Offline 시 버튼 비활성화
```

**Acceptance Criteria:**

- [ ] 버튼이 각 기기 셀에 표시됨
- [ ] 클릭 시 loading 상태 표시
- [ ] 명령 완료 시 success 피드백
- [ ] 오프라인 PC의 기기는 버튼 비활성화

---

### Task FE-04: Scrcpy Command Realtime 구독
**Priority:** High
**Files:** `dashboard/src/components/StatusBoard.tsx`
**Depends On:** FE-03

**Implementation:**
```typescript
useEffect(() => {
  let retryCount = 0;
  const maxRetries = 5;
  let retryTimer: NodeJS.Timeout | null = null;
  let isPollingFallback = false;
  let pollInterval: NodeJS.Timeout | null = null;

  const setupSubscription = () => {
    const channel = supabase
      .channel('scrcpy-status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'scrcpy_commands'
      }, (payload) => {
        // Update button state based on command status
        retryCount = 0; // 성공 시 재시도 카운트 리셋
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription established');
          retryCount = 0;
          // 폴링 폴백 중이었다면 중지
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
            isPollingFallback = false;
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Realtime subscription error: ${status}`);
          handleReconnect(channel);
        }
      });

    return channel;
  };

  const handleReconnect = (channel: RealtimeChannel) => {
    retryCount++;
    if (retryCount <= maxRetries) {
      // 지수 백오프 재연결 (1s, 2s, 4s, 8s, 16s)
      const delay = Math.pow(2, retryCount - 1) * 1000;
      console.log(`Reconnecting in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
      retryTimer = setTimeout(() => {
        supabase.removeChannel(channel);
        setupSubscription();
      }, delay);
    } else {
      // 최대 재시도 초과 → 폴링 폴백
      console.warn('Max retries exceeded, falling back to polling');
      isPollingFallback = true;
      pollInterval = setInterval(async () => {
        const { data } = await supabase
          .from('scrcpy_commands')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        // Update state with polled data
      }, 5000);
    }
  };

  const channel = setupSubscription();

  return () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (pollInterval) clearInterval(pollInterval);
    supabase.removeChannel(channel);
  };
}, []);
```

**Acceptance Criteria:**

- [ ] 명령 상태 변경이 실시간 반영됨
- [ ] 연결 끊김 시 자동 재연결

---

### Task FE-05: TypeScript 타입 정의 확장
**Priority:** Medium
**Files:** `dashboard/src/lib/supabase.ts`
**Depends On:** DB-01, DB-02

**Implementation:**
```typescript
export interface Device {
  // ... existing fields
  last_heartbeat_at: string | null;
  last_job_activity_at: string | null;
  adb_connected: boolean;
  consecutive_failures: number;
  health_status: 'healthy' | 'zombie' | 'offline';
}

// Scrcpy 실행 옵션 타입 정의
export interface ScrcpyOptions {
  // 화면 해상도 (예: 1280, 720)
  maxSize?: number;
  // 비트레이트 (bps, 예: 8000000 = 8Mbps)
  bitRate?: number;
  // 녹화 여부 및 파일 경로
  record?: string | null;
  // 프레임레이트 제한
  maxFps?: number;
  // 추가 scrcpy 명령행 인자
  additionalArgs?: string[];
  // 창 제목
  windowTitle?: string;
  // 전체화면 모드
  fullscreen?: boolean;
  // 항상 위
  alwaysOnTop?: boolean;
}

export interface ScrcpyCommand {
  id: string;
  device_id: string;
  pc_id: string;
  command_type: 'scrcpy_start' | 'scrcpy_stop';
  options: ScrcpyOptions;
  status: 'pending' | 'received' | 'executing' | 'completed' | 'failed' | 'timeout';
  process_pid: number | null;
  error_message: string | null;
  created_at: string;
  received_at: string | null;
  completed_at: string | null;
  owner_user_id: string | null;
  assigned_worker_id: string | null;
}
```

**Acceptance Criteria:**

- [ ] 모든 새 필드가 타입에 반영됨
- [ ] TypeScript 컴파일 에러 없음

---

## Phase 4: Integration & Testing (QA)

### Task QA-01: End-to-End 테스트
**Priority:** Critical
**Depends On:** All previous tasks

**Test Scenarios:**

1. [ ] 기기 연결 → 60초 내 Green 표시
2. [ ] 기기 무응답 3분 → Red 표시
3. [ ] USB 분리 → Gray 표시
4. [ ] Scrcpy 버튼 클릭 → PC에서 창 열림
5. [ ] PC 오프라인 → 버튼 비활성화

---

### Task QA-02: Unit Tests
**Priority:** High
**Depends On:** BE-01, BE-03, BE-04, FE-02

**Unit Test Cases:**

#### UT-01: computeHealthStatus 함수 테스트
| Input | Expected Output | Description |
|-------|-----------------|-------------|
| `{ adb_connected: false, ... }` | `'offline'` | ADB 미연결 |
| `{ adb_connected: true, last_heartbeat_at: null, last_job_activity_at: null }` | `'offline'` | 활동 기록 없음 |
| `{ adb_connected: true, last_heartbeat_at: 30초 전 }` | `'healthy'` | 최근 하트비트 |
| `{ adb_connected: true, last_heartbeat_at: 5분 전, last_job_activity_at: 1분 전 }` | `'healthy'` | 최근 작업 활동 |
| `{ adb_connected: true, last_heartbeat_at: 5분 전, last_job_activity_at: 5분 전 }` | `'zombie'` | 오래된 활동 |

#### UT-02: Zombie Recovery Logic 테스트 (BE-04)
| Scenario | Expected Behavior |
|----------|-------------------|
| zombie 상태 5분 미만 | 복구 시도 안 함 |
| zombie 상태 5분 이상 | 화면 깨우기 (keyevent 26) 실행 |
| 화면 깨우기 후 3초 후 재확인 | healthy로 전환 시 복구 완료 로그 |
| 여전히 zombie | AutoX.js 재시작 시도 |

#### UT-03: executeScrcpy 함수 테스트 (BE-03)
| Input | Expected Behavior |
|-------|-------------------|
| `{ command_type: 'scrcpy_start', options: {} }` | scrcpy 프로세스 생성, PID 저장 |
| `{ command_type: 'scrcpy_start' }` 실행 중 에러 | status='failed', error_message 기록 |
| `{ command_type: 'scrcpy_stop' }` + 실행 중 프로세스 | SIGTERM → SIGKILL 순서로 종료 |
| `{ command_type: 'scrcpy_stop' }` + 프로세스 없음 | 'completed' + 경고 메시지 |

**Test Framework:** Jest (Node.js) / Vitest (Frontend)

---

## Execution Order

```
Phase 1 (DB)
├── DB-01: devices 테이블 확장
├── DB-02: scrcpy_commands 테이블 생성
└── DB-03: Realtime 설정

Phase 2 (BE) [depends on Phase 1]
├── BE-01: Heartbeat Loop
├── BE-02: Scrcpy Command Polling [depends on BE-01]
├── BE-03: Scrcpy Execution [depends on BE-02]
└── BE-04: Zombie Recovery [depends on BE-01]

Phase 3 (FE) [depends on Phase 1]
├── FE-01: Health Status UI
├── FE-02: computeHealthStatus 함수
├── FE-03: Scrcpy Button UI
├── FE-04: Realtime 구독
└── FE-05: TypeScript 타입

Phase 4 (QA) [depends on Phase 2, 3]
└── QA-01: E2E 테스트
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Scrcpy 미설치 | Worker 시작 시 버전 체크, 경고 로그 |
| Realtime 연결 끊김 | 자동 재연결 + 폴백 polling |
| 대량 기기 동시 요청 | 큐 처리 + 500ms 딜레이 |

---

## Notes

- 모든 timestamp는 서버 시간(NOW()) 사용
- Worker는 기존 syncDevices 루프와 통합
- Dashboard는 기존 StatusBoard 컴포넌트 확장

---

**Execute with:** `/sisyphus scrcpy-heartbeat-v1`
