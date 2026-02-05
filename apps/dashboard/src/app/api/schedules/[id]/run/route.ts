import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/schedules/:id/run - 스케줄 즉시 실행
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();

    // 스케줄 조회
    const { data: schedule, error: fetchError } = await supabase
      .from("schedules")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return errorResponse("NOT_FOUND", "스케줄을 찾을 수 없습니다", 404);
      }
      return errorResponse("DB_ERROR", fetchError.message, 500);
    }

    if (!schedule.video_ids || schedule.video_ids.length === 0) {
      return errorResponse("NO_VIDEOS", "스케줄에 영상이 없습니다", 400);
    }

    // 대기열에 추가
    const executions = schedule.video_ids.map((videoId: string) => ({
      video_id: videoId,
      schedule_id: id,
      status: "pending",
      priority: schedule.config?.priority || 50,
      target_watch_seconds: schedule.config?.target_watch_seconds || 60,
      actual_watch_seconds: null,
      progress: 0,
      retry_count: 0,
      metadata: { schedule_name: schedule.name },
    }));

    const { data, error } = await supabase
      .from("video_executions")
      .insert(executions)
      .select();

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    // 스케줄 업데이트
    await supabase
      .from("schedules")
      .update({
        last_run_at: new Date().toISOString(),
        total_runs: schedule.total_runs + 1,
      })
      .eq("id", id);

    return successResponse({ queued: data?.length || 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
