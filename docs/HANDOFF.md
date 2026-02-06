# HANDOFF: 디바이스 관리 시스템 변경 내역

이 문서는 2026-02-06 디바이스 관리 시스템 업데이트에 대한 핸드오프 문서입니다.

---

## 1. 개요

### 변경 목적
- 기존 `nodes` 테이블을 `pcs` 테이블로 변경하여 더 명확한 네이밍 적용
- PC-디바이스 관리번호 체계 도입 (예: PC01-001, PC01-002, PC02-001)
- 디바이스 추적 및 관리 효율성 향상

### 주요 변경 사항
1. **테이블 리네이밍**: `nodes` → `pcs`
2. **관리번호 자동생성**: `pc_number` (PC01, PC02...), `device_number`, `management_code` (PC01-001)
3. **새로운 API 엔드포인트**: PC 및 디바이스 관리를 위한 REST API

---

## 2. 데이터베이스 스키마 변경

### 마이그레이션 파일
- `infra/database/supabase/migrations/20260206_device_management_system.sql`

### pcs 테이블 (구 nodes)

```sql
-- 새로운 컬럼 추가
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS pc_number TEXT UNIQUE;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS hostname TEXT;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS max_devices INT DEFAULT 20;
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | PC 고유 ID |
| pc_number | TEXT UNIQUE | PC 번호 (PC01, PC02...) |
| label | TEXT | 사용자 지정 라벨 |
| location | TEXT | 물리적 위치 |
| hostname | TEXT | PC 호스트명 |
| ip_address | TEXT | IP 주소 |
| max_devices | INT | 최대 연결 디바이스 수 (기본: 20) |
| status | TEXT | 상태 (online/offline) |

### devices 테이블 변경

```sql
-- FK 변경: node_id → pc_id
ALTER TABLE devices RENAME COLUMN node_id TO pc_id;

-- 새로운 컬럼 추가
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_number INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS management_code TEXT UNIQUE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS connection_type TEXT CHECK (connection_type IN ('usb', 'wifi', 'adb_wifi'));
ALTER TABLE devices ADD COLUMN IF NOT EXISTS usb_port INT;
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | 디바이스 시리얼 번호 |
| pc_id | TEXT FK | 연결된 PC ID |
| device_number | INT | PC 내 디바이스 번호 (1, 2, 3...) |
| management_code | TEXT UNIQUE | 관리번호 (PC01-001) |
| connection_type | TEXT | 연결 방식 (usb/wifi/adb_wifi) |
| usb_port | INT | USB 포트 번호 |

### 자동 생성 함수

```sql
-- PC 번호 생성 (PC01, PC02...)
CREATE OR REPLACE FUNCTION generate_pc_number()
RETURNS TEXT AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(pc_number FROM 3) AS INT)), 0) + 1 
  INTO next_num
  FROM pcs 
  WHERE pc_number ~ '^PC[0-9]+$';
  
  RETURN 'PC' || LPAD(next_num::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql;

-- 디바이스 번호 생성 (해당 PC 내에서의 순번)
CREATE OR REPLACE FUNCTION generate_device_number(target_pc_id TEXT)
RETURNS INT AS $$
DECLARE
  next_num INT;
BEGIN
  IF target_pc_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT COALESCE(MAX(device_number), 0) + 1 
  INTO next_num
  FROM devices 
  WHERE pc_id = target_pc_id;
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;
```

### 트리거: management_code 자동 생성

```sql
CREATE OR REPLACE FUNCTION update_management_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pc_id IS NOT NULL AND NEW.device_number IS NOT NULL THEN
    SELECT pc_number || '-' || LPAD(NEW.device_number::TEXT, 3, '0')
    INTO NEW.management_code
    FROM pcs WHERE id = NEW.pc_id;
  ELSE
    NEW.management_code := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_management_code
BEFORE INSERT OR UPDATE ON devices
FOR EACH ROW
EXECUTE FUNCTION update_management_code();
```

---

## 3. API 변경사항

### 백엔드 (Express.js)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/pcs` | PC 목록 조회 |
| GET | `/api/pcs/summary` | PC별 디바이스 요약 |
| GET | `/api/pcs/:id` | PC 상세 조회 |
| POST | `/api/pcs` | PC 추가 |
| PATCH | `/api/pcs/:id` | PC 수정 |
| DELETE | `/api/pcs/:id` | PC 삭제 |
| GET | `/api/devices/by-code/:code` | 관리번호로 디바이스 조회 |
| GET | `/api/devices/by-serial/:serial` | 시리얼로 디바이스 조회 |
| GET | `/api/devices/unassigned` | 미배정 디바이스 목록 |
| POST | `/api/devices/register` | 디바이스 등록 |
| POST | `/api/devices/bulk-register` | 디바이스 일괄 등록 |
| POST | `/api/devices/:id/assign` | 디바이스 PC 배정 |
| POST | `/api/devices/:id/unassign` | 디바이스 PC 해제 |
| GET | `/api/devices/stats` | 디바이스 통계 |

### Next.js API Routes

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET/POST | `/api/pcs` | PC 목록/등록 |
| GET/PATCH/DELETE | `/api/pcs/[id]` | PC 상세/수정/삭제 |
| POST/DELETE | `/api/devices/[id]/assign` | 디바이스 배정/해제 |

---

## 4. 대시보드 UI 변경

### 파일: `apps/dashboard/src/app/dashboard/devices/page.tsx`

**변경 내용:**
- `nodes` → `pcs` 변수명 변경
- `nodeFilter` → `pcFilter` 변경
- "노드별 현황" → "PC별 현황" 레이블 변경
- `management_code` 필드 표시 추가
- 새로운 디바이스 상태 지원 (idle, running, disconnected)

---

## 5. 마이그레이션 적용 방법

### Supabase Dashboard에서 적용
```bash
# 마이그레이션 파일 위치
infra/database/supabase/migrations/20260206_device_management_system.sql
```

### CLI로 적용
```bash
supabase db push --include-all
```

### 수동 적용
1. Supabase Dashboard > SQL Editor
2. 마이그레이션 파일 내용 복사하여 실행

---

## 6. 롤백 절차

마이그레이션 실패 시:

```sql
-- 테이블명 복원
ALTER TABLE pcs RENAME TO nodes;

-- FK 컬럼명 복원
ALTER TABLE devices RENAME COLUMN pc_id TO node_id;
ALTER TABLE device_states RENAME COLUMN pc_id TO node_id;

-- 추가된 컬럼 제거 (선택적)
ALTER TABLE nodes DROP COLUMN IF EXISTS pc_number;
ALTER TABLE nodes DROP COLUMN IF EXISTS label;
ALTER TABLE nodes DROP COLUMN IF EXISTS location;
-- ...
```

---

## 7. 테스트 체크리스트

- [ ] PC 등록 시 `pc_number` 자동 생성 확인
- [ ] 디바이스 배정 시 `device_number` 자동 생성 확인
- [ ] `management_code` 트리거 동작 확인 (PC01-001 형식)
- [ ] PC 삭제 시 연결된 디바이스 있으면 차단 확인
- [ ] 대시보드 PC별 현황 표시 확인
- [ ] 관리번호로 디바이스 검색 가능 확인

---

## 8. 관련 파일

- `infra/database/supabase/migrations/20260206_device_management_system.sql`
- `apps/backend/src/server.ts` (PCs/Devices API 추가)
- `apps/dashboard/src/app/api/pcs/route.ts`
- `apps/dashboard/src/app/api/pcs/[id]/route.ts`
- `apps/dashboard/src/app/api/devices/[id]/assign/route.ts`
- `apps/dashboard/src/app/dashboard/devices/page.tsx`

---

**작성일**: 2026-02-06  
**작성자**: AI Assistant
