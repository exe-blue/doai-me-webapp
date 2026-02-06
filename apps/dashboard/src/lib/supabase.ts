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

// devices 테이블 - 20260206_device_management.sql 기준
export interface Device {
  id: string;  // UUID PRIMARY KEY
  pc_id: string | null;  // UUID FK → pcs(id)
  device_number: number | null;  // 1-999
  serial_number: string | null;  // VARCHAR(50)
  ip_address: string | null;  // INET
  model: string | null;  // VARCHAR(50) DEFAULT 'Galaxy S9'
  android_version: string | null;  // VARCHAR(20)
  connection_type: string;  // VARCHAR(10) DEFAULT 'usb'
  usb_port: number | null;
  status: 'online' | 'offline' | 'busy' | 'error';  // VARCHAR(20) DEFAULT 'offline'
  battery_level: number | null;
  last_heartbeat: string | null;  // TIMESTAMPTZ
  last_task_at: string | null;  // TIMESTAMPTZ
  error_count: number;  // DEFAULT 0
  last_error: string | null;
  last_error_at: string | null;  // TIMESTAMPTZ
  management_code: string | null;  // computed by trigger (e.g. PC01-001)
  created_at: string;
  updated_at: string;
}

// jobs 테이블 - 실제 DB 스키마 기반 (supabase-schema.sql 참조)
export interface Job {
  id: string;                    // UUID
  title: string;                 // 작업 제목
  keyword?: string | null;       // 검색어. NULL이면 URL 직접 진입
  duration_sec?: number;         // 영상 시청 시간(초) DEFAULT 60
  target_group?: string | null;  // 대상 그룹
  target_url: string;            // 목표 URL
  video_url?: string | null;     // 호환성 (target_url의 alias)
  script_type?: string;          // DEFAULT 'youtube_watch'
  duration_min_pct?: number;     // 최소 시청 비율 DEFAULT 30
  duration_max_pct?: number;     // 최대 시청 비율 DEFAULT 90
  prob_like?: number;            // 좋아요 확률 DEFAULT 0
  like_probability?: number;     // 호환성 (prob_like의 alias)
  prob_comment?: number;         // 댓글 확률 DEFAULT 0
  prob_playlist?: number;        // 저장 확률 DEFAULT 0
  base_reward?: number;          // 기본 보상 DEFAULT 10
  is_active?: boolean;           // 활성화 여부 DEFAULT true
  total_assignments?: number;    // 총 할당 수 DEFAULT 0
  created_at: string;            // 생성일시
  updated_at?: string;           // 수정일시
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
  error_code?: string | null;
  retry_count?: number;
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

// channels 테이블 (자동 모니터링 채널)
export interface Channel {
  id: string;  // UUID
  channel_id: string;  // YouTube Channel ID (UC...)
  channel_name: string;
  channel_url: string;
  is_active: boolean;
  last_video_id?: string;
  last_checked_at?: string;
  check_interval_min: number;
  default_duration_sec: number;
  default_prob_like: number;
  default_prob_comment: number;
  default_prob_playlist: number;
  created_at: string;
  updated_at: string;
}

// comments 테이블 (댓글 풀)
export interface Comment {
  id: string;  // UUID
  job_id?: string;  // 작업별 댓글
  channel_id?: string;  // 채널별 공용 댓글
  content: string;
  is_used: boolean;
  used_by_device_id?: string;
  used_at?: string;
  created_at: string;
}

// Legacy: monitored_channels 테이블 (하위 호환성)
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
