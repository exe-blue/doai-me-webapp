import { NextRequest, NextResponse } from 'next/server';

// YouTube Video ID 추출 정규식
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  // Video ID 추출
  const match = url.match(YOUTUBE_REGEX);
  if (!match) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  const videoId = match[1];
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    // API 키 없으면 기본 정보만 반환
    return NextResponse.json({
      videoId,
      title: 'YouTube Video',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      thumbnailMedium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      channelTitle: 'Unknown Channel',
      duration: null
    });
  }

  try {
    // YouTube Data API 호출
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`;
    const response = await fetch(apiUrl);
    
    // HTTP 응답 상태 확인 (2xx 범위만 성공으로 처리)
    if (!response.ok) {
      let errorDetail: string;
      try {
        const errorBody = await response.json();
        errorDetail = errorBody?.error?.message || JSON.stringify(errorBody);
      } catch {
        try {
          errorDetail = await response.text();
        } catch {
          errorDetail = `HTTP ${response.status}`;
        }
      }
      console.error('YouTube API 오류:', errorDetail);
      return NextResponse.json(
        { error: 'YouTube API 요청 실패', details: errorDetail },
        { status: response.status }
      );
    }
    
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;

    // ISO 8601 duration을 초로 변환
    const duration = parseDuration(contentDetails?.duration);

    return NextResponse.json({
      videoId,
      title: snippet.title,
      description: snippet.description?.substring(0, 200),
      thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      thumbnailMedium: snippet.thumbnails?.medium?.url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      channelTitle: snippet.channelTitle,
      channelId: snippet.channelId,
      publishedAt: snippet.publishedAt,
      duration, // 초 단위
      durationFormatted: formatDuration(duration)
    });

  } catch (error) {
    console.error('YouTube API Error:', error);
    // 에러 시에도 기본 정보 반환
    return NextResponse.json({
      videoId,
      title: 'YouTube Video',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      thumbnailMedium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      channelTitle: 'Unknown Channel',
      duration: null
    });
  }
}

// ISO 8601 Duration을 초로 변환 (PT1H2M3S -> 3723)
function parseDuration(duration: string | undefined): number | null {
  if (!duration) return null;
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// 초를 MM:SS 또는 HH:MM:SS로 변환
function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
