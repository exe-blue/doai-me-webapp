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

    // target_type에 따라 대상 영상 조회
    let videoIds: string[] = [];

    if (schedule.target_type === "specific_videos" && schedule.target_ids?.length) {
      videoIds = schedule.target_ids;
    } else if (schedule.target_type === "by_channel" && schedule.target_ids?.length) {
      const { data: videos } = await supabase
        .from("videos")
        .select("id")
        .in("channel_id", schedule.target_ids)
        .eq("status", "active");
      videoIds = (videos || []).map((v: { id: string }) => v.id);
    } else if (schedule.target_type === "by_keyword" && schedule.target_ids?.length) {
      const { data: videos } = await supabase
        .from("videos")
        .select("id")
        .in("keyword_id", schedule.target_ids)
        .eq("status", "active");
      videoIds = (videos || []).map((v: { id: string }) => v.id);
    } else {
      // all_videos
      const { data: videos } = await supabase
        .from("videos")
        .select("id")
        .eq("status", "active")
        .limit(schedule.task_config?.batch_size || 100);
      videoIds = (videos || []).map((v: { id: string }) => v.id);
    }

    if (videoIds.length === 0) {
      return errorResponse("NO_VIDEOS", "실행 대상 영상이 없습니다", 400);
    }

    // 대기열에 추가
    const taskConfig = schedule.task_config || {};
    const executions = videoIds.map((videoId: string) => ({
      video_id: videoId,
      schedule_id: id,
      status: "pending",
      priority: taskConfig.priority === "high" ? 80 : taskConfig.priority === "low" ? 20 : 50,
      target_watch_seconds: 60,
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
    const { error: updateError } = await supabase
      .from("schedules")
      .update({
        last_run_at: new Date().toISOString(),
        run_count: (schedule.run_count || 0) + 1,
      })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update schedule after run:", updateError);
    }

    return successResponse({ queued: data?.length || 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
