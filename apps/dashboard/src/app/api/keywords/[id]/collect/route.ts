import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelId: string;
    channelTitle: string;
    thumbnails: { medium?: { url: string }; high?: { url: string } };
    publishedAt: string;
  };
}

interface YouTubeVideoItem {
  id: string;
  contentDetails: { duration: string };
  statistics?: { viewCount: string };
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (
    parseInt(match[1] || "0") * 3600 +
    parseInt(match[2] || "0") * 60 +
    parseInt(match[3] || "0")
  );
}

// POST /api/keywords/[id]/collect - 키워드로 YouTube 영상 검색 및 수집
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!YOUTUBE_API_KEY) {
    return errorResponse(
      "CONFIG_ERROR",
      "YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다",
      500
    );
  }

  try {
    const supabase = getServerClient();

    // 1. 키워드 정보 확인
    const { data: kw, error: kwError } = await supabase
      .from("keywords")
      .select("*")
      .eq("id", parseInt(id))
      .single();

    if (kwError || !kw) {
      return errorResponse("NOT_FOUND", "키워드를 찾을 수 없습니다", 404);
    }

    // 2. YouTube API로 영상 검색
    const maxResults = Math.min(kw.max_results || 10, 50);
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(kw.keyword)}&maxResults=${maxResults}&order=relevance&type=video&key=${YOUTUBE_API_KEY}`;
    const searchRes = await fetch(searchUrl);

    if (!searchRes.ok) {
      const err = await searchRes.text();
      console.error("YouTube Search API error:", err);
      return errorResponse("YOUTUBE_API_ERROR", "YouTube API 요청 실패", 502);
    }

    const searchData = await searchRes.json();
    const items: YouTubeSearchItem[] = searchData.items || [];

    if (items.length === 0) {
      await supabase
        .from("keywords")
        .update({ last_collected_at: new Date().toISOString() })
        .eq("id", kw.id);
      return successResponse({ collected: 0, message: "검색 결과가 없습니다" });
    }

    // 3. 영상 상세 정보 (duration, viewCount)
    const videoIds = items.map((item) => item.id.videoId).join(",");
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
    const detailRes = await fetch(detailUrl);

    if (!detailRes.ok) {
      const err = await detailRes.text();
      console.error("YouTube Videos API error:", err);
      return errorResponse("YOUTUBE_API_ERROR", "YouTube 영상 상세정보 API 요청 실패", 502);
    }

    const detailData = await detailRes.json();

    const videoDetails = new Map<string, { duration: number; views: number }>();
    if (detailData.items) {
      detailData.items.forEach((v: YouTubeVideoItem) => {
        videoDetails.set(v.id, {
          duration: parseDuration(v.contentDetails.duration),
          views: parseInt(v.statistics?.viewCount || "0"),
        });
      });
    }

    // 4. 필터링: min_views, min/max_duration, exclude_keywords
    const excludeWords: string[] = kw.exclude_keywords || [];
    const filtered = items.filter((item) => {
      const detail = videoDetails.get(item.id.videoId);
      if (!detail) return false;

      // 조회수 필터
      if (kw.min_views > 0 && detail.views < kw.min_views) return false;

      // 길이 필터
      if (kw.min_duration_sec > 0 && detail.duration < kw.min_duration_sec)
        return false;
      if (kw.max_duration_sec > 0 && detail.duration > kw.max_duration_sec)
        return false;

      // 제외 키워드
      if (excludeWords.length > 0) {
        const title = item.snippet.title.toLowerCase();
        if (excludeWords.some((ex) => title.includes(ex.toLowerCase())))
          return false;
      }

      return true;
    });

    // 5. videos 테이블에 upsert
    const videosToInsert = filtered.map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel_id: item.snippet.channelId,
      channel_name: item.snippet.channelTitle,
      thumbnail_url:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
      video_duration_sec: videoDetails.get(item.id.videoId)?.duration || 0,
      search_keyword: kw.keyword,
      status: "active",
      priority: "normal",
    }));

    if (videosToInsert.length === 0) {
      await supabase
        .from("keywords")
        .update({ last_collected_at: new Date().toISOString() })
        .eq("id", kw.id);
      return successResponse({
        collected: 0,
        total_found: items.length,
        message: "필터 조건에 맞는 영상이 없습니다",
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("videos")
      .upsert(videosToInsert, { onConflict: "id", ignoreDuplicates: true })
      .select("id");

    if (insertError) {
      console.error("Video insert error:", insertError);
      return errorResponse("DB_ERROR", insertError.message, 500);
    }

    // 6. 키워드 통계 업데이트
    await supabase
      .from("keywords")
      .update({
        last_collected_at: new Date().toISOString(),
        discovered_count: (kw.discovered_count || 0) + (inserted?.length || 0),
        used_count: (kw.used_count || 0) + 1,
      })
      .eq("id", kw.id);

    return successResponse({
      collected: inserted?.length || 0,
      total_found: items.length,
      filtered_count: filtered.length,
      message: `${inserted?.length || 0}개의 영상이 수집되었습니다`,
    });
  } catch (err) {
    console.error("Keyword collect error:", err);
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
