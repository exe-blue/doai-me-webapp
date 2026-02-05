import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
} from "@/lib/api-utils";

// GET /api/queue - 대기열 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const {
      page,
      pageSize,
      status,
      videoId,
      nodeId,
      sortBy = "created_at",
      sortOrder = "desc",
    } = getQueryParams(request);

    let query = supabase.from("video_executions").select("*, videos(title, thumbnail_url)", {
      count: "exact",
    });

    // 필터링
    if (status && status !== "all") {
      query = query.eq("status", status);
    } else {
      // 기본: 대기열 상태만 조회
      query = query.in("status", ["pending", "queued", "assigned"]);
    }
    if (videoId) {
      query = query.eq("video_id", videoId);
    }
    if (nodeId) {
      query = query.eq("node_id", nodeId);
    }

    // 정렬 (우선순위 우선, 그 다음 생성일)
    query = query.order("priority", { ascending: false }).order("created_at", {
      ascending: sortOrder === "asc",
    });

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

// POST /api/queue - 대기열에 추가
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json();

    const { video_ids, priority = 50, target_watch_seconds = 60, device_count = 1 } = body;

    if (!video_ids || !Array.isArray(video_ids) || video_ids.length === 0) {
      return errorResponse("INVALID_REQUEST", "video_ids가 필요합니다", 400);
    }

    // Validate device_count: must be integer between 1 and MAX_DEVICE_COUNT
    const MAX_DEVICE_COUNT = 10;
    const validDeviceCount = Math.min(Math.max(1, Math.floor(device_count) || 1), MAX_DEVICE_COUNT);
    
    if (device_count !== validDeviceCount) {
      console.warn(`[API] device_count clamped from ${device_count} to ${validDeviceCount}`);
    }

    const executions = [];
    for (const videoId of video_ids) {
      // 각 비디오당 validDeviceCount만큼 실행 생성
      for (let i = 0; i < validDeviceCount; i++) {
        executions.push({
          video_id: videoId,
          status: "pending",
          priority,
          target_watch_seconds,
          actual_watch_seconds: null,
          progress: 0,
          retry_count: 0,
          metadata: {},
        });
      }
    }

    const { data, error } = await supabase
      .from("video_executions")
      .insert(executions)
      .select();

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse({ queued: data?.length || 0 }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
