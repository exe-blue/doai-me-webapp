import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse, getQueryParams } from "@/lib/api-utils";

// GET /api/reports/daily - 일간 리포트 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { date } = getQueryParams(request);

    // 날짜가 없으면 오늘
    const targetDate = date || new Date().toISOString().split("T")[0];
    const startOfDay = `${targetDate}T00:00:00.000Z`;
    const endOfDay = `${targetDate}T23:59:59.999Z`;

    // 해당 날짜의 실행 통계 조회
    const { data: executions, error } = await supabase
      .from("video_executions")
      .select("status, actual_watch_seconds, started_at")
      .gte("started_at", startOfDay)
      .lte("started_at", endOfDay);

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    const data = executions || [];

    // 통계 계산
    const totalTasks = data.length;
    const completedTasks = data.filter((e) => e.status === "completed").length;
    const failedTasks = data.filter((e) => e.status === "failed").length;
    const cancelledTasks = data.filter((e) => e.status === "cancelled").length;

    const watchTimes = data
      .filter((e) => e.actual_watch_seconds)
      .map((e) => e.actual_watch_seconds as number);

    const totalWatchTime = watchTimes.reduce((sum, t) => sum + t, 0);
    const avgWatchTime = watchTimes.length > 0 ? totalWatchTime / watchTimes.length : 0;

    // 고유 비디오 수 (video_id로 계산하려면 추가 쿼리 필요)
    const uniqueVideos = new Set(data.map((e) => (e as Record<string, unknown>).video_id)).size;

    // 시간대별 작업 수
    const tasksPerHour = Array(24).fill(0);
    for (const exec of data) {
      if (exec.started_at) {
        const hour = new Date(exec.started_at).getHours();
        tasksPerHour[hour]++;
      }
    }

    // 에러율
    const errorRate = totalTasks > 0 ? (failedTasks / totalTasks) * 100 : 0;

    // 활성 디바이스 수 조회
    const { count: activeDevices } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .in("status", ["online", "busy", "idle"]);

    const report = {
      date: targetDate,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      failed_tasks: failedTasks,
      cancelled_tasks: cancelledTasks,
      total_watch_time: totalWatchTime,
      avg_watch_time: Math.round(avgWatchTime),
      unique_videos: uniqueVideos,
      active_devices: activeDevices || 0,
      error_rate: Math.round(errorRate * 100) / 100,
      tasks_per_hour: tasksPerHour,
    };

    return successResponse(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
