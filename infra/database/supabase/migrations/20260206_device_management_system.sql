-- =============================================
-- 디바이스 관리 시스템 마이그레이션
-- nodes → pcs 변환 및 관리번호 체계 도입
-- Date: 2026-02-06
-- =============================================

-- =============================================
-- 1. nodes 테이블을 pcs로 이름 변경
-- =============================================

-- 기존 nodes 테이블이 있으면 pcs로 변경
DO $$
BEGIN
  -- 1-1. nodes 테이블이 존재하고 pcs가 없으면 이름 변경
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nodes') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pcs') THEN
    
    -- Foreign key 제약조건 임시 삭제
    ALTER TABLE IF EXISTS devices DROP CONSTRAINT IF EXISTS devices_node_id_fkey;
    ALTER TABLE IF EXISTS device_states DROP CONSTRAINT IF EXISTS device_states_node_id_fkey;
    ALTER TABLE IF EXISTS workflow_executions DROP CONSTRAINT IF EXISTS workflow_executions_node_id_fkey;
    
    -- 테이블 이름 변경
    ALTER TABLE nodes RENAME TO pcs;
    
    -- 컬럼 이름 변경 (nodes 관련 → pcs 관련)
    -- devices 테이블: node_id → pc_id
    ALTER TABLE devices RENAME COLUMN node_id TO pc_id;
    
    -- device_states 테이블: node_id → pc_id
    ALTER TABLE device_states RENAME COLUMN node_id TO pc_id;
    
    -- workflow_executions 테이블: node_ids는 유지 (배열이므로)
    
    -- Foreign key 재생성
    ALTER TABLE devices ADD CONSTRAINT devices_pc_id_fkey 
      FOREIGN KEY (pc_id) REFERENCES pcs(id) ON DELETE SET NULL;
    ALTER TABLE device_states ADD CONSTRAINT device_states_pc_id_fkey 
      FOREIGN KEY (pc_id) REFERENCES pcs(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'nodes 테이블을 pcs로 변환 완료';
  END IF;
END $$;

-- =============================================
-- 2. pcs 테이블에 pc_number 컬럼 추가
-- =============================================

DO $$
BEGIN
  -- pcs 테이블이 있으면 pc_number 컬럼 추가
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pcs') THEN
    -- pc_number 컬럼 추가
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pcs' AND column_name = 'pc_number') THEN
      ALTER TABLE pcs ADD COLUMN pc_number TEXT UNIQUE;
    END IF;
    
    -- label 컬럼 추가 (표시 이름)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pcs' AND column_name = 'label') THEN
      ALTER TABLE pcs ADD COLUMN label TEXT;
    END IF;
    
    -- location 컬럼 추가 (위치 정보)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pcs' AND column_name = 'location') THEN
      ALTER TABLE pcs ADD COLUMN location TEXT;
    END IF;
    
    -- hostname 컬럼 추가
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pcs' AND column_name = 'hostname') THEN
      ALTER TABLE pcs ADD COLUMN hostname TEXT;
    END IF;
    
    -- max_devices 컬럼 (device_capacity 대신 또는 추가)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pcs' AND column_name = 'max_devices') THEN
      ALTER TABLE pcs ADD COLUMN max_devices INT DEFAULT 20;
    END IF;
  END IF;
END $$;

-- =============================================
-- 3. devices 테이블에 관리번호 관련 컬럼 추가
-- =============================================

DO $$
BEGIN
  -- device_number 컬럼 추가 (PC 내 순번)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'device_number') THEN
    ALTER TABLE devices ADD COLUMN device_number INT;
  END IF;
  
  -- management_code 컬럼 추가 (PC01-001 형식)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'management_code') THEN
    ALTER TABLE devices ADD COLUMN management_code TEXT UNIQUE;
  END IF;
  
  -- connection_type 컬럼 추가 (usb, wifi, adb_wifi)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'connection_type') THEN
    ALTER TABLE devices ADD COLUMN connection_type TEXT DEFAULT 'usb' CHECK (connection_type IN ('usb', 'wifi', 'adb_wifi'));
  END IF;
  
  -- usb_port 컬럼 추가 (USB 허브 포트 번호)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'usb_port') THEN
    ALTER TABLE devices ADD COLUMN usb_port INT;
  END IF;
END $$;

-- =============================================
-- 4. PC 번호 자동 생성 함수
-- =============================================

CREATE OR REPLACE FUNCTION generate_pc_number()
RETURNS TEXT AS $$
DECLARE
  max_num INT;
  new_num INT;
BEGIN
  -- 현재 가장 높은 PC 번호 조회
  SELECT COALESCE(MAX(CAST(SUBSTRING(pc_number FROM 3) AS INT)), 0)
  INTO max_num
  FROM pcs
  WHERE pc_number ~ '^PC[0-9]{2}$';
  
  -- 다음 번호 계산
  new_num := max_num + 1;
  
  -- 99를 초과하면 에러
  IF new_num > 99 THEN
    RAISE EXCEPTION 'PC 번호가 최대값(99)을 초과했습니다';
  END IF;
  
  -- PC01, PC02, ... 형식으로 반환
  RETURN 'PC' || LPAD(new_num::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. 디바이스 번호 자동 생성 함수
-- =============================================

CREATE OR REPLACE FUNCTION generate_device_number(target_pc_id TEXT DEFAULT NULL)
RETURNS INT AS $$
DECLARE
  max_num INT;
  new_num INT;
BEGIN
  IF target_pc_id IS NOT NULL THEN
    -- 특정 PC 내에서 가장 높은 디바이스 번호 조회
    SELECT COALESCE(MAX(device_number), 0)
    INTO max_num
    FROM devices
    WHERE pc_id = target_pc_id;
  ELSE
    -- 미배정 디바이스 중 가장 높은 번호 조회
    SELECT COALESCE(MAX(device_number), 0)
    INTO max_num
    FROM devices
    WHERE pc_id IS NULL;
  END IF;
  
  new_num := max_num + 1;
  
  -- 999를 초과하면 에러
  IF new_num > 999 THEN
    RAISE EXCEPTION '디바이스 번호가 최대값(999)을 초과했습니다';
  END IF;
  
  RETURN new_num;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 6. 관리번호 자동 생성 트리거 함수
-- =============================================

CREATE OR REPLACE FUNCTION update_management_code()
RETURNS TRIGGER AS $$
DECLARE
  pc_num TEXT;
BEGIN
  -- pc_id가 있고 device_number가 있으면 관리번호 생성
  IF NEW.pc_id IS NOT NULL AND NEW.device_number IS NOT NULL THEN
    -- PC 번호 조회
    SELECT pc_number INTO pc_num FROM pcs WHERE id = NEW.pc_id;
    
    IF pc_num IS NOT NULL THEN
      -- PC01-001 형식으로 관리번호 생성
      NEW.management_code := pc_num || '-' || LPAD(NEW.device_number::TEXT, 3, '0');
    END IF;
  ELSE
    -- PC에 배정되지 않은 경우 NULL
    NEW.management_code := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS trigger_update_management_code ON devices;
CREATE TRIGGER trigger_update_management_code
  BEFORE INSERT OR UPDATE OF pc_id, device_number ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_management_code();

-- =============================================
-- 7. 기존 PC 데이터에 pc_number 할당
-- =============================================

DO $$
DECLARE
  pc_record RECORD;
  new_pc_number TEXT;
BEGIN
  -- pc_number가 없는 PC들에 번호 할당
  FOR pc_record IN 
    SELECT id FROM pcs WHERE pc_number IS NULL ORDER BY created_at
  LOOP
    new_pc_number := generate_pc_number();
    UPDATE pcs SET pc_number = new_pc_number WHERE id = pc_record.id;
  END LOOP;
END $$;

-- =============================================
-- 8. 기존 디바이스 데이터에 device_number 할당
-- =============================================

DO $$
DECLARE
  device_record RECORD;
  new_device_number INT;
BEGIN
  -- device_number가 없는 디바이스들에 번호 할당
  FOR device_record IN 
    SELECT id, pc_id FROM devices WHERE device_number IS NULL ORDER BY created_at
  LOOP
    new_device_number := generate_device_number(device_record.pc_id);
    UPDATE devices SET device_number = new_device_number WHERE id = device_record.id;
  END LOOP;
END $$;

-- =============================================
-- 9. 인덱스 생성
-- =============================================

-- pcs 인덱스
CREATE INDEX IF NOT EXISTS idx_pcs_pc_number ON pcs(pc_number);
CREATE INDEX IF NOT EXISTS idx_pcs_status ON pcs(status);

-- devices 인덱스
CREATE INDEX IF NOT EXISTS idx_devices_pc_id ON devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_devices_management_code ON devices(management_code);
CREATE INDEX IF NOT EXISTS idx_devices_device_number ON devices(device_number);

-- =============================================
-- 10. RLS 정책 업데이트
-- =============================================

-- pcs 테이블 RLS
ALTER TABLE pcs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pcs' AND policyname = 'Service role full access on pcs') THEN
    CREATE POLICY "Service role full access on pcs" ON pcs FOR ALL USING (auth.role() = 'service_role');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pcs' AND policyname = 'Public read pcs') THEN
    CREATE POLICY "Public read pcs" ON pcs FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================
-- 11. 뷰 업데이트
-- =============================================

-- PC별 디바이스 현황 뷰
CREATE OR REPLACE VIEW pc_device_summary AS
SELECT 
  p.id AS pc_id,
  p.pc_number,
  p.label,
  p.location,
  p.status AS pc_status,
  p.max_devices,
  COUNT(d.id) AS device_count,
  COUNT(d.id) FILTER (WHERE d.state = 'IDLE') AS idle_count,
  COUNT(d.id) FILTER (WHERE d.state = 'RUNNING') AS running_count,
  COUNT(d.id) FILTER (WHERE d.state IN ('ERROR', 'QUARANTINE')) AS error_count,
  COUNT(d.id) FILTER (WHERE d.state = 'DISCONNECTED') AS disconnected_count
FROM pcs p
LEFT JOIN devices d ON d.pc_id = p.id
GROUP BY p.id, p.pc_number, p.label, p.location, p.status, p.max_devices
ORDER BY p.pc_number;

-- 뷰 권한
GRANT SELECT ON pc_device_summary TO anon, authenticated;

-- =============================================
-- 12. 관리번호로 디바이스 조회 함수
-- =============================================

CREATE OR REPLACE FUNCTION get_device_by_management_code(p_code TEXT)
RETURNS TABLE (
  id TEXT,
  pc_id TEXT,
  pc_number TEXT,
  device_number INT,
  management_code TEXT,
  serial_number TEXT,
  ip_address TEXT,
  model TEXT,
  state TEXT,
  battery INT,
  connection_type TEXT,
  usb_port INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.pc_id,
    p.pc_number,
    d.device_number,
    d.management_code,
    d.serial_number,
    d.ip_address,
    d.model,
    d.state,
    d.battery,
    d.connection_type,
    d.usb_port,
    d.created_at
  FROM devices d
  LEFT JOIN pcs p ON p.id = d.pc_id
  WHERE d.management_code = UPPER(p_code);
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 완료 메시지
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '디바이스 관리 시스템 마이그레이션 완료';
  RAISE NOTICE 'PC 테이블: pcs (pc_number: PC01~PC99)';
  RAISE NOTICE '디바이스 관리번호: PC01-001 ~ PC99-999';
END $$;
