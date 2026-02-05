# 롤백 절차 (Rollback Procedures)

## 개요

프로덕션 배포 실패 시 시스템을 이전 상태로 복구하기 위한 절차입니다.

---

## 1. Dashboard (Vercel)

### 자동 롤백

```bash
# Vercel CLI 사용
vercel rollback

# 특정 배포로 롤백
vercel rollback [deployment-id]
```

### 수동 롤백

1. Vercel Dashboard 접속
2. 해당 프로젝트 선택
3. Deployments 탭에서 이전 배포 선택
4. "Promote to Production" 클릭

### 롤백 확인

```bash
# 배포 상태 확인
curl -I https://dashboard.doai.me/api/health
```

---

## 2. Backend API (Vultr VPS)

### PM2 롤백

```bash
# SSH 접속
ssh root@YOUR_VULTR_IP

# 이전 버전으로 롤백
cd /var/www/doai-backend
git log --oneline -5  # 이전 커밋 확인
git checkout [previous-commit-hash]

# 의존성 재설치 및 재시작
npm ci --production
pm2 restart all
```

### Docker 롤백 (Docker 사용 시)

```bash
# 이전 이미지로 롤백
docker-compose down
docker tag doai-backend:current doai-backend:rollback
docker pull doai-backend:previous
docker tag doai-backend:previous doai-backend:current
docker-compose up -d
```

### 롤백 확인

```bash
# API 상태 확인
curl http://localhost:3001/api/health

# PM2 상태 확인
pm2 status
pm2 logs --lines 50
```

---

## 3. Supabase Database

### 마이그레이션 롤백

> ⚠️ **주의**: 데이터베이스 롤백은 데이터 손실을 유발할 수 있습니다.

```bash
# 마이그레이션 상태 확인
supabase db reset --dry-run

# 특정 버전으로 롤백 (주의: 데이터 손실 가능)
supabase migration repair --status reverted [migration_name]
```

### 수동 롤백 SQL

```sql
-- 테이블 삭제 (데이터 포함)
DROP TABLE IF EXISTS system_logs CASCADE;
DROP TABLE IF EXISTS device_issues CASCADE;

-- 또는 데이터만 삭제
TRUNCATE TABLE system_logs;
TRUNCATE TABLE device_issues;
```

### 데이터 복구

```bash
# 백업에서 복구 (Supabase Dashboard 또는 pg_restore)
pg_restore -h YOUR_SUPABASE_HOST -U postgres -d postgres backup.dump
```

---

## 4. Desktop Agent

### 수동 롤백

```powershell
# Windows에서
cd C:\Users\[user]\AppData\Local\DoAi-Desktop-Agent

# 이전 버전 복원
# (자동 업데이트 전 백업이 있는 경우)
Rename-Item "app-current" "app-failed"
Rename-Item "app-backup" "app-current"
```

### 재설치

1. 기존 버전 제거
2. 이전 버전 설치 파일로 재설치
3. 설정 파일 복원 (`config.json`)

---

## 5. 전체 시스템 롤백 체크리스트

### 롤백 전

- [ ] 현재 상태 스냅샷 저장
- [ ] 에러 로그 수집
- [ ] 영향 범위 파악

### 롤백 중

- [ ] 서비스 중단 알림 (필요시)
- [ ] 순차적 롤백 (Agent → Backend → Database → Dashboard)
- [ ] 각 단계별 확인

### 롤백 후

- [ ] 전체 시스템 헬스체크
- [ ] 모니터링 지표 확인
- [ ] 사용자 테스트
- [ ] 원인 분석 및 문서화

---

## 6. 긴급 연락처

| 역할 | 담당 | 연락처 |
|------|------|--------|
| 인프라 | TBD | - |
| 백엔드 | TBD | - |
| 프론트엔드 | TBD | - |

---

## 7. 롤백 시나리오별 대응

### 시나리오 A: API 응답 오류

1. PM2 로그 확인
2. 환경 변수 점검
3. 이전 커밋으로 롤백

### 시나리오 B: 데이터베이스 마이그레이션 실패

1. 마이그레이션 상태 확인
2. 롤백 SQL 실행
3. 데이터 무결성 검증

### 시나리오 C: Desktop Agent 연결 불가

1. Socket.IO 서버 상태 확인
2. 방화벽 설정 점검
3. Agent 재설치 (최후 수단)

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|-----------|
| 2026-02-04 | 1.0 | 초기 작성 |
