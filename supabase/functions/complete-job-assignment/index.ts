/**
 * Supabase Edge Function: complete-job-assignment
 * 
 * 역할: job_assignment 완료 처리 및 salary_logs 생성
 * - 클라이언트가 직접 salary_logs에 INSERT하지 않고 이 함수를 호출
 * - watch_percentage, actual_duration_sec 검증
 * - rank_in_group은 DB 함수(insert_salary_log_atomic)에서 원자적으로 계산
 *   (advisory lock 사용하여 동시 완료 시 race condition 방지)
 * - service_role 키로 salary_logs 삽입
 * 
 * 사용법:
 * POST /functions/v1/complete-job-assignment
 * Body: { assignment_id, watch_percentage, actual_duration_sec }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS 헤더
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  assignment_id: string
  watch_percentage: number
  actual_duration_sec: number
}

interface JobAssignment {
  id: string
  job_id: string
  device_id: string  // UUID FK to devices.id
  status: string
  watch_percentage: number
  final_duration_sec: number
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 환경 변수에서 service_role 키 사용 (클라이언트 키가 아님)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('서버 설정 오류: 환경 변수가 설정되지 않았습니다.')
    }

    // service_role 키로 클라이언트 생성 (RLS 우회 가능)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 요청 본문 파싱
    const body: RequestBody = await req.json()
    const { assignment_id, watch_percentage, actual_duration_sec } = body

    // 입력값 검증
    if (!assignment_id) {
      return new Response(
        JSON.stringify({ error: 'assignment_id가 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // watch_percentage 검증 및 클램핑 (0-100)
    const validatedWatchPct = Math.max(0, Math.min(100, Math.round(watch_percentage || 0)))
    
    // actual_duration_sec 검증 (음수 방지)
    const validatedDuration = Math.max(0, Math.round(actual_duration_sec || 0))

    // 1. assignment 조회 및 상태 확인
    const { data: assignment, error: fetchError } = await supabase
      .from('job_assignments')
      .select('id, job_id, device_id, status')
      .eq('id', assignment_id)
      .single()

    if (fetchError || !assignment) {
      return new Response(
        JSON.stringify({ error: 'assignment를 찾을 수 없습니다.', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 이미 완료된 assignment인지 확인
    if (assignment.status === 'completed') {
      return new Response(
        JSON.stringify({ error: '이미 완료된 assignment입니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. assignment 상태 업데이트
    const { error: updateError } = await supabase
      .from('job_assignments')
      .update({
        status: 'completed',
        progress_pct: 100,
        completed_at: new Date().toISOString(),
        final_duration_sec: validatedDuration,
        watch_percentage: validatedWatchPct
      })
      .eq('id', assignment_id)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'assignment 업데이트 실패', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. salary_log 원자적 생성 (DB 함수 호출로 race condition 방지)
    // insert_salary_log_atomic 함수가 advisory lock을 사용하여 동시성 제어
    const { data: salaryLogResult, error: rpcError } = await supabase
      .rpc('insert_salary_log_atomic', {
        p_assignment_id: assignment_id,
        p_job_id: assignment.job_id,
        p_watch_percentage: validatedWatchPct,
        p_actual_duration_sec: validatedDuration
      })
      .single()

    if (rpcError) {
      console.error('salary_log 원자적 생성 오류:', rpcError)
      return new Response(
        JSON.stringify({ 
          error: 'salary_log 생성 실패', 
          details: rpcError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // RPC 결과에서 rank_in_group 추출
    const rankInGroup = salaryLogResult?.rank_in_group ?? 1

    // 4. 성공 응답
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          assignment_id,
          job_id: assignment.job_id,
          watch_percentage: validatedWatchPct,
          actual_duration_sec: validatedDuration,
          rank_in_group: rankInGroup
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    // 에러 타입 narrowing: unknown -> 안전한 문자열 추출
    let errorMessage: string
    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'object' && error !== null && 'message' in error) {
      errorMessage = String((error as { message: unknown }).message)
    } else {
      errorMessage = String(error)
    }
    
    console.error('Edge Function 오류:', errorMessage)
    return new Response(
      JSON.stringify({ error: '서버 오류가 발생했습니다.', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
