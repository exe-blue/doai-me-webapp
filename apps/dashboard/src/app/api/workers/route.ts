import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";

/**
 * Worker 상태 정보 타입 (Dashboard 표시용)
 */
interface WorkerInfo {
  workerId: string;
  type: string;
  status: "online" | "offline" | "busy" | "error";
  connectionState: "disconnected" | "connecting" | "connected" | "reconnecting";
  connectedAt: string | null;
  lastHeartbeat: string | null;
  devices: {
    deviceId: string;
    state: string;
    adbId: string;
  }[];
  activeJobs: number;
  maxConcurrentJobs: number;
  metrics: {
    totalJobsExecuted: number;
    successfulJobs: number;
    failedJobs: number;
    averageJobDurationMs: number;
    cpuUsage: number;
    memoryUsage: number;
    uptimeSeconds: number;
  };
}

/**
 * Manager 상태 정보 타입
 */
interface ManagerStatus {
  isRunning: boolean;
  workerCount: number;
  activeJobCount: number;
  workers: WorkerInfo[];
}

// Desktop Agent Manager 연결 정보 (환경변수 또는 기본값)
const MANAGER_URL = process.env.DESKTOP_AGENT_URL || "http://localhost:3003";

/**
 * GET /api/workers - 연결된 Worker 목록 조회
 * 
 * Desktop Agent (Manager)에 연결된 Worker들의 상태를 조회합니다.
 * Desktop Agent가 실행 중이지 않으면 빈 배열을 반환합니다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    // Desktop Agent Manager에서 Worker 상태 조회
    const response = await fetch(`${MANAGER_URL}/api/manager/status`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      // 타임아웃 설정 (3초)
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);

    if (!response || !response.ok) {
      // Desktop Agent가 실행 중이 아니거나 연결 실패
      // 빈 상태로 응답 (에러가 아님)
      return successResponse({
        managerOnline: false,
        workers: [],
        summary: {
          totalWorkers: 0,
          onlineWorkers: 0,
          totalDevices: 0,
          activeJobs: 0,
        },
      });
    }

    const managerStatus: ManagerStatus = await response.json();

    // Worker 목록 변환
    const workers = managerStatus.workers.map((worker) => ({
      workerId: worker.workerId,
      type: worker.type,
      status: worker.status,
      connectionState: worker.connectionState,
      connectedAt: worker.connectedAt,
      lastHeartbeat: worker.lastHeartbeat,
      deviceCount: worker.devices.length,
      devices: worker.devices.map((d) => ({
        deviceId: d.deviceId,
        state: d.state,
        adbId: d.adbId,
      })),
      activeJobs: worker.activeJobs,
      maxConcurrentJobs: worker.maxConcurrentJobs,
      metrics: worker.metrics,
    }));

    // 요약 통계
    const summary = {
      totalWorkers: workers.length,
      onlineWorkers: workers.filter((w) => w.status === "online" || w.status === "busy").length,
      totalDevices: workers.reduce((sum, w) => sum + w.deviceCount, 0),
      activeJobs: workers.reduce((sum, w) => sum + w.activeJobs, 0),
    };

    return successResponse({
      managerOnline: true,
      workers,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[API] Workers fetch error:", message);
    
    // 연결 오류는 정상 응답으로 처리 (Manager offline)
    if (message.includes("timeout") || message.includes("ECONNREFUSED")) {
      return successResponse({
        managerOnline: false,
        workers: [],
        summary: {
          totalWorkers: 0,
          onlineWorkers: 0,
          totalDevices: 0,
          activeJobs: 0,
        },
      });
    }
    
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

/**
 * POST /api/workers/dispatch - Worker에 작업 디스패치
 * 
 * 특정 Worker에 작업을 전송합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workerId, jobType, params, deviceIds, options } = body;

    if (!jobType) {
      return errorResponse("INVALID_REQUEST", "jobType은 필수입니다", 400);
    }

    // Desktop Agent Manager에 작업 디스패치 요청
    const response = await fetch(`${MANAGER_URL}/api/manager/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workerId,
        jobType,
        params,
        deviceIds,
        options,
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!response) {
      return errorResponse("MANAGER_OFFLINE", "Desktop Agent가 실행 중이지 않습니다", 503);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return errorResponse(
        "DISPATCH_FAILED",
        errorData.message || `디스패치 실패: HTTP ${response.status}`,
        response.status
      );
    }

    const result = await response.json();
    return successResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
