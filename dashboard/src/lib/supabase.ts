import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 설정
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
}

// jobs 테이블
export interface Job {
  id: string;  // UUID
  title: string;
  target_group?: string;
  target_url: string;
  video_url?: string;  // 호환성 alias
  script_type: string;
  duration_min_pct: number;
  duration_max_pct: number;
  prob_like: number;
  like_probability?: number;  // 호환성 alias
  prob_comment: number;
  prob_playlist: number;
  base_reward: number;
  is_active: boolean;
  total_assignments: number;
  created_at: string;
  updated_at: string;
}

// job_assignments 테이블
export interface JobAssignment {
  id: string;  // UUID
  job_id: string;
  device_id: string;  // UUID FK to devices.id
  device_serial?: string;  // 정보성, non-FK
  status: 'pending' | 'running' | 'completed' | 'failed';
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
