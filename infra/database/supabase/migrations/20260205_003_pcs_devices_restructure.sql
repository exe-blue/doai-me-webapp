-- =============================================
-- Migration: PCs 테이블 추가 및 Devices 구조 개선
-- Date: 2026-02-05
-- Description: 
--   - pcs 테이블 신규 생성 (미니PC 관리)
--   - devices 테이블 pc_id를 UUID FK로 변경
--   - management_code를 트리거로 계산 (GENERATED 컬럼 제약 회피)
-- =============================================

-- ============================================
-- 1. device_status ENUM 타입 생성
-- ============================================
DO $$ BEGIN
    CREATE TYPE device_status AS ENUM (
        'IDLE',       -- 대기 중
        'RUNNING',    -- 작업 실행 중
        'BUSY',       -- 다른 작업으로 바쁨
        'OFFLINE',    -- 연결 끊김
        'ERROR',      -- 에러 상태
        'QUARANTINE'  -- 격리 (3회 이상 에러)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE pc_status AS ENUM (
        'ONLINE',
        'OFFLINE',
        'ERROR'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. PCs 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS pcs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 관리번호: PC01~PC99 (서버 자동할당)
    pc_number VARCHAR(4) UNIQUE NOT NULL,
    
    -- 식별자
    ip_address INET UNIQUE,
    hostname VARCHAR(100),
    
    -- 메타데이터
    label VARCHAR(100),
    location VARCHAR(100),
    
    -- 용량
    max_devices INT DEFAULT 20,
    
    -- 상태
    status pc_status DEFAULT 'OFFLINE',
    last_heartbeat TIMESTAMPTZ,
    
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PC번호 자동생성 함수
CREATE OR REPLACE FUNCTION generate_pc_number()
RETURNS VARCHAR(4) AS $$
DECLARE
    next_num INT;
    new_pc_number VARCHAR(4);
BEGIN
    -- 현재 사용 중인 번호 중 빈 번호 찾기 (1-99)
    SELECT COALESCE(
        (SELECT MIN(n) FROM generate_series(1, 99) n 
         WHERE NOT EXISTS (
             SELECT 1 FROM pcs WHERE pc_number = 'PC' || LPAD(n::TEXT, 2, '0')
         )),
        1
    ) INTO next_num;
    
    IF next_num > 99 THEN
        RAISE EXCEPTION 'PC 번호가 모두 사용됨 (최대 99개)';
    END IF;
    
    new_pc_number := 'PC' || LPAD(next_num::TEXT, 2, '0');
    RETURN new_pc_number;
END;
$$ LANGUAGE plpgsql;

-- PC 삽입 시 자동 번호 할당 트리거
CREATE OR REPLACE FUNCTION auto_assign_pc_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pc_number IS NULL OR NEW.pc_number = '' THEN
        NEW.pc_number := generate_pc_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_pc_number ON pcs;
CREATE TRIGGER trg_auto_pc_number
    BEFORE INSERT ON pcs
    FOR EACH ROW EXECUTE FUNCTION auto_assign_pc_number();

-- ============================================
-- 3. Devices 테이블에 새 컬럼 추가 (기존 호환)
-- ============================================

-- 새 컬럼 추가 (기존 테이블 유지)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pc_uuid UUID REFERENCES pcs(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_number INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS management_code VARCHAR(10);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS connection_type VARCHAR(10) DEFAULT 'usb';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS usb_port INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS model VARCHAR(50) DEFAULT 'Galaxy S9';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS android_version VARCHAR(20);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS error_count INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

-- 제약조건 추가
ALTER TABLE devices DROP CONSTRAINT IF EXISTS device_number_range;
ALTER TABLE devices ADD CONSTRAINT device_number_range 
    CHECK (device_number IS NULL OR device_number BETWEEN 1 AND 999);

ALTER TABLE devices DROP CONSTRAINT IF EXISTS battery_level_range;
ALTER TABLE devices ADD CONSTRAINT battery_level_range 
    CHECK (battery_level IS NULL OR battery_level BETWEEN 0 AND 100);

-- ============================================
-- 4. management_code 계산 트리거
-- ============================================
CREATE OR REPLACE FUNCTION compute_management_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pc_uuid IS NOT NULL AND NEW.device_number IS NOT NULL THEN
        SELECT pc_number || '-' || LPAD(NEW.device_number::TEXT, 3, '0')
        INTO NEW.management_code
        FROM pcs WHERE id = NEW.pc_uuid;
    ELSIF NEW.device_number IS NOT NULL THEN
        NEW.management_code := 'XX-' || LPAD(NEW.device_number::TEXT, 3, '0');
    ELSE
        NEW.management_code := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_management_code ON devices;
CREATE TRIGGER trg_compute_management_code
    BEFORE INSERT OR UPDATE OF pc_uuid, device_number ON devices
    FOR EACH ROW EXECUTE FUNCTION compute_management_code();

-- ============================================
-- 5. 디바이스 번호 자동 생성 함수
-- ============================================
CREATE OR REPLACE FUNCTION generate_device_number(target_pc_uuid UUID)
RETURNS INT AS $$
DECLARE
    next_num INT;
BEGIN
    -- NULL PC인 경우 (미배정)
    IF target_pc_uuid IS NULL THEN
        SELECT COALESCE(
            (SELECT MIN(n) FROM generate_series(1, 999) n 
             WHERE NOT EXISTS (
                 SELECT 1 FROM devices 
                 WHERE pc_uuid IS NULL AND device_number = n
             )),
            1
        ) INTO next_num;
    ELSE
        -- 특정 PC 내에서 빈 번호 찾기
        SELECT COALESCE(
            (SELECT MIN(n) FROM generate_series(1, 999) n 
             WHERE NOT EXISTS (
                 SELECT 1 FROM devices 
                 WHERE pc_uuid = target_pc_uuid AND device_number = n
             )),
            1
        ) INTO next_num;
    END IF;
    
    IF next_num > 999 THEN
        RAISE EXCEPTION '디바이스 번호가 모두 사용됨 (최대 999개)';
    END IF;
    
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. 뷰: 관리번호 기준 전체 현황
-- ============================================
CREATE OR REPLACE VIEW device_overview AS
SELECT 
    d.id,
    d.management_code,
    p.pc_number,
    d.device_number,
    COALESCE(d.serial_number, 'N/A') as serial,
    COALESCE(d.ip_address::TEXT, 'N/A') as ip,
    d.connection_type,
    d.status as device_status,
    p.status as pc_status,
    d.battery_level,
    d.last_seen_at as last_heartbeat,
    d.error_count,
    d.model,
    d.android_version
FROM devices d
LEFT JOIN pcs p ON d.pc_uuid = p.id
ORDER BY p.pc_number NULLS LAST, d.device_number;

-- ============================================
-- 7. 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_devices_pc_uuid ON devices(pc_uuid);
CREATE INDEX IF NOT EXISTS idx_devices_device_number ON devices(device_number);
CREATE INDEX IF NOT EXISTS idx_devices_management_code ON devices(management_code);
CREATE INDEX IF NOT EXISTS idx_devices_ip_address ON devices(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcs_status ON pcs(status);
CREATE INDEX IF NOT EXISTS idx_pcs_pc_number ON pcs(pc_number);

-- ============================================
-- 8. updated_at 트리거
-- ============================================
DROP TRIGGER IF EXISTS pcs_updated_at ON pcs;
CREATE TRIGGER pcs_updated_at
    BEFORE UPDATE ON pcs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 9. RLS 정책
-- ============================================
ALTER TABLE pcs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for pcs" ON pcs;
CREATE POLICY "Allow all for pcs" ON pcs FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 10. Realtime 활성화
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS pcs;

-- ============================================
-- 11. 마이그레이션 헬퍼: 기존 pc_id TEXT → pc_uuid UUID 변환
-- ============================================
-- 기존 데이터 마이그레이션은 별도 스크립트로 실행
-- 예: UPDATE devices SET pc_uuid = (SELECT id FROM pcs WHERE pc_number = devices.pc_id) WHERE pc_id IS NOT NULL;

COMMENT ON TABLE pcs IS '미니PC 관리 테이블 - 최대 99대';
COMMENT ON TABLE devices IS '디바이스 관리 테이블 - PC당 최대 999대';
COMMENT ON COLUMN devices.management_code IS '관리번호 (PC01-001 형태) - 트리거로 자동 계산';
COMMENT ON COLUMN devices.pc_uuid IS '연결된 PC UUID (pcs 테이블 FK)';
