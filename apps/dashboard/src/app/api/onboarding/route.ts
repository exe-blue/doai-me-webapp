import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
} from "@/lib/api-utils";
import { getServerClient } from "@/lib/supabase-server";

// Desktop Agent Manager 연결 정보
const MANAGER_URL = process.env.DESKTOP_AGENT_URL || "http://localhost:3003";

/**
 * 온보딩 단계 정의
 */
const ONBOARDING_STEPS = [
  { id: "hardware", name: "하드웨어 검증", description: "ADB 연결, 모델 확인, 배터리/스토리지 체크" },
  { id: "standardize", name: "표준화", description: "해상도 720x1480, DPI 320, 애니메이션 비활성화" },
  { id: "naming", name: "명명", description: "디바이스 이름 설정 (PC{XX}-{YY})" },
  { id: "accessibility", name: "접근성", description: "AutoX.js 접근성 서비스 활성화" },
  { id: "security", name: "보안 해제", description: "잠금화면 비활성화, USB 디버깅 유지" },
  { id: "apps", name: "앱 설치", description: "AutoX.js, YouTube 앱 설치" },
  { id: "network", name: "네트워크", description: "WiFi 설정, 프록시 구성 (선택)" },
  { id: "account", name: "계정 설정", description: "YouTube 계정 로그인 (수동)" },
  { id: "ready", name: "준비 완료", description: "최종 검증 및 활성화" },
];

/**
 * GET /api/onboarding - 온보딩 상태 조회
 * 
 * Query params:
 * - nodeId: 노드 ID로 필터
 * - status: 상태로 필터 (not_started, in_progress, completed, failed)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { page, pageSize, status, nodeId } = getQueryParams(request);

    // 온보딩 상태 테이블 조회
    let query = supabase
      .from("device_onboarding")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false });

    if (nodeId) {
      query = query.eq("node_id", nodeId);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // 페이지네이션
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      // 테이블이 없으면 빈 결과 반환
      if (error.code === "42P01") {
        return paginatedResponse([], 0, page, pageSize);
      }
      return errorResponse("DB_ERROR", error.message, 500);
    }

    // Desktop Agent에서 실시간 상태 가져오기 시도
    let agentStates: Record<string, unknown> = {};
    try {
      const agentResponse = await fetch(`${MANAGER_URL}/api/onboarding/states`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);

      if (agentResponse?.ok) {
        const agentData = await agentResponse.json();
        agentStates = agentData.states || {};
      }
    } catch {
      // Agent 연결 실패 - DB 데이터만 사용
    }

    // DB 데이터와 실시간 데이터 병합
    const enrichedData = (data || []).map((item) => ({
      ...item,
      realtime: agentStates[item.device_id] || null,
    }));

    return paginatedResponse(enrichedData, count || 0, page, pageSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

/**
 * POST /api/onboarding - 온보딩 시작
 * 
 * Body:
 * - deviceIds: string[] - 온보딩할 디바이스 ID 목록
 * - nodeId: string - 노드 ID
 * - config?: object - 온보딩 설정 (선택)
 * - fromStep?: string - 시작 단계 (선택)
 * - skipSteps?: string[] - 건너뛸 단계 (선택)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceIds, nodeId, config, fromStep, skipSteps, action } = body;

    // 단계 목록 조회
    if (action === "get_steps") {
      return successResponse({
        steps: ONBOARDING_STEPS,
        defaultConfig: {
          resolution: { width: 720, height: 1480 },
          dpi: 320,
          timezone: "Asia/Seoul",
        },
      });
    }

    // 디바이스 검증
    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return errorResponse("INVALID_REQUEST", "deviceIds 배열이 필요합니다", 400);
    }

    if (!nodeId) {
      return errorResponse("INVALID_REQUEST", "nodeId가 필요합니다", 400);
    }

    // Desktop Agent Manager에 온보딩 요청
    const response = await fetch(`${MANAGER_URL}/api/onboarding/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceIds,
        nodeId,
        config,
        fromStep,
        skipSteps,
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!response) {
      return errorResponse("MANAGER_OFFLINE", "Desktop Agent가 실행 중이지 않습니다", 503);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return errorResponse(
        "ONBOARDING_FAILED",
        errorData.message || `온보딩 시작 실패: HTTP ${response.status}`,
        response.status
      );
    }

    const result = await response.json();

    // DB에 온보딩 상태 기록
    const supabase = getServerClient();
    for (const deviceId of deviceIds) {
      const { error } = await supabase.from("device_onboarding").upsert(
        {
          device_id: deviceId,
          node_id: nodeId,
          status: "in_progress",
          current_step: "hardware",
          completed_steps: [],
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id" }
      );

      if (error && error.code !== "42P01") {
        console.error(`[Onboarding] DB upsert error for ${deviceId}:`, error);
      }
    }

    return successResponse({
      started: true,
      deviceCount: deviceIds.length,
      nodeId,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

/**
 * PATCH /api/onboarding - 온보딩 상태 업데이트
 * 
 * Body:
 * - deviceId: string - 디바이스 ID
 * - status?: string - 상태
 * - currentStep?: string - 현재 단계
 * - completedSteps?: string[] - 완료된 단계
 * - error?: string - 에러 메시지
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, status, currentStep, completedSteps, error: errorMsg, action } = body;

    // 특정 단계 재시도
    if (action === "retry_step") {
      const { step } = body;
      if (!deviceId || !step) {
        return errorResponse("INVALID_REQUEST", "deviceId와 step이 필요합니다", 400);
      }

      const response = await fetch(`${MANAGER_URL}/api/onboarding/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, step }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);

      if (!response) {
        return errorResponse("MANAGER_OFFLINE", "Desktop Agent가 실행 중이지 않습니다", 503);
      }

      const result = await response.json();
      return successResponse(result);
    }

    // 온보딩 취소
    if (action === "cancel") {
      if (!deviceId) {
        return errorResponse("INVALID_REQUEST", "deviceId가 필요합니다", 400);
      }

      const response = await fetch(`${MANAGER_URL}/api/onboarding/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      // DB 상태 업데이트
      const supabase = getServerClient();
      await supabase
        .from("device_onboarding")
        .update({
          status: "failed",
          error_message: "Cancelled by user",
          updated_at: new Date().toISOString(),
        })
        .eq("device_id", deviceId);

      return successResponse({ cancelled: true, deviceId });
    }

    // 일반 상태 업데이트
    if (!deviceId) {
      return errorResponse("INVALID_REQUEST", "deviceId가 필요합니다", 400);
    }

    const supabase = getServerClient();
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) updateData.status = status;
    if (currentStep) updateData.current_step = currentStep;
    if (completedSteps) updateData.completed_steps = completedSteps;
    if (errorMsg) updateData.error_message = errorMsg;

    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("device_onboarding")
      .update(updateData)
      .eq("device_id", deviceId)
      .select()
      .single();

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
