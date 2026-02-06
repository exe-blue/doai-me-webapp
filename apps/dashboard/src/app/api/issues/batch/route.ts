import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

// POST /api/issues/batch - 배치 액션
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json();

    const { issue_ids, action } = body;

    if (!issue_ids || !Array.isArray(issue_ids) || issue_ids.length === 0) {
      return errorResponse("INVALID_REQUEST", "issue_ids가 필요합니다", 400);
    }

    if (!action || !["resolve", "ignore", "retry"].includes(action)) {
      return errorResponse(
        "INVALID_ACTION",
        "유효한 action이 필요합니다 (resolve, ignore, retry)",
        400
      );
    }

    let affected = 0;

    switch (action) {
      case "resolve": {
        const { data, error } = await supabase
          .from("device_issues")
          .update({
            status: "resolved",
            resolved_at: new Date().toISOString(),
            resolved_by: "batch",
          })
          .in("id", issue_ids)
          .in("status", ["open", "in_progress"])
          .select();

        if (error) {
          return errorResponse("DB_ERROR", error.message, 500);
        }
        affected = data?.length || 0;
        break;
      }

      case "ignore": {
        const { data, error } = await supabase
          .from("device_issues")
          .update({ status: "ignored" })
          .in("id", issue_ids)
          .in("status", ["open", "in_progress"])
          .select();

        if (error) {
          return errorResponse("DB_ERROR", error.message, 500);
        }
        affected = data?.length || 0;
        break;
      }

      case "retry": {
        // 복구 시도 카운트 증가 및 상태를 in_progress로 변경 (atomic update)
        const { data, error } = await supabase.rpc("batch_retry_issues", {
          p_issue_ids: issue_ids,
        });

        if (error) {
          // Fallback: Update status first, then call RPC to increment separately
          const { data: statusData, error: statusError } = await supabase
            .from("device_issues")
            .update({ status: "in_progress" })
            .in("id", issue_ids)
            .eq("auto_recoverable", true)
            .select("id");

          if (statusError) {
            return errorResponse("DB_ERROR", statusError.message, 500);
          }

          // Try to increment recovery_attempts via RPC
          const { error: incrementError } = await supabase.rpc("increment_recovery_attempts", {
            ids: issue_ids,
          });

          if (incrementError) {
            // Log warning but don't fail - status update succeeded
            console.warn("[API] Failed to increment recovery_attempts:", incrementError.message);
          }

          affected = statusData?.length || 0;
          break;
        }

        affected = typeof data === "number" ? data : (data?.length || 0);
        break;
      }
    }

    return successResponse({ affected });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
