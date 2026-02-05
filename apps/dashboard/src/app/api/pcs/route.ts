import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api-utils';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key);
}

/**
 * GET /api/pcs - PC 목록 조회 (pc_summary 뷰 사용)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    // pc_summary 뷰 조회 (디바이스 수 포함)
    let query = supabase
      .from('pc_summary')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    query = query
      .order('pc_number', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      // pc_summary 뷰가 없는 경우 pcs 테이블 직접 조회
      if (error.code === '42P01') {
        const { data: pcsData, error: pcsError, count: pcsCount } = await supabase
          .from('pcs')
          .select('*', { count: 'exact' })
          .order('pc_number', { ascending: true })
          .range(offset, offset + limit - 1);

        if (pcsError) {
          console.error('[API] PCs query error:', pcsError);
          return NextResponse.json({ pcs: [], success: true });
        }

        return NextResponse.json({
          pcs: pcsData || [],
          pagination: {
            page,
            limit,
            total: pcsCount || 0,
            totalPages: Math.ceil((pcsCount || 0) / limit),
          },
          success: true,
        });
      }

      console.error('[API] PC summary query error:', error);
      return NextResponse.json({ pcs: [], success: true });
    }

    return NextResponse.json({
      pcs: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      success: true,
    });
  } catch (error) {
    console.error('[API] PCs GET error:', error);
    // 오류가 발생해도 빈 배열 반환 (UI 안정성)
    return NextResponse.json({ pcs: [], success: true });
  }
}

/**
 * POST /api/pcs - 새 PC 등록 (번호 자동할당)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    const { ip_address, hostname, label, location, max_devices } = body;

    // PC 번호 자동 생성
    const { data: pcNumber, error: genError } = await supabase.rpc('generate_pc_number');

    if (genError) {
      console.error('[API] PC number generation error:', genError);
      return errorResponse(genError.message, 500);
    }

    // PC 생성
    const { data: pc, error } = await supabase
      .from('pcs')
      .insert({
        pc_number: pcNumber,
        ip_address: ip_address || null,
        hostname: hostname || null,
        label: label || null,
        location: location || null,
        max_devices: max_devices || 20,
        status: 'offline',
      })
      .select()
      .single();

    if (error) {
      console.error('[API] PC create error:', error);
      return errorResponse(error.message, 500);
    }

    return successResponse(pc, '새 PC가 등록되었습니다');
  } catch (error) {
    console.error('[API] PCs POST error:', error);
    return errorResponse('Internal server error', 500);
  }
}
