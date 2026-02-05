import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/executions/:id/retry - 실행 재시도
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();

    // 기존 실행 조회
    const { data: execution, error: fetchError } = await supabase
      .from("video_executions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return errorResponse("NOT_FOUND", "실행 기록을 찾을 수 없습니다", 404);
      }
      return errorResponse("DB_ERROR", fetchError.message, 500);
    }

    // 실패 또는 취소된 실행만 재시도 가능
    if (!["failed", "cancelled"].includes(execution.status)) {
      return errorResponse(
        "INVALID_STATUS",
        "실패 또는 취소된 실행만 재시도할 수 있습니다",
        400
      );
    }

    // 새 실행 생성
    const newExecution = {
      video_id: execution.video_id,
      schedule_id: execution.schedule_id,
      status: "pending",
      priority: execution.priority,
      target_watch_seconds: execution.target_watch_seconds,
      actual_watch_seconds: null,
      progress: 0,
      retry_count: execution.retry_count + 1,
      metadata: execution.metadata,
    };

    const { data, error } = await supabase
      .from("video_executions")
      .insert(newExecution)
      .select()
      .single();

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
