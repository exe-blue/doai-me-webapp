import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 설정
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경 변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인하세요.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
// =============================================
// 타입 정의 (실제 DB 스키마 기반 - supabase-schema.sql 참조)
// =============================================

// devices 테이블 - id가 PK, serial_number는 UNIQUE
export interface Device {
  id: string;  // UUID PRIMARY KEY
  serial_number: string;  // UNIQUE
  pc_id: string;
  group_id: string;
  status: 'idle' | 'busy' | 'offline';
  last_seen_at: string;
  created_at: string;
  // 001_scrcpy_heartbeat 마이그레이션 추가 컬럼 (optional - may not exist)
  last_heartbeat_at?: string | null;  // TIMESTAMPTZ nullable
  last_job_activity_at?: string | null;  // TIMESTAMPTZ nullable
  adb_connected?: boolean;  // DEFAULT FALSE (optional until migration applied)
  consecutive_failures?: number;  // DEFAULT 0
  health_status?: 'healthy' | 'zombie' | 'offline';  // DEFAULT 'offline'
  // scrcpy 관련 상태
  scrcpy_running?: boolean;
  scrcpy_pid?: number | null;
  // Fixed Inventory System 추가 필드 (Socket.io heartbeat에서 수신)
  ip?: string;  // 기기 IP 주소 (예: 192.168.0.123)
  slotNum?: number;  // 슬롯 번호 (1-20)
  boardId?: string;  // 보드 ID (예: B01)
  slotId?: string;   // 슬롯 ID (예: S01)
}

// jobs 테이블 - Simplified V2 Schema
export interface Job {
  id: string;                    // UUID
  name: string;                  // "260130-짐승남-N"
  type: 'VIDEO' | 'CHANNEL';
  targetUrl: string;
  targetCount: number;           // 목표 조회수 (예: 100)
  currentCount: number;          // 현재 완료수 (예: 45)
  priority: boolean;             // 우선순위 여부 (True면 큐 맨 앞)
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  assignedDevices: string[];     // ["P01-001", "P01-005"...] 현재 작업중인 기기들
  createdAt: number;             // Unix timestamp
}

// job_assignments 테이블
export interface JobAssignment {
  id: string;  // UUID
  job_id: string;
  device_id: string;  // UUID FK to devices.id
  device_serial?: string;  // 정보성, non-FK
  status: 'pending' | 'paused' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress_pct: number;
  final_duration_sec?: number;
  did_like?: boolean;
  did_comment?: boolean;
  did_playlist?: boolean;
  error_log?: string;
  assigned_at: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  // Join된 job 정보 (선택적)
  jobs?: Job;
}

// salary_logs 테이블
export interface SalaryLog {
  id: string;  // UUID
  assignment_id: string;
  job_id: string;
  watch_percentage: number;
  actual_duration_sec: number;
  rank_in_group?: number;
  created_at: string;
}

// scrcpy_commands 테이블 (001_scrcpy_heartbeat.sql 참조)
export interface ScrcpyCommand {
  id: string;  // UUID PRIMARY KEY
  device_id: string;  // UUID FK to devices.id
  pc_id: string;  // VARCHAR(50)
  command_type: 'scrcpy_start' | 'scrcpy_stop';
  options: Record<string, unknown>;  // JSONB DEFAULT '{}'
  status: 'pending' | 'received' | 'executing' | 'completed' | 'failed' | 'timeout';
  process_pid?: number | null;
  error_message?: string | null;
  created_at: string;
  received_at?: string | null;
  completed_at?: string | null;
}

// monitored_channels 테이블
export interface MonitoredChannel {
  id: string;  // UUID
  channel_id: string;  // UNIQUE
  channel_name: string;
  is_active: boolean;
  last_video_id?: string;
  last_checked_at?: string;
  preset_settings?: {
    duration_min_pct?: number;
    duration_max_pct?: number;
    prob_like?: number;
    prob_comment?: number;
    prob_playlist?: number;
  };
  created_at: string;
  updated_at: string;
}
