import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse, getQueryParams } from "@/lib/api-utils";

// GET /api/reports/summary - 기간 요약 리포트
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { dateFrom, dateTo } = getQueryParams(request);

    if (!dateFrom || !dateTo) {
      return errorResponse("INVALID_REQUEST", "dateFrom과 dateTo가 필요합니다", 400);
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
      return errorResponse("INVALID_REQUEST", "날짜 형식은 YYYY-MM-DD여야 합니다", 400);
    }

    const startDate = `${dateFrom}T00:00:00.000Z`;
    const endDate = `${dateTo}T23:59:59.999Z`;

    // 해당 기간의 실행 통계 조회
    const { data: executions, error } = await supabase
      .from("video_executions")
      .select("status, actual_watch_seconds, video_id")
      .gte("started_at", startDate)
      .lte("started_at", endDate);

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    const data = executions || [];

    const totalTasks = data.length;
    const completedTasks = data.filter((e) => e.status === "completed").length;
    const failedTasks = data.filter((e) => e.status === "failed").length;

    const watchTimes = data
      .filter((e) => e.actual_watch_seconds)
      .map((e) => e.actual_watch_seconds as number);

    const totalWatchTime = watchTimes.reduce((sum, t) => sum + t, 0);
    const uniqueVideos = new Set(data.map((e) => e.video_id)).size;

    // 활성 디바이스 수
    const { count: activeDevices } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .in("status", ["online", "busy", "idle"]);

    // 평균 성공률
    const avgSuccessRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    const summary = {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      failed_tasks: failedTasks,
      total_watch_time: totalWatchTime,
      unique_videos: uniqueVideos,
      active_devices: activeDevices || 0,
      avg_success_rate: Math.round(avgSuccessRate * 100) / 100,
    };

    return successResponse(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
