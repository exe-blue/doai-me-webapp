import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
  extractYouTubeChannelId,
} from "@/lib/api-utils";

// Escape special characters for LIKE pattern to prevent injection
function escapeLike(str: string): string {
  return str.replace(/[\\%_]/g, '\\$&');
}

// GET /api/channels - 채널 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { page, pageSize, search, status, sortBy = "created_at", sortOrder = "desc" } =
      getQueryParams(request);

    let query = supabase.from("channels").select("*", { count: "exact" });

    // 필터링
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (search) {
      const escapedSearch = escapeLike(search);
      query = query.or(`name.ilike.%${escapedSearch}%,handle.ilike.%${escapedSearch}%`);
    }

    // 정렬
    const validSortFields = ["created_at", "name", "subscriber_count", "video_count"];
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

// POST /api/channels - 채널 추가
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json();

    const channelId = extractYouTubeChannelId(body.youtube_url);
    if (!channelId) {
      return errorResponse("INVALID_URL", "유효한 YouTube 채널 URL이 아닙니다", 400);
    }

    // 중복 확인 - use maybeSingle to properly handle "not found" vs real errors
    const { data: existing, error: checkError } = await supabase
      .from("channels")
      .select("id")
      .eq("youtube_id", channelId)
      .maybeSingle();

    // Handle real DB errors (not just "not found")
    if (checkError && checkError.code !== "PGRST116") {
      return errorResponse("DB_ERROR", checkError.message, 500);
    }

    if (existing) {
      return errorResponse("DUPLICATE", "이미 등록된 채널입니다", 409);
    }

    const channelData = {
      youtube_id: channelId,
      name: body.name || `Channel ${channelId}`,
      handle: body.handle || null,
      thumbnail_url: body.thumbnail_url || "",
      subscriber_count: 0,
      video_count: 0,
      auto_collect: body.auto_collect ?? false,
      last_collected_at: null,
      status: "active",
    };

    const { data, error } = await supabase
      .from("channels")
      .insert(channelData)
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
