import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 설정
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 타입 정의 (실제 DB 스키마 기반)
export interface Job {
  id: string;
  title: string;
  target_url: string;
  script_type: string;
  duration_min_pct: number;
  duration_max_pct: number;
  prob_like: number;
  prob_comment: number;
  prob_playlist: number;
  base_reward: number;
  max_bonus: number;
  is_active: boolean;
  created_at: string;
}

export interface JobAssignment {
  id: string;
  job_id: string;
  device_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress_pct: number;
  assigned_at: string;
  started_at?: string;
  completed_at?: string;
  final_duration_sec?: number;
  error_log?: string;
  watch_percentage?: number;
  did_like?: boolean;
  did_comment?: boolean;
  did_playlist?: boolean;
}

export interface Device {
  id: string;
  serial_number: string;
  nickname?: string;
  group_id: string;
  pc_id: string;
  status: 'idle' | 'busy' | 'offline';
  total_earnings: number;
  reputation_score: number;
  level: number;
  last_seen_at: string;
  created_at: string;
}
