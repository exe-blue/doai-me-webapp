import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse } from '@/lib/api-utils';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key);
}

interface RouteParams {
  params: Promise<{ code: string }>;
}

/**
 * GET /api/devices/by-code/[code] - 관리번호로 디바이스 조회
 * code: PC01-001 형식
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { code } = await params;
    const supabase = getSupabase();

    // 관리번호 파싱 (PC01-001 → PC01, 001)
    const match = code.toUpperCase().match(/^(PC\d{2})-(\d{3})$/);
    
    if (!match) {
      return errorResponse('Invalid management code format. Expected: PC01-001', 400);
    }

    const pcNumber = match[1];
    const deviceNumber = parseInt(match[2], 10);

    // PC 조회
    const { data: pc, error: pcError } = await supabase
      .from('pcs')
      .select('id')
      .eq('pc_number', pcNumber)
      .single();

    if (pcError || !pc) {
      return errorResponse(`PC ${pcNumber} not found`, 404);
    }

    // 디바이스 조회
    const { data: device, error: devError } = await supabase
      .from('devices')
      .select('*, pcs(*)')
      .eq('pc_id', pc.id)
      .eq('device_number', deviceNumber)
      .single();

    if (devError) {
      if (devError.code === 'PGRST116') {
        return errorResponse(`Device ${code} not found`, 404);
      }
      console.error('[API] Device query error:', devError);
      return errorResponse(devError.message, 500);
    }

    return successResponse({
      ...device,
      management_code: code.toUpperCase(),
      pc: device.pcs,
    });
  } catch (error) {
    console.error('[API] Device by-code GET error:', error);
    return errorResponse('Internal server error', 500);
  }
}
