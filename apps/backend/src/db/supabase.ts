/**
 * Supabase Client
 * 
 * Backend 서버용 Supabase 클라이언트
 * Service Role Key 사용 (RLS 우회)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './types';

// 싱글톤 인스턴스
let supabase: SupabaseClient<Database> | null = null;

/**
 * Supabase 클라이언트 인스턴스 반환
 * 
 * @throws {Error} 환경 변수 미설정 시
 * @returns {SupabaseClient<Database>} Supabase 클라이언트
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase credentials not configured. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
    }

    supabase = createClient<Database>(url, key, {
      auth: {
        persistSession: false,  // 서버에서는 세션 유지 불필요
        autoRefreshToken: false,
      },
      db: {
        schema: 'public',
      },
    });
  }

  return supabase;
}

/**
 * Supabase 연결 테스트
 * 
 * @returns {Promise<boolean>} 연결 성공 여부
 */
export async function testConnection(): Promise<boolean> {
  try {
    const db = getSupabase();
    const { error } = await db.from('settings').select('key').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Supabase 연결 종료 (cleanup)
 * 
 * 참고: @supabase/supabase-js는 명시적 연결 종료 메서드가 없음
 * 싱글톤 참조만 해제
 */
export function closeSupabase(): void {
  supabase = null;
}

// Re-export types
export type { Database } from './types';
export type { SupabaseClient } from '@supabase/supabase-js';
