-- ============================================
-- Migration: 001_device_management
-- Description: PC 및 디바이스 관리 테이블
-- 관리번호 체계: PC01~PC99, 디바이스 001~999
-- 최종 형식: PC**-*** (예: PC01-001)
-- ============================================

-- ============================================
-- PCs 테이블 (미니PC 15대 관리)
-- ============================================
CREATE TABLE IF NOT EXISTS pcs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 관리번호: PC01~PC99 (서버 자동할당)
    pc_number VARCHAR(4) UNIQUE NOT NULL,  -- 'PC01', 'PC02', ...
    
    -- 식별자 (IP 또는 다른 식별자)
    ip_address INET UNIQUE,
    hostname VARCHAR(100),
    
    -- 메타데이터
    label VARCHAR(100),  -- 사용자 지정 별명
    location VARCHAR(100),  -- 물리적 위치 (예: '서버실 A-1')
    
    -- 용량
    max_devices INT DEFAULT 20,  -- 최대 연결 가능 디바이스 수
    
    -- 상태
    status VARCHAR(20) DEFAULT 'offline',  -- online, offline, error
    last_heartbeat TIMESTAMPTZ,
    
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 제약조건
    CONSTRAINT pc_number_format CHECK (pc_number ~ '^PC[0-9]{2}$'),
    CONSTRAINT status_valid CHECK (status IN ('online', 'offline', 'error'))
);

-- PC번호 자동생성 함수
CREATE OR REPLACE FUNCTION generate_pc_number()
RETURNS VARCHAR(4) AS $$
DECLARE
    next_num INT;
    new_pc_number VARCHAR(4);
BEGIN
    -- 현재 최대 번호 + 1 찾기 (빈 번호 채우기 로직)
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

-- ============================================
-- Devices 테이블 (Galaxy S9 300대 관리)
-- ============================================
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- PC 연결 (NULL 가능 = 미배정 상태)
    pc_id UUID REFERENCES pcs(id) ON DELETE SET NULL,
    
    -- 관리번호
    device_number INT NOT NULL,  -- 1~999 (PC 내 순번)
    
    -- 식별자 (IP 또는 시리얼 - 둘 다 가능, 최소 하나 필수)
    serial_number VARCHAR(50),  -- ADB serial (예: 'R58M41XXXXX')
    ip_address INET,             -- WiFi ADB IP (예: '192.168.1.100')
    
    -- 디바이스 정보
    model VARCHAR(50) DEFAULT 'Galaxy S9',
    android_version VARCHAR(20),
    
    -- 연결 방식
    connection_type VARCHAR(10) DEFAULT 'usb',  -- 'usb', 'wifi', 'both'
    usb_port INT,  -- USB 허브 포트 번호 (1~20)
    
    -- 상태
    status VARCHAR(20) DEFAULT 'offline',  -- online, offline, busy, error
    battery_level INT,
    last_heartbeat TIMESTAMPTZ,
    last_task_at TIMESTAMPTZ,
    
    -- 에러 추적
    error_count INT DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 제약조건
    CONSTRAINT device_number_range CHECK (device_number BETWEEN 1 AND 999),
    CONSTRAINT identifier_required CHECK (serial_number IS NOT NULL OR ip_address IS NOT NULL),
    CONSTRAINT connection_type_valid CHECK (connection_type IN ('usb', 'wifi', 'both')),
    CONSTRAINT status_valid CHECK (status IN ('online', 'offline', 'busy', 'error')),
    CONSTRAINT battery_range CHECK (battery_level IS NULL OR (battery_level BETWEEN 0 AND 100))
);

-- Unique 제약조건 (별도 생성 - partial unique 지원)
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_serial_unique 
    ON devices(serial_number) WHERE serial_number IS NOT NULL;
    
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_ip_unique 
    ON devices(ip_address) WHERE ip_address IS NOT NULL;
    
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_pc_number_unique 
    ON devices(pc_id, device_number) WHERE pc_id IS NOT NULL;

-- ============================================
-- 관리번호 생성 함수 (PC**-*** 형식)
-- ============================================
CREATE OR REPLACE FUNCTION get_management_code(p_pc_id UUID, p_device_number INT)
RETURNS VARCHAR(10) AS $$
DECLARE
    v_pc_number VARCHAR(4);
BEGIN
    IF p_pc_id IS NULL THEN
        RETURN 'UNASSIGNED-' || LPAD(p_device_number::TEXT, 3, '0');
    END IF;
    
    SELECT pc_number INTO v_pc_number FROM pcs WHERE id = p_pc_id;
    
    IF v_pc_number IS NULL THEN
        RETURN 'UNKNOWN-' || LPAD(p_device_number::TEXT, 3, '0');
    END IF;
    
    RETURN v_pc_number || '-' || LPAD(p_device_number::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql STABLE;

-- 디바이스 번호 자동생성 함수 (PC 내에서 순차)
CREATE OR REPLACE FUNCTION generate_device_number(target_pc_id UUID)
RETURNS INT AS $$
DECLARE
    next_num INT;
BEGIN
    IF target_pc_id IS NULL THEN
        -- 미배정 디바이스는 전역 번호 (기존 최대값 + 1)
        SELECT COALESCE(MAX(device_number), 0) + 1 INTO next_num
        FROM devices WHERE pc_id IS NULL;
    ELSE
        -- 해당 PC 내에서 빈 번호 찾기
        SELECT COALESCE(
            (SELECT MIN(n) FROM generate_series(1, 999) n 
             WHERE NOT EXISTS (
                 SELECT 1 FROM devices 
                 WHERE pc_id = target_pc_id AND device_number = n
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
-- 뷰: 관리번호 기준 전체 현황
-- ============================================
CREATE OR REPLACE VIEW device_overview AS
SELECT 
    d.id,
    get_management_code(d.pc_id, d.device_number) as management_code,
    p.pc_number,
    d.device_number,
    COALESCE(d.serial_number, '-') as serial_number,
    COALESCE(d.ip_address::TEXT, '-') as ip_address,
    d.model,
    d.connection_type,
    d.usb_port,
    d.status as device_status,
    COALESCE(p.status, 'unassigned') as pc_status,
    d.battery_level,
    d.last_heartbeat,
    d.last_task_at,
    d.error_count,
    d.last_error,
    d.created_at,
    d.updated_at
FROM devices d
LEFT JOIN pcs p ON d.pc_id = p.id
ORDER BY p.pc_number NULLS LAST, d.device_number;

-- PC별 요약 뷰
CREATE OR REPLACE VIEW pc_summary AS
SELECT 
    p.id,
    p.pc_number,
    p.ip_address,
    p.hostname,
    p.label,
    p.location,
    p.max_devices,
    p.status,
    p.last_heartbeat,
    COUNT(d.id) as device_count,
    COUNT(d.id) FILTER (WHERE d.status = 'online') as online_count,
    COUNT(d.id) FILTER (WHERE d.status = 'error') as error_count,
    AVG(d.battery_level) FILTER (WHERE d.battery_level IS NOT NULL) as avg_battery
FROM pcs p
LEFT JOIN devices d ON d.pc_id = p.id
GROUP BY p.id
ORDER BY p.pc_number;

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_devices_pc_id ON devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat ON devices(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_pcs_status ON pcs(status);
CREATE INDEX IF NOT EXISTS idx_pcs_last_heartbeat ON pcs(last_heartbeat);

-- ============================================
-- 트리거: updated_at 자동 갱신
-- ============================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pcs_updated_at ON pcs;
CREATE TRIGGER pcs_updated_at
    BEFORE UPDATE ON pcs
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS devices_updated_at ON devices;
CREATE TRIGGER devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================
-- RLS (Row Level Security) - 필요시 활성화
-- ============================================
-- ALTER TABLE pcs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 초기 데이터 (테스트용 - 필요시 주석 해제)
-- ============================================
-- INSERT INTO pcs (pc_number, ip_address, hostname, label, location, status)
-- VALUES 
--     ('PC01', '192.168.1.101', 'minipc-01', '1번 PC', '서버실 A-1', 'offline'),
--     ('PC02', '192.168.1.102', 'minipc-02', '2번 PC', '서버실 A-2', 'offline');

-- ============================================
-- 권한 설정 (Supabase anon/authenticated role)
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON pcs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON devices TO authenticated;
GRANT SELECT ON device_overview TO authenticated;
GRANT SELECT ON pc_summary TO authenticated;
GRANT EXECUTE ON FUNCTION generate_pc_number() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_device_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_management_code(UUID, INT) TO authenticated;
