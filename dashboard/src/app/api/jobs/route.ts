import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Server-side Supabase client with service role
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key);
}

// Server-side OpenAI client for auto comment generation
function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/**
 * Auto-generate AI comments using the 2x Rule
 * Formula: Math.ceil(target_count * (prob_comment / 100) * 2), minimum 5
 */
async function autoGenerateComments(
  videoTitle: string,
  targetCount: number,
  probComment: number
): Promise<string[]> {
  const openai = getOpenAI();
  if (!openai) {
    console.warn('[API] OPENAI_API_KEY not set - skipping auto comment generation');
    return [];
  }

  // 2x Rule: quantity = ceil(target * prob% * 2), min 5
  const rawQuantity = Math.ceil(targetCount * (probComment / 100) * 2);
  const quantity = Math.max(5, Math.min(rawQuantity, 200)); // min 5, max 200

  console.log(`[API] Auto-generating ${quantity} comments (target=${targetCount}, prob=${probComment}%, raw=${rawQuantity})`);

  const toneGuide = '다양한 반응 (긍정, 감탄, 질문, 공감 등) 골고루 섞기.';

  const batchSize = 50;
  const allComments: string[] = [];

  for (let i = 0; i < quantity; i += batchSize) {
    const batchCount = Math.min(batchSize, quantity - i);
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a witty Korean YouTube viewer. Output ONLY a JSON object with a "comments" key containing an array of strings. No other text.',
            },
            {
              role: 'user',
              content: `Generate ${batchCount} natural, unique YouTube comments for a video titled "${videoTitle}".

Rules:
- ${toneGuide}
- 한국어로 작성. 반말/존댓말 자연스럽게 섞기.
- 각 댓글은 10~80자 사이
- 중복되거나 비슷한 댓글 없이 다양하게
- 봇처럼 보이지 않도록 자연스러운 구어체 포함
- 댓글 앞에 번호 붙이지 말 것

Output format: {"comments": ["댓글1", "댓글2", ...]}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.9,
          max_tokens: 4000,
        });

        const content = completion.choices[0].message.content;
        if (!content) break;

        const parsed = JSON.parse(content);
        const batch: string[] = (parsed.comments || parsed.data || (Array.isArray(parsed) ? parsed : []))
          .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c: string) => c.trim());

        allComments.push(...batch);
        break; // success, exit retry loop
      } catch (error: unknown) {
        const isRateLimit = error instanceof Error && ('status' in error && (error as { status: number }).status === 429);
        if (isRateLimit && retries < maxRetries) {
          const delay = Math.pow(2, retries) * 1000; // 1s, 2s backoff
          console.warn(`[API] OpenAI rate limited, retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
        } else {
          console.error(`[API] Batch ${Math.floor(i / batchSize) + 1} failed:`, error instanceof Error ? error.message : error);
          break; // skip this batch, keep partial results
        }
      }
    }
  }

  console.log(`[API] Auto-generated ${allComments.length}/${quantity} comments for "${videoTitle?.slice(0, 30)}..."`);
  return allComments;
}

// GET /api/jobs - 작업 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status'); // active, paused, completed, cancelled
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('jobs')
      .select('*', { count: 'exact' })
      .order('priority', { ascending: false })  // Priority jobs first
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 상태 필터
    if (status) {
      query = query.eq('status', status);
    } else {
      // 기본: 활성/일시정지 작업만
      query = query.in('status', ['active', 'paused']);
    }

    const { data: jobs, error, count } = await query;

    if (error) {
      console.error('[API] Jobs query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 각 작업별 실시간 assignment 통계 및 댓글 수 조회
    const jobsWithStats = await Promise.all(
      (jobs || []).map(async (job) => {
        // Assignment 통계
        const { data: stats } = await supabase
          .from('job_assignments')
          .select('status')
          .eq('job_id', job.id);

        const statusCounts = {
          pending: 0,
          paused: 0,
          running: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        };

        (stats || []).forEach((a) => {
          if (a.status in statusCounts) {
            statusCounts[a.status as keyof typeof statusCounts]++;
          }
        });

        // 댓글 수 조회
        const { count: commentCount } = await supabase
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('job_id', job.id);

        return {
          ...job,
          stats: statusCounts,
          total_assigned: (stats || []).length,
          comment_count: commentCount || 0,
        };
      })
    );

    return NextResponse.json({
      jobs: jobsWithStats,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[API] Jobs GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate job display name in format: YYMMDD-{ChannelShort}-{Source}
 * @param channelName - 채널명 (예: "짐승남", "YouTube Channel")
 * @param source - 'A' (Auto) or 'N' (Normal/Manual)
 * @returns display name like "260130-짐승남-N"
 */
function generateJobDisplayName(channelName: string, source: 'A' | 'N' = 'N'): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');

  // Channel short: 첫 3글자 또는 전체 (3자 미만인 경우)
  const channelShort = channelName.slice(0, 5) || 'JOB';

  return `${yy}${mm}${dd}-${channelShort}-${source}`;
}

/**
 * Extract channel name from YouTube URL (simple heuristic)
 * In production, would use YouTube API
 */
function extractChannelHint(url: string, title?: string): string {
  // If title provided, use first meaningful word
  if (title && title.trim()) {
    const words = title.trim().split(/\s+/);
    return words[0].slice(0, 5) || 'JOB';
  }

  // Fallback: use part of video ID or generic
  const match = url.match(/[?&]v=([^&]+)/);
  if (match) {
    return match[1].slice(0, 4).toUpperCase();
  }

  return 'VIDEO';
}

// POST /api/jobs - 새 작업 생성 + 자동 분배
// Supports two modes:
// 1. VIDEO_URL: 단일 영상 URL 직접 재생
// 2. CHANNEL_AUTO: 채널 등록 (백엔드가 주기적으로 최신 영상 자동 생성)
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    const {
      title,
      channel_name,  // Optional: 채널명 (없으면 자동 추출)
      display_name: customDisplayName,  // Custom display name from frontend
      source_type = 'N',  // 'A' (Auto) or 'N' (Normal/Manual)
      job_type = 'VIDEO_URL',  // 'VIDEO_URL' or 'CHANNEL_AUTO'
      target_url,
      video_url,  // Frontend sends video_url for VIDEO_URL mode
      channel_url,  // For CHANNEL_AUTO mode
      duration_sec = 60,
      watch_duration_min,  // New: min watch duration in seconds
      watch_duration_max,  // New: max watch duration in seconds
      target_type = 'all_devices',
      target_value = 100,
      target_views,  // New: frontend sends target_views instead of target_value
      prob_like = 0,
      prob_comment = 0,
      prob_subscribe = 0,  // New: subscribe probability
      prob_playlist = 0,
      script_type = 'youtube_watch',
      priority = false,  // Priority flag for queue ordering
      comments = [],  // 댓글 목록 (배열 또는 줄바꿈 문자열)
    } = body;

    // Normalize video URL: frontend uses video_url, backend expects target_url
    const effectiveTargetUrl = target_url || video_url;

    // Normalize target value: frontend uses target_views, backend expects target_value
    const effectiveTargetValue = target_views || target_value;

    // YouTube URL 검증 패턴
    // youtu.be 단축 URL은 경로에 바로 video ID가 오므로 별도 처리
    const youtubeVideoRegex = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/[a-zA-Z0-9_-]+|m\.youtube\.com\/(watch\?v=|shorts\/|embed\/|v\/))/i;
    const youtubeChannelRegex = /^https?:\/\/(www\.)?(youtube\.com)\/(channel\/|c\/|@|user\/)/i;

    // 모드별 검증
    if (job_type === 'CHANNEL_AUTO') {
      // 채널 모드: channel_url 필수
      if (!channel_url) {
        return NextResponse.json(
          { error: 'channel_url is required for CHANNEL_AUTO mode' },
          { status: 400 }
        );
      }
      if (!youtubeChannelRegex.test(channel_url)) {
        return NextResponse.json(
          { error: 'Invalid YouTube Channel URL' },
          { status: 400 }
        );
      }
    } else {
      // VIDEO_URL 모드: target_url or video_url 필수
      if (!effectiveTargetUrl) {
        return NextResponse.json(
          { error: 'target_url or video_url is required' },
          { status: 400 }
        );
      }
      if (!youtubeVideoRegex.test(effectiveTargetUrl)) {
        return NextResponse.json(
          { error: 'Invalid YouTube Video URL' },
          { status: 400 }
        );
      }
    }

    // 1. 연결된 idle 기기 조회
    const { data: idleDevices, error: devicesError } = await supabase
      .from('devices')
      .select('id, serial_number, pc_id')
      .eq('status', 'idle')
      .not('last_seen_at', 'is', null);

    if (devicesError) {
      console.error('[API] Devices query error:', devicesError);
      return NextResponse.json(
        { error: 'Failed to fetch devices' },
        { status: 500 }
      );
    }

    // 연결된 기기가 없어도 작업은 생성 (나중에 기기 연결 시 할당)
    const hasIdleDevices = idleDevices && idleDevices.length > 0;

    // 2. 목표에 따라 할당 대상 결정
    let targetDevices: typeof idleDevices = [];
    
    if (hasIdleDevices) {
      targetDevices = [...(idleDevices || [])];

      if (target_type === 'percentage') {
        const count = Math.ceil((idleDevices!.length * effectiveTargetValue) / 100);
        targetDevices = idleDevices!.slice(0, count);
      } else if (target_type === 'device_count') {
        targetDevices = idleDevices!.slice(0, Math.min(effectiveTargetValue, idleDevices!.length));
      }
      // target_type === 'all_devices' 는 전체 사용
    }

    // 3. 채널 모드 처리 (CHANNEL_AUTO)
    let channelRecord = null;
    if (job_type === 'CHANNEL_AUTO') {
      // 채널 ID 추출 (YouTube URL에서)
      const channelIdMatch = channel_url.match(/\/(channel\/|c\/|@|user\/)([^/?]+)/);
      const channelId = channelIdMatch ? channelIdMatch[2] : channel_url;

      // 채널 등록 또는 조회
      const { data: existingChannel } = await supabase
        .from('channels')
        .select('*')
        .eq('channel_id', channelId)
        .single();

      if (existingChannel) {
        channelRecord = existingChannel;
        // 기존 채널 활성화 및 이름 업데이트
        await supabase
          .from('channels')
          .update({
            is_active: true,
            updated_at: new Date().toISOString(),
            channel_name: customDisplayName || channel_name || existingChannel.channel_name,
          })
          .eq('id', existingChannel.id);
      } else {
        // 새 채널 등록
        const { data: newChannel, error: channelError } = await supabase
          .from('channels')
          .insert({
            channel_id: channelId,
            channel_name: customDisplayName || channel_name || channelId,
            channel_url: channel_url,
            is_active: true,
            default_duration_sec: watch_duration_max || duration_sec,
            default_prob_like: prob_like,
            default_prob_comment: prob_comment,
            default_prob_subscribe: prob_subscribe || 0,
            default_prob_playlist: prob_playlist,
          })
          .select()
          .single();

        if (channelError) {
          console.error('[API] Channel creation error:', channelError);
          return NextResponse.json(
            { error: 'Failed to register channel' },
            { status: 500 }
          );
        }
        channelRecord = newChannel;
      }

      // 채널 모드는 즉시 작업을 생성하지 않음 - 백엔드 스케줄러가 처리
      return NextResponse.json({
        success: true,
        mode: 'CHANNEL_AUTO',
        channel: channelRecord,
        message: '채널이 등록되었습니다. 새 영상이 감지되면 자동으로 작업이 생성됩니다.',
      });
    }

    // 4. VIDEO_URL 모드: 작업 생성
    // Generate display name: YYMMDD-{Channel}-{Source} or use custom name
    const channelHint = channel_name || extractChannelHint(effectiveTargetUrl, title);
    const displayName = customDisplayName || generateJobDisplayName(channelHint, source_type as 'A' | 'N');

    // Calculate effective duration settings
    const effectiveDurationSec = watch_duration_max || duration_sec;
    const effectiveDurationMinPct = watch_duration_min && watch_duration_max
      ? Math.round((watch_duration_min / watch_duration_max) * 100)
      : 80;

    // jobs 테이블에 INSERT할 데이터
    // 기본 스키마 + 마이그레이션으로 추가된 컬럼 모두 포함
    const jobData = {
      title: title || `YouTube Job ${new Date().toLocaleString('ko-KR')}`,
      target_url: effectiveTargetUrl,
      duration_sec: effectiveDurationSec,
      duration_min_pct: effectiveDurationMinPct,
      duration_max_pct: 100,
      prob_like,
      prob_comment,
      prob_playlist,
      script_type,
      is_active: true,
      total_assignments: targetDevices.length,
      // 마이그레이션 컬럼 (002_job_system.sql, 003_channel_comment_system.sql 필요)
      display_name: displayName,
      type: 'VIDEO_URL',
      status: 'active',
      target_type,
      target_value: effectiveTargetValue,
      assigned_count: targetDevices.length,
      completed_count: 0,
      failed_count: 0,
      priority: priority || false,
    };

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert(jobData)
      .select()
      .single();

    if (jobError || !job) {
      console.error('[API] Job creation error:', jobError);
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      );
    }

    // 5. 댓글 풀 생성
    // Handle both array and string input from user
    let commentLines: string[] = [];
    if (Array.isArray(comments)) {
      commentLines = comments
        .map((c: string) => (typeof c === 'string' ? c.trim() : ''))
        .filter((c: string) => c.length > 0);
    } else if (typeof comments === 'string' && comments.trim()) {
      commentLines = comments
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    }

    // 5-1. Auto AI Comment Generation (2x Rule)
    // If no manual comments provided AND prob_comment > 0, auto-generate
    let generatedCommentCount = 0;
    const isAutoGenerated = commentLines.length === 0 && prob_comment > 0;

    if (isAutoGenerated) {
      const videoTitle = title || 'YouTube Video';
      const aiComments = await autoGenerateComments(
        videoTitle,
        effectiveTargetValue,
        prob_comment
      );
      if (aiComments.length > 0) {
        commentLines = aiComments;
        generatedCommentCount = aiComments.length;
        console.log(`[API] AI auto-generated ${generatedCommentCount} comments for job ${job.id}`);
      }
    }

    // 5-2. Insert comments into DB (manual or AI-generated)
    let insertedCommentCount = 0;
    if (commentLines.length > 0) {
      const commentRecords = commentLines.map((content: string) => ({
        job_id: job.id,
        content,
        is_used: false,
      }));

      const { error: commentError } = await supabase
        .from('comments')
        .insert(commentRecords);

      if (commentError) {
        console.error('[API] Comments insertion error:', commentError);
        // 댓글 삽입 실패해도 작업은 계속 진행
      } else {
        insertedCommentCount = commentLines.length;
        console.log(`[API] ${insertedCommentCount} comments inserted for job ${job.id}`);
      }
    }

    // 6. Assignment 생성 (bulk insert)
    const assignments = targetDevices.map((device) => ({
      job_id: job.id,
      device_id: device.id,
      device_serial: device.serial_number,
      status: 'pending',
      progress_pct: 0,
      assigned_at: new Date().toISOString(),
    }));

    const { data: createdAssignments, error: assignError } = await supabase
      .from('job_assignments')
      .insert(assignments)
      .select();

    if (assignError) {
      console.error('[API] Assignment creation error:', assignError);
      // 작업은 생성됐지만 할당 실패 - 부분 성공으로 처리
    }

    // 7. Socket.io로 Worker에게 전송 (서버 사이드에서는 직접 불가 - 클라이언트가 처리)
    // 대신 응답에 assignments 포함하여 클라이언트가 Socket으로 전송할 수 있게 함

    return NextResponse.json({
      success: true,
      job,
      commentCount: insertedCommentCount,
      generatedCommentCount,
      isAutoGenerated,
      assignments: createdAssignments || [],
      stats: {
        total_devices: idleDevices.length,
        assigned_devices: targetDevices.length,
        comments_count: insertedCommentCount,
      },
    });
  } catch (error) {
    console.error('[API] Jobs POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
