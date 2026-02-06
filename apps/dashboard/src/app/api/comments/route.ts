import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key);
}

// GET /api/comments?job_id=xxx - 미사용 댓글 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    const jobId = searchParams.get('job_id');
    const deviceId = searchParams.get('device_id');
    const videoId = searchParams.get('video_id');

    // Support video_id: look up most recent job for this video
    if (videoId && !jobId) {
      const { data: job } = await supabase
        .from('jobs')
        .select('id')
        .eq('video_id', videoId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!job) {
        return NextResponse.json({ success: true, comments: [], total_unused: 0 });
      }

      // Query comments for this job
      const showAll = searchParams.get('all') === 'true';
      let query = supabase
        .from('comments')
        .select('*', { count: 'exact' })
        .eq('job_id', job.id)
        .order('created_at', { ascending: true });

      if (!showAll) {
        query = query.eq('is_used', false).limit(10);
      } else {
        query = query.limit(50);
      }

      const { data: comments, error, count } = await query;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        comments: comments || [],
        total_unused: count,
      });
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'job_id or video_id is required' },
        { status: 400 }
      );
    }

    // 미사용 댓글 하나 가져오기 (동시성 처리를 위해 DB 함수 사용)
    if (deviceId) {
      // DB 함수를 사용하여 원자적으로 댓글 가져오기 및 사용 처리
      const { data, error } = await supabase.rpc('get_and_use_comment', {
        p_job_id: jobId,
        p_device_id: deviceId,
      });

      if (error) {
        // 함수가 없는 경우 fallback
        if (error.code === 'PGRST202') {
          console.warn('[API] get_and_use_comment function not found, using fallback');
          return await fallbackGetComment(supabase, jobId, deviceId);
        }
        console.error('[API] Comment RPC error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!data || data.length === 0) {
        return NextResponse.json({
          success: true,
          comment: null,
          message: 'No unused comments available',
        });
      }

      return NextResponse.json({
        success: true,
        comment: {
          id: data[0].comment_id,
          content: data[0].comment_content,
        },
      });
    }

    // device_id 없이 조회만 하는 경우
    const showAll = searchParams.get('all') === 'true';
    
    let query = supabase
      .from('comments')
      .select('*', { count: 'exact' })
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });
    
    // all=true가 아니면 미사용 댓글만 조회
    if (!showAll) {
      query = query.eq('is_used', false).limit(10);
    } else {
      query = query.limit(50);
    }
    
    const { data: comments, error, count } = await query;

    if (error) {
      console.error('[API] Comments query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      comments: comments || [],
      total_unused: count,
    });

  } catch (error) {
    console.error('[API] Comments GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Fallback: DB 함수가 없는 경우
async function fallbackGetComment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  deviceId: string
) {
  // 미사용 댓글 하나 가져오기
  const { data: comment, error } = await supabase
    .from('comments')
    .select('id, content')
    .eq('job_id', jobId)
    .eq('is_used', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return NextResponse.json({
        success: true,
        comment: null,
        message: 'No unused comments available',
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 사용 처리
  await supabase
    .from('comments')
    .update({
      is_used: true,
      used_by_device_id: deviceId,
      used_at: new Date().toISOString(),
    })
    .eq('id', comment.id);

  return NextResponse.json({
    success: true,
    comment: {
      id: comment.id,
      content: comment.content,
    },
  });
}

// POST /api/comments - 댓글 대량 추가
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    const { job_id, channel_id, comments } = body;

    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return NextResponse.json(
        { error: 'comments array is required' },
        { status: 400 }
      );
    }

    if (!job_id && !channel_id) {
      return NextResponse.json(
        { error: 'Either job_id or channel_id is required' },
        { status: 400 }
      );
    }

    // 댓글 레코드 생성
    const commentRecords = comments.map((content: string) => ({
      job_id: job_id || null,
      channel_id: channel_id || null,
      content: content.trim(),
      is_used: false,
    })).filter(c => c.content.length > 0);

    if (commentRecords.length === 0) {
      return NextResponse.json(
        { error: 'No valid comments to insert' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('comments')
      .insert(commentRecords)
      .select();

    if (error) {
      console.error('[API] Comments insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      inserted_count: data?.length || 0,
    });

  } catch (error) {
    console.error('[API] Comments POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
