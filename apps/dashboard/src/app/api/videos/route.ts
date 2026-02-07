import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
  extractYouTubeVideoId,
} from "@/lib/api-utils";
import OpenAI from 'openai';

// Escape special characters for LIKE pattern to prevent injection
function escapeLike(str: string): string {
  return str.replace(/[\\%_]/g, '\\$&');
}

// Server-side OpenAI client for auto comment generation
function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/**
 * Auto-generate AI comments using the 2x Rule
 */
async function autoGenerateComments(
  videoTitle: string,
  targetCount: number,
  probComment: number
): Promise<string[]> {
  const openai = getOpenAI();
  if (!openai) return [];

  const rawQuantity = Math.ceil(targetCount * (probComment / 100) * 2);
  const quantity = Math.max(5, Math.min(rawQuantity, 200));

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a witty Korean YouTube viewer. Output ONLY a JSON object with a "comments" key containing an array of strings.',
        },
        {
          role: 'user',
          content: `Generate ${quantity} natural, unique YouTube comments for "${videoTitle}".
Rules: 한국어, 10~80자, 중복 없이 다양하게, 봇처럼 보이지 않게.
Output: {"comments": ["댓글1", ...]}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.9,
      max_tokens: 4000,
    });

    const content = completion.choices[0].message.content;
    if (!content) return [];
    const parsed = JSON.parse(content);
    return (parsed.comments || [])
      .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c: string) => c.trim());
  } catch (error) {
    console.error('[Videos] AI comment generation failed:', error);
    return [];
  }
}

/**
 * 영상 등록 후 자동 시청 명령 생성
 * - 온라인 기기를 PC별 최대 20대씩 배정
 * - prob_comment > 0이면 AI 댓글 자동 생성 (2x Rule)
 */
async function createAutoWatchJob(
  supabase: ReturnType<typeof getServerClient>,
  videoData: {
    id: string;
    title: string;
    channel_name: string;
    video_duration_sec: number;
    watch_duration_sec: number;
    target_views: number;
    prob_like: number;
    prob_comment: number;
    prob_subscribe: number;
    prob_playlist: number;
    keyword: string;
  }
): Promise<{ jobId: string; assignedCount: number; commentCount: number } | null> {
  try {
    // 1. 온라인 기기 조회
    const { data: onlineDevices, error: devErr } = await supabase
      .from('devices')
      .select('id, serial_number, pc_id')
      .eq('status', 'online')
      .not('last_heartbeat', 'is', null);

    if (devErr || !onlineDevices || onlineDevices.length === 0) {
      console.log('[Videos] No online devices, skipping auto job creation');
      return null;
    }

    // 2. PC별 최대 20대씩 그룹핑
    const devicesByPc = new Map<string, typeof onlineDevices>();
    for (const device of onlineDevices) {
      const pcId = device.pc_id || 'unknown';
      const group = devicesByPc.get(pcId) || [];
      if (group.length < 20) {
        group.push(device);
      }
      devicesByPc.set(pcId, group);
    }
    const targetDevices = Array.from(devicesByPc.values()).flat();

    if (targetDevices.length === 0) return null;

    // 3. Job 생성
    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const displayName = `${yy}${mm}${dd}-${(videoData.channel_name || 'VID').slice(0, 5)}-A`;

    const cleanUrl = `https://www.youtube.com/watch?v=${videoData.id}`;

    const jobPayload = {
      title: videoData.title,
      display_name: displayName,
      type: 'VIDEO_URL',
      target_url: cleanUrl,
      duration_sec: videoData.watch_duration_sec || videoData.video_duration_sec || 60,
      duration_min_pct: 30,
      duration_max_pct: 90,
      prob_like: videoData.prob_like,
      prob_comment: videoData.prob_comment,
      prob_playlist: videoData.prob_playlist,
      script_type: 'youtube_watch',
      is_active: true,
      status: 'active',
      target_type: 'all_devices',
      target_value: targetDevices.length,
      total_assignments: targetDevices.length,
      assigned_count: targetDevices.length,
      completed_count: 0,
      failed_count: 0,
      priority: false,
    };

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .insert(jobPayload)
      .select()
      .single();

    if (jobErr || !job) {
      console.error('[Videos] Auto job creation failed:', jobErr);
      return null;
    }

    // 4. AI 댓글 자동 생성 (prob_comment > 0)
    let commentCount = 0;
    if (videoData.prob_comment > 0) {
      const aiComments = await autoGenerateComments(
        videoData.title,
        videoData.target_views,
        videoData.prob_comment
      );
      if (aiComments.length > 0) {
        const commentRecords = aiComments.map((content: string) => ({
          job_id: job.id,
          content,
          is_used: false,
        }));
        const { error: cmtErr } = await supabase.from('comments').insert(commentRecords);
        if (!cmtErr) commentCount = aiComments.length;
      }
    }

    // 5. Assignment 생성
    const assignments = targetDevices.map((device) => ({
      job_id: job.id,
      device_id: device.id,
      device_serial: device.serial_number,
      status: 'pending',
      progress_pct: 0,
      assigned_at: new Date().toISOString(),
    }));

    await supabase.from('job_assignments').insert(assignments);

    console.log(`[Videos] Auto job created: ${job.id}, ${targetDevices.length} devices, ${commentCount} comments`);
    return { jobId: job.id, assignedCount: targetDevices.length, commentCount };
  } catch (error) {
    console.error('[Videos] Auto job creation error:', error);
    return null;
  }
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
      const videoTitle = body.title || `Video ${videoId}`;
      const videoData = {
        id: videoId, // YouTube Video ID를 PK로 사용
        title: videoTitle,
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
        prob_playlist: body.prob_playlist || 0,
        // 검색 키워드: 별도 지정 없으면 제목과 동일
        keyword: body.keyword || videoTitle,
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

      // 자동 시청 명령 생성 (auto_watch=false가 아닌 경우)
      let autoJob = null;
      if (body.auto_watch !== false) {
        autoJob = await createAutoWatchJob(supabase, {
          id: videoId,
          title: videoData.title,
          channel_name: videoData.channel_name,
          video_duration_sec: videoData.video_duration_sec,
          watch_duration_sec: videoData.watch_duration_sec,
          target_views: videoData.target_views,
          prob_like: videoData.prob_like,
          prob_comment: videoData.prob_comment,
          prob_subscribe: videoData.prob_subscribe,
          prob_playlist: videoData.prob_playlist,
          keyword: videoData.keyword,
        });
      }

      return successResponse({ ...data, auto_job: autoJob }, 201);
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

        const bulkTitle = `Video ${videoId}`;
        const videoData = {
          id: videoId,
          title: bulkTitle,
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
          prob_playlist: 0,
          keyword: bulkTitle,
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
