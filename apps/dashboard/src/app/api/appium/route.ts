import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";

// FastAPI 서버 URL (Celery API 서버와 동일)
const FASTAPI_URL = process.env.CELERY_API_URL || "http://localhost:8000";

/**
 * GET /api/appium - Appium 세션 메트릭 조회
 *
 * FastAPI 서버의 /api/appium/metrics 엔드포인트에서 데이터 fetch.
 * Workers 페이지 5초 폴링에서 호출.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const response = await fetch(`${FASTAPI_URL}/api/appium/metrics`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);

    if (!response || !response.ok) {
      // FastAPI 서버 연결 실패 → graceful degradation
      return successResponse({
        appiumOnline: false,
        appiumReady: false,
        activeSessions: 0,
        maxSessions: 10,
        availablePorts: 0,
        usedPorts: {},
        activeDevices: [],
      });
    }

    const data = await response.json();

    return successResponse({
      appiumOnline: true,
      appiumReady: data.appium_ready ?? false,
      activeSessions: data.active_sessions ?? 0,
      maxSessions: data.max_sessions ?? 10,
      availablePorts: data.available_ports ?? 0,
      usedPorts: data.used_ports ?? {},
      activeDevices: data.active_devices ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[API] Appium metrics fetch error:", message);

    // 타임아웃/연결 오류 → 정상 응답 (offline 상태)
    if (message.includes("timeout") || message.includes("ECONNREFUSED")) {
      return successResponse({
        appiumOnline: false,
        appiumReady: false,
        activeSessions: 0,
        maxSessions: 10,
        availablePorts: 0,
        usedPorts: {},
        activeDevices: [],
      });
    }

    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
