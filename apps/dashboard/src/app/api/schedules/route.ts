import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
} from "@/lib/api-utils";
import { parseExpression } from "cron-parser";

// GET /api/schedules - 스케줄 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { page, pageSize, sortBy = "created_at", sortOrder = "desc" } =
      getQueryParams(request);

    let query = supabase.from("schedules").select("*", { count: "exact" });

    // 정렬
    const validSortFields = ["created_at", "name", "next_run_at"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "created_at";
    query = query.order(sortField, { ascending: sortOrder === "asc" });

    // 페이지네이션
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return paginatedResponse(data || [], count || 0, page, pageSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

// POST /api/schedules - 스케줄 생성
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "요청 본문이 유효한 JSON이 아닙니다", 400);
    }

    const { name, schedule_type, cron_expression, interval_minutes, target_type, target_ids, task_config, description } = body;

    if (!name) {
      return errorResponse("INVALID_REQUEST", "name이 필요합니다", 400);
    }
    if (!schedule_type || !["interval", "cron", "once"].includes(schedule_type)) {
      return errorResponse("INVALID_TYPE", "유효한 schedule_type이 필요합니다 (interval, cron, once)", 400);
    }

    // next_run_at 계산
    let nextRunAt: string | null = null;
    if (schedule_type === "interval" && interval_minutes) {
      nextRunAt = new Date(Date.now() + interval_minutes * 60 * 1000).toISOString();
    } else if (schedule_type === "cron" && cron_expression) {
      try {
        const interval = parseExpression(cron_expression);
        nextRunAt = interval.next().toISOString();
      } catch {
        return errorResponse("INVALID_CRON", "유효하지 않은 cron 표현식입니다", 400);
      }
    }

    const scheduleData = {
      name,
      description: description || null,
      schedule_type,
      cron_expression: schedule_type === "cron" ? cron_expression : null,
      interval_minutes: schedule_type === "interval" ? interval_minutes : null,
      target_type: target_type || "all_videos",
      target_ids: target_type !== "all_videos" ? target_ids : null,
      task_config: task_config || {},
      is_active: true,
      next_run_at: nextRunAt,
      run_count: 0,
    };

    const { data, error } = await supabase
      .from("schedules")
      .insert(scheduleData)
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
