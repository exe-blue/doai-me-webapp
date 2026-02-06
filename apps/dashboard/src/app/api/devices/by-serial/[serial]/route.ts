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
  params: Promise<{ serial: string }>;
}

/**
 * GET /api/devices/by-serial/[serial] - 시리얼 번호로 디바이스 조회
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { serial } = await params;
    const supabase = getSupabase();

    // 디바이스 조회
    const { data: device, error } = await supabase
      .from('devices')
      .select('*, pcs(*)')
      .eq('serial_number', serial)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse(`Device with serial ${serial} not found`, 404);
      }
      console.error('[API] Device query error:', error);
      return errorResponse(error.message, 500);
    }

    // 관리번호 생성
    let managementCode = 'UNASSIGNED';
    if (device.pcs?.pc_number && device.device_number) {
      managementCode = `${device.pcs.pc_number}-${device.device_number.toString().padStart(3, '0')}`;
    }

    return successResponse({
      ...device,
      management_code: managementCode,
      pc: device.pcs,
    });
  } catch (error) {
    console.error('[API] Device by-serial GET error:', error);
    return errorResponse('Internal server error', 500);
  }
}
