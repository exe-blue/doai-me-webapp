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
 * GET /api/devices/pcs - PC 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    // PC Summary 뷰 사용 (디바이스 수 포함)
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
      console.error('[API] PCs query error:', error);
      return errorResponse(error.message, 500);
    }

    return paginatedResponse(data || [], page, limit, count || 0);
  } catch (error) {
    console.error('[API] PCs GET error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /api/devices/pcs - 새 PC 등록 (번호 자동할당)
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

    return successResponse(pc);
  } catch (error) {
    console.error('[API] PCs POST error:', error);
    return errorResponse('Internal server error', 500);
  }
}
