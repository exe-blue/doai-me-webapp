import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 서버 사이드 Supabase 클라이언트
// API Routes에서 사용 - service_role 키 사용 시 RLS 우회
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 서버에서만 사용할 클라이언트 (RLS 우회)
export function createServerSupabaseClient(): SupabaseClient {
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다");
  }

  // Service Role 키가 있으면 사용 (RLS 우회), 없으면 Anon 키 사용
  if (!supabaseServiceKey) {
    console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY is missing, using SUPABASE_ANON_KEY instead. RLS will apply.');
  }
  const key = supabaseServiceKey || supabaseAnonKey;
  if (!key) {
    throw new Error("Supabase API 키가 설정되지 않았습니다");
  }

  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// 싱글톤 인스턴스 (API Routes에서 재사용)
let serverClient: SupabaseClient | null = null;

export function getServerClient(): SupabaseClient {
  if (!serverClient) {
    serverClient = createServerSupabaseClient();
  }
  return serverClient;
}
