import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 설정
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경 변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인하세요.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// =============================================
// 타입 정의 — 통합 소스: @doai/shared/database
// =============================================

export type {
  Device,
  Job,
  JobAssignment,
  SalaryLog,
  ScrcpyCommand,
  MonitoredChannel,
} from "@doai/shared/database";

// DB Channel/Comment는 Db 접두사로 export (앱 레이어 Channel과 충돌 방지)
export type {
  DbChannel as Channel,
  DbComment as Comment,
} from "@doai/shared/database";
