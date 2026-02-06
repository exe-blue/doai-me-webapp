import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

// POST /api/queue/batch - 배치 액션
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json();

    const { execution_ids, action, priority } = body;

    if (!execution_ids || !Array.isArray(execution_ids) || execution_ids.length === 0) {
      return errorResponse("INVALID_REQUEST", "execution_ids가 필요합니다", 400);
    }

    if (!action || !["cancel", "retry", "prioritize"].includes(action)) {
      return errorResponse("INVALID_ACTION", "유효한 action이 필요합니다 (cancel, retry, prioritize)", 400);
    }

    let affected = 0;

    switch (action) {
      case "cancel": {
        const { data, error } = await supabase
          .from("video_executions")
          .update({ status: "cancelled" })
          .in("id", execution_ids)
          .in("status", ["pending", "queued", "assigned"])
          .select();

        if (error) {
          return errorResponse("DB_ERROR", error.message, 500);
        }
        affected = data?.length || 0;
        break;
      }

      case "retry": {
        // 실패한 실행을 pending으로 재설정
        const { data, error } = await supabase
          .from("video_executions")
          .update({
            status: "pending",
            error_message: null,
            error_code: null,
            actual_watch_seconds: null,
            progress: 0,
          })
          .in("id", execution_ids)
          .in("status", ["failed", "cancelled"])
          .select();

        if (error) {
          return errorResponse("DB_ERROR", error.message, 500);
        }
        affected = data?.length || 0;
        break;
      }

      case "prioritize": {
        if (typeof priority !== "number" || priority < 0 || priority > 100) {
          return errorResponse("INVALID_PRIORITY", "우선순위는 0-100 사이여야 합니다", 400);
        }

        const { data, error } = await supabase
          .from("video_executions")
          .update({ priority })
          .in("id", execution_ids)
          .in("status", ["queued", "pending"])
          .select();

        if (error) {
          return errorResponse("DB_ERROR", error.message, 500);
        }
        affected = data?.length || 0;
        break;
      }
    }

    return successResponse({ affected });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
