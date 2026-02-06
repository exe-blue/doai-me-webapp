# Worker v5.1 + WebView Bot 통합 테스트 가이드

## 개요

이 가이드는 Worker v5.1과 WebView Bot의 전체 플로우를 단계별로 테스트하는 방법을 설명합니다.

---

## 사전 준비

### 1. 필수 소프트웨어

- [x] Node.js 16+ 설치
- [x] ADB (Android Debug Bridge) 설치
- [x] AutoX.js 앱 (Android 기기에 설치)
- [x] Supabase 프로젝트 설정 완료

### 2. 환경 변수 설정

`.env` 파일 확인:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# ADB
ADB_PATH=C:\platform-tools\adb.exe

# PC 식별
PC_ID=PC-TEST-01
```

### 3. Supabase 마이그레이션

```bash
cd doai-me-webapp

# 1. claim_job RPC 생성
npx supabase db push supabase/migrations/20260129_claim_job_rpc.sql

# 2. keyword/video_title 컬럼 추가
npx supabase db push supabase/migrations/20260129_add_job_search_fields.sql

# 확인
npx supabase db remote status
```

---

## 테스트 1: 인프라 검증

### 1.1 ADB 연결 확인

```bash
# 기기 연결
adb devices

# 예상 출력:
# List of devices attached
# ABC123456789    device
```

**✅ 통과 조건**: 최소 1대 이상의 기기가 `device` 상태

### 1.2 AutoX.js 앱 실행 확인

```bash
# AutoX.js 프로세스 확인
adb shell ps | grep autojs

# 또는 패키지 확인
adb shell pm list packages | grep autojs
```

**✅ 통과 조건**: `org.autojs.autojs` 패키지 존재

### 1.3 Supabase 연결 확인

```bash
cd client-pc
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
supabase.from('devices').select('count').then(console.log);
"
```

**✅ 통과 조건**: 에러 없이 결과 반환

---

## 테스트 2: 봇 파일 배포 검증

### 2.1 로컬 파일 존재 확인

```bash
cd client-mobile

# 필수 파일 체크
ls bot-webview-autojs.js
ls selectors.json
ls modules/webview-setup.js
ls modules/dom-control.js
ls modules/search-flow.js
```

**✅ 통과 조건**: 모든 파일 존재

### 2.2 기기에 파일 배포 테스트

```bash
# 시리얼 번호 확인
export SERIAL=ABC123456789

# 디렉토리 생성
adb -s $SERIAL shell mkdir -p /sdcard/Scripts/modules

# 파일 전송 테스트
adb -s $SERIAL push bot-webview-autojs.js /sdcard/Scripts/webview_bot.js
adb -s $SERIAL push selectors.json /sdcard/Scripts/selectors.json
adb -s $SERIAL push modules/webview-setup.js /sdcard/Scripts/modules/webview-setup.js

# 파일 확인
adb -s $SERIAL shell ls -l /sdcard/Scripts/
adb -s $SERIAL shell ls -l /sdcard/Scripts/modules/
```

**✅ 통과 조건**: 모든 파일이 기기에 존재

---

## 테스트 3: Worker 단독 실행 (봇 없이)

### 3.1 Worker 시작

```bash
cd client-pc
node worker-v5.1.js
```

**예상 출력**:
```
[System] PC-Client v5.1 (PC-TEST-01) Starting...
[System] ADB Path: C:\platform-tools\adb.exe
[System] Mobile Scripts: C:\...\client-mobile
[Sync] ABC123456789 -> uuid-device-001
[Deploy] ABC123456789: WebView 봇 파일 배포 시작...
[Deploy] ABC123456789: bot-webview-autojs.js → /sdcard/Scripts/webview_bot.js
[Deploy] ABC123456789: 배포 완료 (hash: 1a2b3c4d)
[System] Worker v5.1 started. Polling for jobs...
```

**✅ 통과 조건**:
- 장치 동기화 성공
- 파일 배포 성공
- 폴링 시작

### 3.2 DB 상태 확인

Supabase Dashboard에서 확인:

```sql
-- devices 테이블
SELECT * FROM devices WHERE pc_id = 'PC-TEST-01';

-- 예상 결과:
-- id: uuid-device-001
-- serial_number: ABC123456789
-- status: idle
-- last_seen_at: (최근 시간)
```

**✅ 통과 조건**: 기기가 `idle` 상태로 등록됨

---

## 테스트 4: Job 생성 및 할당 검증

### 4.1 테스트 Job 생성

Supabase SQL Editor에서 실행:

```sql
-- Job 생성
INSERT INTO jobs (title, keyword, video_title, script_type)
VALUES ('[테스트] GPT-4 검색', 'OpenAI GPT-4', '대화형 AI의 미래', 'youtube_search')
RETURNING id;

-- 결과 확인 (job_id 복사)
-- job_id: uuid-job-001
```

### 4.2 Assignment 생성

```sql
-- Assignment 생성 (기기에 할당)
INSERT INTO job_assignments (job_id, device_id, status)
SELECT
    'uuid-job-001'::uuid,
    id,
    'pending'
FROM devices
WHERE serial_number = 'ABC123456789'
RETURNING id;

-- 결과 확인 (assignment_id 복사)
-- assignment_id: uuid-assignment-001
```

### 4.3 Worker 로그 확인

Worker 콘솔에서 확인:

```
[Poll] 작업 할당: uuid-assignment-001 → ABC123456789
[Execute] 작업 시작: uuid-assignment-001
[Execute] 기기: ABC123456789, 검색어: "OpenAI GPT-4"
[Execute] job.json 전송 완료
```

**✅ 통과 조건**: Worker가 작업을 감지하고 처리 시작

### 4.4 기기에서 job.json 확인

```bash
# job.json 파일 확인
adb -s $SERIAL shell cat /sdcard/job.json

# 예상 내용:
# {
#   "supabase_url": "https://...",
#   "supabase_key": "eyJ...",
#   "assignment_id": "uuid-assignment-001",
#   "keyword": "OpenAI GPT-4",
#   "video_title": "대화형 AI의 미래",
#   "duration_sec": 60,
#   "evidence_path": "/sdcard/evidence_uuid-assignment-001.png",
#   "done_flag_path": "/sdcard/done_uuid-assignment-001.flag"
# }
```

**✅ 통과 조건**: job.json 파일이 올바르게 생성됨

---

## 테스트 5: WebView Bot 수동 실행

### 5.1 봇 실행 (ADB broadcast)

```bash
# 봇 실행
adb -s $SERIAL shell am broadcast \
    -a org.autojs.autojs.action.startup \
    -e path /sdcard/Scripts/webview_bot.js

# 예상 출력:
# Broadcasting: Intent { act=org.autojs.autojs.action.startup (has extras) }
# Broadcast completed: result=0
```

**✅ 통과 조건**: broadcast 성공 (result=0)

### 5.2 봇 로그 확인 (logcat)

```bash
# 실시간 로그 확인
adb -s $SERIAL logcat | grep -i "Bot\|WebView\|Search"

# 예상 출력:
# [Bot] Starting WebView-based YouTube automation bot...
# [Bot] Job loaded: uuid-assignment-001
# [Bot] Keyword: OpenAI GPT-4
# [Bot] WebView initialized
# [Main] Loading YouTube mobile...
# [Search] Starting search for: OpenAI GPT-4
# [Search] Search executed
# [Watch] Starting video watch...
# [Main] Capturing evidence screenshot...
# [Main] Screenshot saved: /sdcard/evidence_uuid-assignment-001.png
# [Main] Creating completion flag...
# [Main] Calling complete-job-assignment...
# [Main] Job completed successfully
```

**✅ 통과 조건**: 전체 시나리오가 에러 없이 완료

### 5.3 증거 파일 확인

```bash
# 스크린샷 존재 확인
adb -s $SERIAL shell ls -l /sdcard/evidence_uuid-assignment-001.png

# Flag 파일 확인
adb -s $SERIAL shell cat /sdcard/done_uuid-assignment-001.flag

# 예상 출력: DONE
```

**✅ 통과 조건**: 두 파일 모두 생성됨

---

## 테스트 6: 전체 통합 플로우 (E2E)

### 6.1 Worker 재시작 (깨끗한 상태)

```bash
# Worker 종료 (Ctrl+C)
# Worker 재시작
cd client-pc
node worker-v5.1.js
```

### 6.2 새로운 Job 생성

```sql
-- Job + Assignment 생성 (한 번에)
WITH new_job AS (
    INSERT INTO jobs (title, keyword, video_title, script_type)
    VALUES ('[E2E] Claude AI 검색', 'Claude AI Anthropic', 'Claude 3.5 Sonnet', 'youtube_search')
    RETURNING id
)
INSERT INTO job_assignments (job_id, device_id, status)
SELECT
    new_job.id,
    d.id,
    'pending'
FROM new_job, devices d
WHERE d.serial_number = 'ABC123456789'
RETURNING id AS assignment_id;

-- assignment_id 확인
```

### 6.3 자동 실행 확인

Worker와 봇이 자동으로 전체 플로우를 처리하는지 확인:

**Worker 로그**:
```
[Poll] 작업 할당: uuid-assignment-002 → ABC123456789
[Execute] 작업 시작: uuid-assignment-002
[Execute] job.json 전송 완료
[Execute] WebView 봇 실행 완료
[Execute] 작업 완료 시그널 수신
[Execute] 증거 수집 완료: ./screenshots/proof_uuid-assignment-002.png
[Execute] 작업 완료: uuid-assignment-002
```

**봇 로그** (logcat):
```
[Bot] Job loaded: uuid-assignment-002
[Main] ========== Starting Job Execution ==========
[Main] ========== Job Execution Complete ==========
```

**✅ 통과 조건**: 전체 플로우가 자동으로 완료됨

### 6.4 최종 검증

```bash
# 로컬 증거 파일 확인
ls client-pc/screenshots/proof_uuid-assignment-002.png

# DB 상태 확인 (Supabase SQL)
SELECT
    ja.id,
    ja.status,
    ja.progress_pct,
    ja.completed_at,
    j.keyword
FROM job_assignments ja
JOIN jobs j ON ja.job_id = j.id
WHERE ja.id = 'uuid-assignment-002';

-- 예상 결과:
-- status: completed
-- progress_pct: 100
-- completed_at: (완료 시간)
```

**✅ 통과 조건**:
- Assignment 상태 = `completed`
- 스크린샷 파일 존재
- 기기 상태 = `idle` (다음 작업 대기 가능)

---

## 테스트 7: 에러 처리 검증

### 7.1 잘못된 keyword로 Job 생성

```sql
-- 존재하지 않을 검색어
INSERT INTO jobs (title, keyword, video_title, script_type)
VALUES ('[실패 테스트] 무작위 문자열', 'asdfqwerzxcv1234567890', 'N/A', 'youtube_search')
RETURNING id;

-- Assignment 생성
INSERT INTO job_assignments (job_id, device_id, status)
SELECT '...'::uuid, id, 'pending'
FROM devices WHERE serial_number = 'ABC123456789';
```

**예상 동작**:
- 봇이 검색 결과를 찾지 못함
- Flag 파일에 `ERROR: No search results found` 기록
- Worker가 타임아웃 또는 에러 처리

**✅ 통과 조건**: 에러가 로그에 기록되고 Worker가 계속 실행됨

### 7.2 AutoX.js 앱 종료 상태에서 Job 실행

```bash
# AutoX.js 앱 종료
adb -s $SERIAL shell am force-stop org.autojs.autojs

# Job 생성 (동일한 방식)
```

**예상 동작**:
- 봇 실행 실패
- Worker가 타임아웃 (120초)
- Assignment 상태 = `failed`

**✅ 통과 조건**: Worker가 크래시하지 않고 에러 처리

---

## 테스트 8: 성능 검증

### 8.1 다중 기기 테스트

```bash
# 여러 기기 연결
adb devices

# List of devices attached
# ABC123    device
# DEF456    device
# GHI789    device
```

**예상 동작**:
- 모든 기기가 devices 테이블에 등록
- 각 기기에 봇 파일 배포 (1회만, 해시 체크)
- 동시에 다른 작업 실행 가능

**✅ 통과 조건**: 3대 이상의 기기가 동시에 작업 처리

### 8.2 파일 배포 최적화 검증

```bash
# Worker 시작 (로그 확인)
node worker-v5.1.js

# 1차 배포
# [Deploy] ABC123: 배포 완료 (hash: 1a2b3c4d)

# Worker 재시작 (파일 변경 없음)
# [Sync] ABC123 -> uuid-device-001
# (배포 메시지 없음 = 스킵됨)

# 파일 수정 후 Worker 재시작
# [Deploy] ABC123: 배포 완료 (hash: 9z8y7x6w)
```

**✅ 통과 조건**: 파일 변경 시에만 재배포

---

## 문제 해결 (Troubleshooting)

### 문제 1: "claim_job 함수 없음"

**증상**:
```
[Poll Exception] function claim_job(text, uuid) does not exist
```

**해결**:
```bash
npx supabase db push supabase/migrations/20260129_claim_job_rpc.sql
```

### 문제 2: "봇 실행 실패"

**증상**:
```
[Execute] 봇 실행 실패: Broadcast completed: result=-1
```

**해결**:
1. AutoX.js 앱 실행 확인
2. 봇 파일 경로 확인: `/sdcard/Scripts/webview_bot.js`
3. 권한 확인: `adb shell ls -l /sdcard/Scripts/`

### 문제 3: "작업 타임아웃"

**증상**:
```
[Execute] 작업 타임아웃: uuid-assignment-001
```

**원인**:
- 봇이 flag 파일을 생성하지 못함
- AutoX.js 앱이 백그라운드에서 종료됨

**해결**:
```bash
# 봇 로그 확인
adb logcat | grep Bot

# Flag 파일 수동 생성 테스트
adb shell touch /sdcard/done_test.flag
adb shell ls /sdcard/done_test.flag
```

### 문제 4: "증거 수집 실패"

**증상**:
```
[Execute] 증거 수집 실패: No such file or directory
```

**해결**:
1. 봇 권한 확인: `WRITE_EXTERNAL_STORAGE`
2. 스크린샷 API 확인: `captureScreen()` 테스트
3. 경로 확인: `/sdcard/` 쓰기 가능 여부

---

## 성공 기준 (Pass Criteria)

전체 테스트를 통과하려면:

- [x] **테스트 1**: 인프라 검증 (3/3)
- [x] **테스트 2**: 봇 파일 배포 (2/2)
- [x] **테스트 3**: Worker 단독 실행 (2/2)
- [x] **테스트 4**: Job 생성 및 할당 (4/4)
- [x] **테스트 5**: 봇 수동 실행 (3/3)
- [x] **테스트 6**: E2E 통합 플로우 (4/4)
- [x] **테스트 7**: 에러 처리 (2/2)
- [x] **테스트 8**: 성능 검증 (2/2)

**총 22개 체크포인트 중 최소 20개 이상 통과 = 배포 가능**

---

## 다음 단계

테스트 통과 후:

1. **프로덕션 배포 준비** (DEPLOY-CHECKLIST.md 참조)
2. **모니터링 설정** (Sentry, Supabase Logs)
3. **자동화 스케일 테스트** (10대 이상 기기)

---

**작성일**: 2026-01-29
**버전**: Worker v5.1
**테스트 환경**: Windows 11 + Android 10+
