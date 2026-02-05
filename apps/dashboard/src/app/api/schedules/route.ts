import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
} from "@/lib/api-utils";

// GET /api/schedules - 스케줄 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { page, pageSize, status, type, sortBy = "created_at", sortOrder = "desc" } =
      getQueryParams(request);

    let query = supabase.from("schedules").select("*", { count: "exact" });

    // 필터링
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (type && type !== "all") {
      query = query.eq("type", type);
    }

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

    const { name, type, config, video_ids } = body;

    if (!name) {
      return errorResponse("INVALID_REQUEST", "name이 필요합니다", 400);
    }
    if (!type || !["once", "interval", "cron"].includes(type)) {
      return errorResponse("INVALID_TYPE", "유효한 type이 필요합니다 (once, interval, cron)", 400);
    }
    if (!video_ids || !Array.isArray(video_ids)) {
      return errorResponse("INVALID_REQUEST", "video_ids가 필요합니다", 400);
    }

    // next_run_at 계산
    let nextRunAt: string | null = null;
    if (type === "once" && config?.run_at) {
      nextRunAt = config.run_at;
    } else if (type === "interval" && config?.interval_minutes) {
      nextRunAt = new Date(
        Date.now() + config.interval_minutes * 60 * 1000
      ).toISOString();
    }
    // cron의 경우 별도 계산 필요 (추후 구현)

    const scheduleData = {
      name,
      type,
      config: config || {},
      video_ids,
      video_count: video_ids.length,
      status: "active",
      last_run_at: null,
      next_run_at: nextRunAt,
      total_runs: 0,
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
