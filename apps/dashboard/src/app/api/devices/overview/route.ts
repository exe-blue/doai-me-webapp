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
 * GET /api/devices/overview - 전체 기기 현황 조회 (device_overview 뷰)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const pcNumber = searchParams.get('pc_number');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;

    // device_overview 뷰 조회
    let query = supabase
      .from('device_overview')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('device_status', status);
    }

    if (pcNumber) {
      query = query.eq('pc_number', pcNumber.toUpperCase());
    }

    query = query
      .order('pc_number', { ascending: true, nullsFirst: false })
      .order('device_number', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[API] Device overview query error:', error);
      return errorResponse(error.message, 500);
    }

    // 통계 계산
    const stats = {
      total: count || 0,
      online: data?.filter(d => d.device_status === 'online').length || 0,
      offline: data?.filter(d => d.device_status === 'offline').length || 0,
      busy: data?.filter(d => d.device_status === 'busy').length || 0,
      error: data?.filter(d => d.device_status === 'error').length || 0,
      unassigned: data?.filter(d => d.pc_status === 'unassigned').length || 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        items: data || [],
        stats,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (error) {
    console.error('[API] Device overview GET error:', error);
    return errorResponse('Internal server error', 500);
  }
}
