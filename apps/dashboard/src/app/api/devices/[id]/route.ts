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
  params: Promise<{ id: string }>;
}

/**
 * GET /api/devices/[id] - 단일 디바이스 조회
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { data: device, error } = await supabase
      .from('devices')
      .select('*, pcs(*)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('NOT_FOUND', 'Device not found', 404);
      }
      console.error('[API] Device query error:', error);
      return errorResponse('DB_ERROR', error.message, 500);
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
    console.error('[API] Device GET error:', error);
    return errorResponse('INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * PATCH /api/devices/[id] - 디바이스 정보 수정
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getSupabase();
    const body = await request.json();

    const allowedFields = [
      'serial_number', 'ip_address', 'model', 'android_version',
      'connection_type', 'usb_port', 'status', 'battery_level',
      'error_count', 'last_error',
    ];
    
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse('No valid fields to update', 400);
    }

    // 하트비트 업데이트
    if (updates.status === 'online') {
      updates.last_heartbeat = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('devices')
      .update(updates)
      .eq('id', id)
      .select('*, pcs(*)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Device not found', 404);
      }
      console.error('[API] Device update error:', error);
      return errorResponse(error.message, 500);
    }

    return successResponse(data);
  } catch (error) {
    console.error('[API] Device PATCH error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /api/devices/[id] - 디바이스 삭제
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Device delete error:', error);
      return errorResponse(error.message, 500);
    }

    return successResponse({ id });
  } catch (error) {
    console.error('[API] Device DELETE error:', error);
    return errorResponse('Internal server error', 500);
  }
}
