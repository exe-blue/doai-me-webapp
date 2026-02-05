import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
} from "@/lib/api-utils";

// GET /api/executions - 실행 이력 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const {
      page,
      pageSize,
      status,
      nodeId,
      deviceId,
      videoId,
      dateFrom,
      dateTo,
      sortBy = "started_at",
      sortOrder = "desc",
    } = getQueryParams(request);

    let query = supabase.from("video_executions").select(
      `*,
      videos(title, thumbnail_url, channel_name)`,
      { count: "exact" }
    );

    // 완료된 실행만 조회 (기본)
    if (status && status !== "all") {
      query = query.eq("status", status);
    } else {
      query = query.in("status", ["completed", "failed", "cancelled"]);
    }

    if (nodeId && nodeId !== "all") {
      query = query.eq("node_id", nodeId);
    }
    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }
    if (videoId) {
      query = query.eq("video_id", videoId);
    }
    if (dateFrom) {
      query = query.gte("started_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("started_at", dateTo);
    }

    // 정렬
    const validSortFields = ["started_at", "completed_at", "actual_watch_seconds"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "started_at";
    query = query.order(sortField, { ascending: sortOrder === "asc", nullsFirst: false });

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
