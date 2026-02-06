import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
  extractYouTubeVideoId,
} from "@/lib/api-utils";

// Escape special characters for LIKE pattern to prevent injection
function escapeLike(str: string): string {
  return str.replace(/[\\%_]/g, '\\$&');
}

// GET /api/videos - 영상 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const {
      page,
      pageSize,
      search,
      status,
      category,
      channelId,
      sortBy = "created_at",
      sortOrder = "desc",
    } = getQueryParams(request);

    // 기본 쿼리
    let query = supabase.from("videos").select("*", { count: "exact" });

    // 필터링
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (channelId) {
      query = query.eq("channel_id", channelId);
    }
    if (search) {
      const escapedSearch = escapeLike(search);
      query = query.or(`title.ilike.%${escapedSearch}%,channel_name.ilike.%${escapedSearch}%`);
    }

    // 정렬
    const validSortFields = ["created_at", "priority", "total_executions", "title"];
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

// POST /api/videos - 영상 추가
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "요청 본문이 유효한 JSON이 아닙니다", 400);
    }

    // 단일 영상 추가
    if (body.youtube_url) {
      const videoId = extractYouTubeVideoId(body.youtube_url);
      if (!videoId) {
        return errorResponse("INVALID_URL", "유효한 YouTube URL이 아닙니다", 400);
      }

      // 중복 확인 (DB에서 id가 YouTube Video ID임)
      const { data: existing, error: checkError } = await supabase
        .from("videos")
        .select("id")
        .eq("id", videoId)
        .maybeSingle();

      // Handle errors except PGRST116 (not found)
      if (checkError && checkError.code !== "PGRST116") {
        return errorResponse("DB_ERROR", checkError.message, 500);
      }

      if (existing) {
        return errorResponse("DUPLICATE", "이미 등록된 영상입니다", 409);
      }

      // 영상 메타데이터 - DB 스키마에 맞게 매핑
      // DB: id(YouTube ID), video_duration_sec, priority(text), watch_duration_sec
      const videoData = {
        id: videoId, // YouTube Video ID를 PK로 사용
        title: body.title || `Video ${videoId}`,
        channel_name: body.channel_name || "Unknown Channel",
        thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        video_duration_sec: body.duration_seconds || 0,
        watch_duration_sec: body.target_watch_seconds || 60,
        target_views: body.target_views || 100,
        completed_views: 0,
        failed_views: 0,
        prob_like: body.prob_like || 0,
        prob_comment: body.prob_comment || 0,
        prob_subscribe: body.prob_subscribe || 0,
        status: "active",
        priority: body.priority || "normal", // text: 'urgent', 'high', 'normal', 'low'
        tags: body.tags || [],
        metadata: {},
      };

      const { data, error } = await supabase
        .from("videos")
        .insert(videoData)
        .select()
        .single();

      if (error) {
        return errorResponse("DB_ERROR", error.message, 500);
      }

      return successResponse(data, 201);
    }

    // 벌크 추가
    if (body.youtube_urls && Array.isArray(body.youtube_urls)) {
      const results = { created: 0, failed: [] as string[] };

      for (const url of body.youtube_urls) {
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
          results.failed.push(url);
          continue;
        }

        const { data: existing } = await supabase
          .from("videos")
          .select("id")
          .eq("id", videoId)
          .single();

        if (existing) {
          results.failed.push(url);
          continue;
        }

        const videoData = {
          id: videoId,
          title: `Video ${videoId}`,
          channel_name: "Unknown Channel",
          thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          video_duration_sec: 0,
          watch_duration_sec: body.target_watch_seconds || 60,
          target_views: 100,
          completed_views: 0,
          failed_views: 0,
          prob_like: 0,
          prob_comment: 0,
          prob_subscribe: 0,
          status: "active",
          priority: body.priority || "normal",
          tags: [],
          metadata: {},
        };

        const { error } = await supabase.from("videos").insert(videoData);

        if (error) {
          results.failed.push(url);
        } else {
          results.created++;
        }
      }

      return successResponse(results, 201);
    }

    return errorResponse("INVALID_REQUEST", "youtube_url 또는 youtube_urls가 필요합니다", 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
