import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
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

    // Try FK join first, fallback to manual join if FK doesn't exist
    let data: Record<string, unknown>[] | null = null;
    let count: number | null = null;
    let usedFallback = false;

    // Build base filters
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const sortFieldMap: Record<string, string> = {
      "started_at": "started_at",
      "duration": "actual_watch_seconds",
    };
    const validApiSortFields = ["started_at", "duration"];
    const apiSortField = validApiSortFields.includes(sortBy) ? sortBy : "started_at";
    const dbSortField = sortFieldMap[apiSortField];

    // Attempt 1: FK join
    {
      let query = supabase.from("video_executions").select(
        `*, videos(title, thumbnail_url, channel_name)`,
        { count: "exact" }
      );
      if (status && status !== "all") query = query.eq("status", status);
      else query = query.in("status", ["completed", "failed", "cancelled"]);
      if (nodeId && nodeId !== "all") query = query.eq("node_id", nodeId);
      if (deviceId) query = query.eq("device_id", deviceId);
      if (videoId) query = query.eq("video_id", videoId);
      if (dateFrom) query = query.gte("started_at", dateFrom);
      if (dateTo) query = query.lte("started_at", dateTo);
      query = query.order(dbSortField, { ascending: sortOrder === "asc", nullsFirst: false });
      query = query.range(from, to);

      const result = await query;
      if (!result.error) {
        data = result.data;
        count = result.count;
      }
    }

    // Attempt 2: Manual join (no FK)
    if (data === null) {
      usedFallback = true;
      let query = supabase.from("video_executions").select("*", { count: "exact" });
      if (status && status !== "all") query = query.eq("status", status);
      else query = query.in("status", ["completed", "failed", "cancelled"]);
      if (nodeId && nodeId !== "all") query = query.eq("node_id", nodeId);
      if (deviceId) query = query.eq("device_id", deviceId);
      if (videoId) query = query.eq("video_id", videoId);
      if (dateFrom) query = query.gte("started_at", dateFrom);
      if (dateTo) query = query.lte("started_at", dateTo);
      query = query.order(dbSortField, { ascending: sortOrder === "asc", nullsFirst: false });
      query = query.range(from, to);

      const result = await query;
      if (result.error) {
        return errorResponse("DB_ERROR", result.error.message, 500);
      }
      data = result.data || [];
      count = result.count;

      // Fetch video info for matched executions
      const videoIds = [...new Set((data || []).map((e) => e.video_id as string).filter(Boolean))];
      if (videoIds.length > 0) {
        const { data: videos } = await supabase
          .from("videos")
          .select("id, title, thumbnail_url, channel_name")
          .in("id", videoIds);
        const videoMap = new Map((videos || []).map((v) => [v.id, v]));
        data = (data || []).map((exec) => ({
          ...exec,
          videos: videoMap.get(exec.video_id as string) || null,
        }));
      }
    }

    return paginatedResponse(data || [], count || 0, page, pageSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
