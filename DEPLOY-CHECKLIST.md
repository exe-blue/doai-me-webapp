# Worker v5.1 프로덕션 배포 체크리스트

## 개요

이 문서는 Worker v5.1을 프로덕션 환경에 배포하기 전 확인해야 할 모든 사항을 정리합니다.

**배포 대상**:
- Worker v5.1 (PC Client)
- WebView Bot (AutoX.js)
- Supabase Schema 업데이트

---

## Phase 1: 사전 준비 (Pre-Deployment)

### 1.1 통합 테스트 완료 확인

```bash
# INTEGRATION-TEST.md의 모든 테스트 통과 확인
# 체크포인트: 22개 중 최소 20개 이상 통과
```

- [ ] 테스트 1: 인프라 검증 (3/3) ✅
- [ ] 테스트 2: 봇 파일 배포 (2/2) ✅
- [ ] 테스트 3: Worker 단독 실행 (2/2) ✅
- [ ] 테스트 4: Job 생성 및 할당 (4/4) ✅
- [ ] 테스트 5: 봇 수동 실행 (3/3) ✅
- [ ] 테스트 6: E2E 통합 플로우 (4/4) ✅
- [ ] 테스트 7: 에러 처리 (2/2) ✅
- [ ] 테스트 8: 성능 검증 (2/2) ✅

**✅ 통과 조건**: 최소 20/22 체크포인트 통과

### 1.2 환경 변수 검증

#### 개발 환경 (.env.development)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://dev-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
ADB_PATH=/usr/local/bin/adb
PC_ID=PC-DEV-01
```

#### 프로덕션 환경 (.env.production)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://prod-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
ADB_PATH=/usr/local/bin/adb
PC_ID=PC-PROD-01
```

**체크리스트**:
- [ ] `.env.production` 파일 생성 완료
- [ ] 프로덕션 Supabase URL 정확
- [ ] 프로덕션 Service Role Key 정확 (Dashboard에서 복사)
- [ ] PC_ID가 프로덕션 고유값으로 설정됨
- [ ] `.gitignore`에 `.env*` 포함 확인 (보안)

### 1.3 Supabase 프로덕션 환경 설정

#### 마이그레이션 적용

```bash
# 프로덕션 Supabase 프로젝트 선택
npx supabase link --project-ref prod-project-ref

# 마이그레이션 적용
npx supabase db push supabase/migrations/20260129_claim_job_rpc.sql
npx supabase db push supabase/migrations/20260129_add_job_search_fields.sql
npx supabase db push supabase/migrations/production_rls_policies.sql

# 적용 확인
npx supabase db remote status
```

**체크리스트**:
- [ ] `claim_job` RPC 함수 존재 확인
- [ ] `jobs.keyword`, `jobs.video_title` 컬럼 존재
- [ ] RLS 정책 활성화 확인 (production_rls_policies.sql)

#### RLS 정책 검증

```sql
-- devices 테이블 RLS 확인
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'devices';

-- 예상 출력:
-- Anyone can view devices (SELECT)
-- Service role can manage devices (ALL)
```

**체크리스트**:
- [ ] `anon` 역할: SELECT만 가능
- [ ] `service_role`: 모든 권한
- [ ] `authenticated` 역할: INSERT/UPDATE 불가

### 1.4 API Rate Limiting 설정

Supabase Dashboard > Settings > API:

**권장 설정**:
- Anonymous requests: **100 requests/minute**
- Authenticated requests: **1000 requests/minute**
- Service role requests: **Unlimited**

**체크리스트**:
- [ ] Rate limit 설정 완료
- [ ] Realtime 최대 연결: 100개
- [ ] 채널당 최대 이벤트: 100/sec

---

## Phase 2: 코드 배포

### 2.1 Worker v5.1 배포

#### 파일 체크

```bash
cd client-pc

# 필수 파일 확인
ls worker-v5.1.js        # ✅
ls config.json           # ✅
ls package.json          # ✅
ls -d screenshots        # ✅
```

**체크리스트**:
- [ ] `worker-v5.1.js` 존재
- [ ] `config.json` 프로덕션 설정 확인
- [ ] `screenshots/` 디렉토리 존재 (자동 생성되지만 미리 생성 권장)

#### config.json 검증

```json
{
  "pc_id": "PC-PROD-01",
  "groups": {
    "default": "P1-G1",
    "mappings": {
      "ABC123": "P1-G1",
      "DEF456": "P1-G2"
    }
  },
  "scan_interval_ms": 5000
}
```

**체크리스트**:
- [ ] `pc_id`가 프로덕션 고유값
- [ ] `mappings`에 모든 기기 시리얼 포함
- [ ] `scan_interval_ms` 적절 (권장: 5000)

#### 의존성 설치

```bash
cd client-pc
npm install

# 확인
npm list @supabase/supabase-js
npm list dotenv
```

**체크리스트**:
- [ ] `@supabase/supabase-js` 설치 확인
- [ ] `dotenv` 설치 확인
- [ ] `node_modules/` 정상 생성

### 2.2 WebView Bot 배포

#### 파일 체크

```bash
cd client-mobile

# 필수 파일 확인
ls bot-webview-autojs.js     # ✅ (AutoX.js 호환 버전)
ls selectors.json             # ✅
ls config.json                # ✅
ls modules/webview-setup.js   # ✅
ls modules/dom-control.js     # ✅
ls modules/search-flow.js     # ✅
```

**체크리스트**:
- [ ] `bot-webview-autojs.js` 존재 (require() 제거 버전)
- [ ] `selectors.json` 최신 YouTube DOM 구조 반영
- [ ] `config.json` 프로덕션 Supabase 설정

#### config.json 검증 (client-mobile)

```json
{
  "supabase": {
    "url": "https://prod-project.supabase.co",
    "anon_key": "eyJhbGc..."
  },
  "device": {
    "group_id": "P1-G1"
  }
}
```

**⚠️ 중요**: `anon_key` 사용 (service_role 아님!)

**체크리스트**:
- [ ] Supabase URL 프로덕션 환경
- [ ] `anon_key` 사용 (클라이언트 안전)
- [ ] `service_role_key` **절대 포함하지 않음**

#### 기기 배포

```bash
# 모든 기기에 배포
for SERIAL in ABC123 DEF456 GHI789; do
    echo "Deploying to $SERIAL..."

    adb -s $SERIAL shell mkdir -p /sdcard/Scripts/modules

    adb -s $SERIAL push bot-webview-autojs.js /sdcard/Scripts/webview_bot.js
    adb -s $SERIAL push config.json /sdcard/Scripts/config.json
    adb -s $SERIAL push selectors.json /sdcard/Scripts/selectors.json
    adb -s $SERIAL push modules/webview-setup.js /sdcard/Scripts/modules/webview-setup.js
    adb -s $SERIAL push modules/dom-control.js /sdcard/Scripts/modules/dom-control.js
    adb -s $SERIAL push modules/search-flow.js /sdcard/Scripts/modules/search-flow.js

    echo "$SERIAL deployment complete"
done
```

**체크리스트**:
- [ ] 모든 기기에 파일 배포 완료
- [ ] 파일 권한 확인: `adb shell ls -l /sdcard/Scripts/`
- [ ] AutoX.js 앱 설치 확인

---

## Phase 3: 서비스 시작

### 3.1 Worker 시작 (PM2 권장)

#### PM2 설치 및 설정

```bash
# PM2 설치 (전역)
npm install -g pm2

# Worker 시작
cd client-pc
pm2 start worker-v5.1.js --name "worker-v5.1" --env production

# 자동 재시작 설정
pm2 startup
pm2 save

# 로그 확인
pm2 logs worker-v5.1
```

**체크리스트**:
- [ ] PM2로 Worker 시작 완료
- [ ] 부팅 시 자동 시작 설정 완료
- [ ] 로그 정상 출력 확인

#### 대안: systemd (Linux)

```bash
# /etc/systemd/system/worker-v5.1.service
[Unit]
Description=Worker v5.1
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/doai-me-webapp/client-pc
ExecStart=/usr/bin/node worker-v5.1.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# 서비스 시작
sudo systemctl enable worker-v5.1
sudo systemctl start worker-v5.1
sudo systemctl status worker-v5.1
```

**체크리스트**:
- [ ] systemd 서비스 등록 완료
- [ ] 자동 재시작 설정 확인
- [ ] 로그 확인: `journalctl -u worker-v5.1 -f`

### 3.2 초기 상태 확인

```bash
# 1. 기기 등록 확인
pm2 logs worker-v5.1 --lines 50 | grep Sync

# 예상 출력:
# [Sync] ABC123 -> uuid-device-001
# [Sync] DEF456 -> uuid-device-002

# 2. DB 확인 (Supabase SQL)
SELECT serial_number, status, last_seen_at
FROM devices
WHERE pc_id = 'PC-PROD-01';
```

**체크리스트**:
- [ ] 모든 기기가 `idle` 상태로 등록됨
- [ ] `last_seen_at`이 최근 시간
- [ ] 봇 파일 배포 완료 로그 확인

---

## Phase 4: 모니터링 설정

### 4.1 Sentry 통합 (선택사항)

```bash
# Sentry SDK 설치
cd client-pc
npm install @sentry/node

# worker-v5.1.js 상단에 추가
const Sentry = require("@sentry/node");
Sentry.init({
  dsn: "https://xxx@xxx.ingest.sentry.io/xxx",
  environment: "production"
});
```

**체크리스트**:
- [ ] Sentry 프로젝트 생성
- [ ] DSN 설정 완료
- [ ] 에러 리포팅 테스트 완료

### 4.2 Supabase Logs 모니터링

Supabase Dashboard > Logs:

**필수 로그**:
- [x] API Logs: Edge Function 호출 확인
- [x] Database Logs: claim_job RPC 호출 확인
- [x] Realtime Logs: 연결 상태 확인 (사용 시)

**체크리스트**:
- [ ] API 로그에서 `complete-job-assignment` 호출 확인
- [ ] 에러 로그 없음 확인
- [ ] RPC 실행 로그 정상

### 4.3 커스텀 대시보드 설정

```sql
-- 실시간 작업 현황 뷰
CREATE OR REPLACE VIEW v_job_status AS
SELECT
    d.serial_number,
    d.status AS device_status,
    ja.status AS job_status,
    j.keyword,
    ja.progress_pct,
    ja.started_at,
    EXTRACT(EPOCH FROM (NOW() - ja.started_at)) AS elapsed_sec
FROM job_assignments ja
JOIN jobs j ON ja.job_id = j.id
JOIN devices d ON ja.device_id = d.id
WHERE ja.status IN ('pending', 'running')
ORDER BY ja.created_at;

-- 사용법
SELECT * FROM v_job_status;
```

**체크리스트**:
- [ ] 대시보드 뷰 생성 완료
- [ ] Dashboard UI에서 실시간 모니터링 가능

---

## Phase 5: 성능 튜닝

### 5.1 Worker 설정 최적화

```json
// config.json
{
  "pc_id": "PC-PROD-01",
  "groups": {
    "default": "P1-G1",
    "mappings": { /* ... */ }
  },
  "scan_interval_ms": 5000,      // 기기 스캔 간격 (권장: 5초)
  "poll_interval_ms": 3000,      // 작업 폴링 간격 (권장: 3초)
  "max_concurrent_jobs": 20      // 최대 동시 작업 (기기 수)
}
```

**체크리스트**:
- [ ] `scan_interval_ms` 조정 (너무 짧으면 ADB 부하)
- [ ] `poll_interval_ms` 조정 (너무 짧으면 DB 부하)
- [ ] `max_concurrent_jobs` 설정 (기기 수와 일치)

### 5.2 Supabase Connection Pooling

Supabase Dashboard > Settings > Database:

**권장 설정**:
- Connection pooler: **Enabled**
- Pool mode: **Transaction**
- Max client connections: **100**

**체크리스트**:
- [ ] Connection pooling 활성화
- [ ] Pool mode 설정 확인
- [ ] Worker에서 연결 재사용 확인

### 5.3 ADB 성능 최적화

```bash
# ADB 서버 재시작 (가끔 느려질 때)
adb kill-server
adb start-server

# USB 디버깅 속도 향상 (기기별 설정)
# Settings > Developer Options > USB debugging (Security settings) OFF
```

**체크리스트**:
- [ ] ADB 서버 정상 실행
- [ ] USB 케이블 품질 확인 (USB 3.0 권장)
- [ ] USB 허브 사용 시 전원 충분 확인

---

## Phase 6: 백업 및 복구 계획

### 6.1 데이터베이스 백업

```bash
# Supabase 자동 백업 확인
# Dashboard > Settings > Backups

# 수동 백업 (SQL dump)
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup_$(date +%Y%m%d).sql
```

**체크리스트**:
- [ ] 일일 자동 백업 활성화 (Supabase Pro 이상)
- [ ] 수동 백업 스크립트 작성
- [ ] 백업 복원 테스트 완료

### 6.2 Worker 재시작 시나리오

```bash
# Worker 재시작
pm2 restart worker-v5.1

# 기기 재연결 확인
pm2 logs worker-v5.1 --lines 20 | grep Sync

# 진행 중이던 작업 복구
# (DB에서 running 상태인 assignment를 pending으로 변경)
UPDATE job_assignments
SET status = 'pending', started_at = NULL
WHERE status = 'running' AND pc_id = 'PC-PROD-01';
```

**체크리스트**:
- [ ] Worker 재시작 절차 문서화
- [ ] 진행 중 작업 복구 스크립트 준비
- [ ] 재시작 후 정상 동작 확인

### 6.3 재해 복구 계획

**시나리오 1: PC 고장**
1. 새로운 PC 준비
2. `.env` 파일 복원
3. `config.json` 복원 (PC_ID 동일하게)
4. Worker 재시작
5. 기기 재연결 확인

**시나리오 2: Supabase 장애**
1. Supabase 상태 확인: status.supabase.com
2. 백업에서 복원 (필요 시)
3. Worker 재시작 (자동 재연결)

**체크리스트**:
- [ ] 재해 복구 매뉴얼 작성 완료
- [ ] 백업 파일 안전한 위치에 보관
- [ ] 복구 훈련 1회 이상 실시

---

## Phase 7: 보안 검토

### 7.1 환경 변수 보안

```bash
# .env 파일 권한 확인
chmod 600 .env

# Git에 커밋되지 않았는지 확인
git status | grep .env

# 예상 출력: (없음)
```

**체크리스트**:
- [ ] `.env` 파일 권한 600 (소유자만 읽기/쓰기)
- [ ] `.gitignore`에 `.env*` 포함 확인
- [ ] GitHub/GitLab에 `.env` 파일 없음 확인

### 7.2 Supabase 키 관리

**Service Role Key**:
- ✅ 서버 사이드 전용 (Worker, Edge Function)
- ❌ 클라이언트에 절대 노출 금지
- ✅ 환경 변수로만 관리

**Anon Key**:
- ✅ 클라이언트 사용 가능 (WebView Bot)
- ✅ RLS 정책으로 보호
- ❌ 민감한 작업에 사용 금지

**체크리스트**:
- [ ] Worker에서 Service Role Key 사용 확인
- [ ] 봇에서 Anon Key 사용 확인
- [ ] Service Role Key가 코드에 하드코딩되지 않음

### 7.3 ADB 보안

```bash
# ADB 인증 확인
adb devices

# List of devices attached
# ABC123    device  # ✅ 인증됨
# DEF456    unauthorized  # ❌ 인증 필요

# 인증되지 않은 기기 처리
adb -s DEF456 shell
# (기기에서 RSA 키 승인 팝업 확인)
```

**체크리스트**:
- [ ] 모든 기기 ADB 인증 완료
- [ ] 기기에 화면 잠금 설정 (보안)
- [ ] USB 디버깅 비밀번호 설정 (Android 11+)

---

## Phase 8: 최종 체크리스트

### 8.1 기능 검증

- [ ] Worker가 기기를 감지하고 등록함
- [ ] Job 생성 시 자동으로 할당됨
- [ ] WebView 봇이 검색/시청 시나리오를 완료함
- [ ] 증거 스크린샷이 수집됨
- [ ] Assignment가 `completed` 상태로 업데이트됨
- [ ] 기기 상태가 `idle`로 복구됨

### 8.2 성능 검증

- [ ] 파일 배포가 해시 기반으로 최적화됨 (중복 방지)
- [ ] claim_job RPC가 race condition 없이 작동함
- [ ] 10대 이상의 기기가 동시에 작업 처리 가능
- [ ] Worker가 24시간 이상 안정적으로 실행됨

### 8.3 보안 검증

- [ ] RLS 정책이 올바르게 적용됨
- [ ] Service Role Key가 서버 사이드에서만 사용됨
- [ ] Anon Key가 클라이언트에서 안전하게 사용됨
- [ ] `.env` 파일이 Git에 커밋되지 않음

### 8.4 모니터링 검증

- [ ] PM2 또는 systemd로 자동 재시작 설정됨
- [ ] 로그가 정상적으로 수집됨
- [ ] Sentry 에러 리포팅 작동함 (선택사항)
- [ ] Supabase Dashboard에서 실시간 모니터링 가능

---

## 배포 승인

모든 체크리스트를 완료한 후 아래 서명:

**배포 담당자**: ____________________
**배포 일시**: 2026-__-__ __:__
**배포 환경**: Production
**Worker 버전**: v5.1
**봇 버전**: AutoX.js 호환

**승인**: ✅ / ❌

---

## 배포 후 모니터링 (7일)

### Day 1-3: 집중 모니터링

- [ ] 매 1시간마다 로그 확인
- [ ] 작업 성공률 90% 이상 확인
- [ ] 에러 로그 즉시 대응

### Day 4-7: 정기 모니터링

- [ ] 매 6시간마다 로그 확인
- [ ] 성능 메트릭 수집 (평균 처리 시간, 성공률)
- [ ] 이슈 발생 시 롤백 준비

### 성공 기준

- **작업 성공률**: 95% 이상
- **평균 처리 시간**: 120초 이하
- **Worker 가동률**: 99% 이상
- **Critical 에러**: 0건

---

**배포 완료 후 이 문서 보관**: `docs/deployment/worker-v5.1-YYYY-MM-DD.md`

**다음 배포**: Worker v5.2 (예정)
