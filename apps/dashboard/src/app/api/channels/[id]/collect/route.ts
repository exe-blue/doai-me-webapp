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

// POST /api/channels/[id]/collect - 채널의 최신 영상 수집
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: channelId } = await params;

  if (!YOUTUBE_API_KEY) {
    return errorResponse(
      "CONFIG_ERROR",
      "YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다",
      500
    );
  }

  try {
    const supabase = getServerClient();

    // 1. 채널 정보 확인
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id, name, handle, default_watch_duration_sec, default_prob_like, default_prob_comment, default_prob_subscribe, video_count")
      .eq("id", channelId)
      .single();

    if (channelError || !channel) {
      return errorResponse("NOT_FOUND", "채널을 찾을 수 없습니다", 404);
    }

    // 2. YouTube API로 최신 영상 검색
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&maxResults=10&order=date&type=video&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });

    if (!searchRes.ok) {
      const err = await searchRes.text();
      console.error("YouTube Search API error:", err);
      return errorResponse("YOUTUBE_API_ERROR", "YouTube API 요청 실패", 502);
    }

    const searchData = await searchRes.json();
    const items: YouTubeSearchItem[] = searchData.items || [];

    if (items.length === 0) {
      // 채널의 last_collected_at 업데이트
      await supabase
        .from("channels")
        .update({ last_collected_at: new Date().toISOString() })
        .eq("id", channelId);

      return successResponse({ collected: 0, message: "수집할 영상이 없습니다" });
    }

    // 3. 영상 상세 정보 가져오기 (duration)
    const videoIds = items.map((item) => item.id.videoId).join(",");
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoIds)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;
    const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(10000) });

    if (!detailRes.ok) {
      const err = await detailRes.text();
      console.error("YouTube Videos API error:", err);
      return errorResponse("YOUTUBE_API_ERROR", "YouTube 영상 상세정보 API 요청 실패", 502);
    }

    const detailData = await detailRes.json();
    const durationMap = new Map<string, number>();

    if (detailData.items) {
      detailData.items.forEach((v: YouTubeVideoItem) => {
        durationMap.set(v.id, parseDuration(v.contentDetails.duration));
      });
    }

    // 4. videos 테이블에 upsert
    const videosToInsert = items.map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel_id: channelId,
      channel_name: item.snippet.channelTitle || channel.name,
      thumbnail_url:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
      video_duration_sec: durationMap.get(item.id.videoId) || 0,
      watch_duration_sec: channel.default_watch_duration_sec || 60,
      prob_like: channel.default_prob_like || 0,
      prob_comment: channel.default_prob_comment || 0,
      prob_subscribe: channel.default_prob_subscribe || 0,
      status: "active",
      priority: "normal",
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("videos")
      .upsert(videosToInsert, { onConflict: "id", ignoreDuplicates: true })
      .select("id");

    if (insertError) {
      console.error("Video insert error:", insertError);
      return errorResponse("DB_ERROR", insertError.message, 500);
    }

    // 5. 채널 last_collected_at 업데이트
    await supabase
      .from("channels")
      .update({
        last_collected_at: new Date().toISOString(),
        video_count: ((channel.video_count as number) ?? 0) + (inserted?.length || 0),
      })
      .eq("id", channelId);

    return successResponse({
      collected: inserted?.length || 0,
      total_found: items.length,
      message: `${inserted?.length || 0}개의 영상이 수집되었습니다`,
    });
  } catch (err) {
    console.error("Channel collect error:", err);
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}
