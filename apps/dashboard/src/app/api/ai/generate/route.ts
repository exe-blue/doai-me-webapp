import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Server-side OpenAI client
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  return new OpenAI({ apiKey });
}

// Server-side Supabase client
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

/**
 * POST /api/ai/generate
 *
 * Mode A: Generate only (preview) - returns comment array for user review
 * Mode B: Generate + Save - generates and saves directly to a job
 *
 * Body:
 * - title: string (video title for context)
 * - count?: number (default: 10, max: 50)
 * - tone?: 'casual' | 'positive' | 'mixed' (default: 'casual')
 * - job_id?: string (if provided, saves to DB immediately)
 * - save?: boolean (if true with job_id, saves to DB)
 * - comments?: string[] (if provided, saves these instead of generating)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      count = 10,
      tone = 'casual',
      job_id,
      save = false,
      comments: providedComments,
    } = body;

    // Mode C: Save provided comments (user reviewed and approved AI-generated comments)
    if (providedComments && Array.isArray(providedComments) && job_id) {
      const supabase = getSupabase();

      const commentRecords = providedComments
        .filter((c: string) => typeof c === 'string' && c.trim().length > 0)
        .map((content: string) => ({
          job_id,
          content: content.trim(),
          is_used: false,
        }));

      if (commentRecords.length === 0) {
        return NextResponse.json({ error: 'No valid comments provided' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('comments')
        .insert(commentRecords)
        .select('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        mode: 'save_provided',
        saved: data?.length || 0,
      });
    }

    // Mode A/B: Generate comments with AI
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'title is required for AI generation' },
        { status: 400 }
      );
    }

    const clampedCount = Math.min(Math.max(1, count), 50);

    const toneGuide: Record<string, string> = {
      casual: '자연스럽고 캐주얼한 유튜브 시청자 말투. 가끔 ㅋㅋㅋ, ㄹㅇ, ㅎㅎ 같은 인터넷 슬랭과 이모지 사용.',
      positive: '긍정적이고 호의적인 시청자 말투. 영상 내용을 칭찬하고 구독을 언급.',
      mixed: '다양한 반응 (긍정, 감탄, 질문, 공감 등) 골고루 섞기.',
    };

    const openai = getOpenAI();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a witty Korean YouTube viewer. Output ONLY a JSON object with a "comments" key containing an array of strings. No other text.',
        },
        {
          role: 'user',
          content: `Generate ${clampedCount} natural, unique YouTube comments for a video titled "${title.trim()}".

Rules:
- ${toneGuide[tone] || toneGuide.casual}
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
      max_tokens: 2000,
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      return NextResponse.json({ error: 'Empty AI response' }, { status: 500 });
    }

    const parsed = JSON.parse(content);
    const generatedComments: string[] = (parsed.comments || parsed.data || (Array.isArray(parsed) ? parsed : []))
      .filter((c: unknown) => typeof c === 'string' && (c as string).trim().length > 0)
      .map((c: string) => c.trim());

    // Mode B: Generate + Save to DB
    if (save && job_id) {
      const supabase = getSupabase();

      const commentRecords = generatedComments.map((c: string) => ({
        job_id,
        content: c,
        is_used: false,
      }));

      const { data, error } = await supabase
        .from('comments')
        .insert(commentRecords)
        .select('id');

      if (error) {
        // Return generated comments even if save fails
        return NextResponse.json({
          success: true,
          mode: 'generate_save_failed',
          comments: generatedComments,
          count: generatedComments.length,
          save_error: error.message,
        });
      }

      return NextResponse.json({
        success: true,
        mode: 'generate_and_save',
        comments: generatedComments,
        count: generatedComments.length,
        saved: data?.length || 0,
      });
    }

    // Mode A: Generate only (preview)
    return NextResponse.json({
      success: true,
      mode: 'preview',
      comments: generatedComments,
      count: generatedComments.length,
    });

  } catch (error) {
    console.error('[API] AI generate error:', error);

    if (error instanceof Error && error.message.includes('OPENAI_API_KEY')) {
      return NextResponse.json(
        { error: 'AI service not configured. Set OPENAI_API_KEY in .env' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
