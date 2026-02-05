import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getServerClient } from "@/lib/supabase-server";

// Desktop Agent Manager 연결 정보
const MANAGER_URL = process.env.DESKTOP_AGENT_URL || "http://localhost:3003";

interface RouteParams {
  params: Promise<{ deviceId: string }>;
}

/**
 * GET /api/onboarding/:deviceId - 특정 디바이스 온보딩 상태 조회
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const supabase = getServerClient();

    // DB에서 온보딩 상태 조회
    const { data: dbData, error } = await supabase
      .from("device_onboarding")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error && error.code !== "42P01") {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    // Desktop Agent에서 실시간 상태 가져오기
    let realtimeState = null;
    try {
      const agentResponse = await fetch(
        `${MANAGER_URL}/api/onboarding/state/${deviceId}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
        }
      ).catch(() => null);

      if (agentResponse?.ok) {
        realtimeState = await agentResponse.json();
      }
    } catch {
      // Agent 연결 실패
    }

    // 데이터가 없으면 404
    if (!dbData && !realtimeState) {
      return errorResponse("NOT_FOUND", "온보딩 상태를 찾을 수 없습니다", 404);
    }

    return successResponse({
      ...dbData,
      realtime: realtimeState,
      agentOnline: !!realtimeState,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

/**
 * DELETE /api/onboarding/:deviceId - 온보딩 기록 삭제
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const supabase = getServerClient();

    const { error } = await supabase
      .from("device_onboarding")
      .delete()
      .eq("device_id", deviceId);

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse({ deleted: true, deviceId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

/**
 * POST /api/onboarding/:deviceId - 특정 단계 실행
 * 
 * Body:
 * - step: string - 실행할 단계
 * - force?: boolean - 이미 완료된 단계도 재실행
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const body = await request.json();
    const { step, force } = body;

    if (!step) {
      return errorResponse("INVALID_REQUEST", "step이 필요합니다", 400);
    }

    // Desktop Agent에 단계 실행 요청
    const response = await fetch(`${MANAGER_URL}/api/onboarding/run-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceId,
        step,
        force,
      }),
      signal: AbortSignal.timeout(60000), // 단계 실행은 시간이 걸릴 수 있음
    }).catch(() => null);

    if (!response) {
      return errorResponse("MANAGER_OFFLINE", "Desktop Agent가 실행 중이지 않습니다", 503);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return errorResponse(
        "STEP_FAILED",
        errorData.message || `단계 실행 실패: ${step}`,
        response.status
      );
    }

    const result = await response.json();

    // DB 상태 업데이트
    if (result.status === "completed") {
      const supabase = getServerClient();
      
      // 현재 상태 조회
      const { data: current } = await supabase
        .from("device_onboarding")
        .select("completed_steps")
        .eq("device_id", deviceId)
        .maybeSingle();

      const completedSteps = current?.completed_steps || [];
      if (!completedSteps.includes(step)) {
        completedSteps.push(step);
      }

      await supabase
        .from("device_onboarding")
        .update({
          current_step: step,
          completed_steps: completedSteps,
          updated_at: new Date().toISOString(),
        })
        .eq("device_id", deviceId);
    }

    return successResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
