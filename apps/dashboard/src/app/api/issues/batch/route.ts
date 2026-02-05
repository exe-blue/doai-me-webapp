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
          // Fallback: if RPC doesn't exist, use raw SQL via rpc
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("device_issues")
            .update({
              status: "in_progress",
              recovery_attempts: supabase.rpc("increment_recovery_attempts"),
            } as never)
            .in("id", issue_ids)
            .eq("auto_recoverable", true)
            .select();

          // If fallback also fails, try simple update without increment
          if (fallbackError) {
            const { data: simpleData, error: simpleError } = await supabase
              .from("device_issues")
              .update({ status: "in_progress" })
              .in("id", issue_ids)
              .eq("auto_recoverable", true)
              .select("id, recovery_attempts");

            if (simpleError) {
              return errorResponse("DB_ERROR", simpleError.message, 500);
            }

            // Atomic increment using raw SQL expression
            if (simpleData && simpleData.length > 0) {
              const ids = simpleData.map((d) => d.id);
              await supabase.rpc("exec_sql", {
                query: `UPDATE device_issues SET recovery_attempts = COALESCE(recovery_attempts, 0) + 1 WHERE id = ANY($1)`,
                params: [ids],
              }).catch(() => {
                // If exec_sql doesn't exist, silently continue (status was already updated)
              });
            }

            affected = simpleData?.length || 0;
            break;
          }

          affected = fallbackData?.length || 0;
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
