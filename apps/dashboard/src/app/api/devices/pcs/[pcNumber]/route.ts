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
  params: Promise<{ pcNumber: string }>;
}

/**
 * GET /api/devices/pcs/[pcNumber] - PC 상세 조회 (연결된 디바이스 포함)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { pcNumber } = await params;
    const supabase = getSupabase();

    // PC 조회
    const { data: pc, error: pcError } = await supabase
      .from('pcs')
      .select('*')
      .eq('pc_number', pcNumber.toUpperCase())
      .single();

    if (pcError) {
      if (pcError.code === 'PGRST116') {
        return errorResponse(`PC ${pcNumber} not found`, 404);
      }
      console.error('[API] PC query error:', pcError);
      return errorResponse(pcError.message, 500);
    }

    // 연결된 디바이스 조회
    const { data: devices, error: devError } = await supabase
      .from('devices')
      .select('*')
      .eq('pc_id', pc.id)
      .order('device_number', { ascending: true });

    if (devError) {
      console.error('[API] Devices query error:', devError);
      return errorResponse(devError.message, 500);
    }

    return successResponse({
      ...pc,
      devices: devices || [],
      device_count: devices?.length || 0,
      online_count: devices?.filter(d => d.status === 'online').length || 0,
      error_count: devices?.filter(d => d.status === 'error').length || 0,
    });
  } catch (error) {
    console.error('[API] PC GET error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * PATCH /api/devices/pcs/[pcNumber] - PC 정보 수정
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { pcNumber } = await params;
    const supabase = getSupabase();
    const body = await request.json();

    const allowedFields = ['ip_address', 'hostname', 'label', 'location', 'max_devices', 'status'];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse('No valid fields to update', 400);
    }

    const { data, error } = await supabase
      .from('pcs')
      .update(updates)
      .eq('pc_number', pcNumber.toUpperCase())
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse(`PC ${pcNumber} not found`, 404);
      }
      console.error('[API] PC update error:', error);
      return errorResponse(error.message, 500);
    }

    return successResponse(data);
  } catch (error) {
    console.error('[API] PC PATCH error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /api/devices/pcs/[pcNumber] - PC 삭제
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { pcNumber } = await params;
    const supabase = getSupabase();

    // PC 조회 (삭제 전 연결된 디바이스 확인)
    const { data: pc, error: pcError } = await supabase
      .from('pcs')
      .select('id')
      .eq('pc_number', pcNumber.toUpperCase())
      .single();

    if (pcError) {
      if (pcError.code === 'PGRST116') {
        return errorResponse(`PC ${pcNumber} not found`, 404);
      }
      console.error('[API] PC query error:', pcError);
      return errorResponse(pcError.message, 500);
    }

    // 연결된 디바이스 배정 해제 (pc_id = NULL)
    await supabase
      .from('devices')
      .update({ pc_id: null })
      .eq('pc_id', pc.id);

    // PC 삭제
    const { error: delError } = await supabase
      .from('pcs')
      .delete()
      .eq('id', pc.id);

    if (delError) {
      console.error('[API] PC delete error:', delError);
      return errorResponse(delError.message, 500);
    }

    return successResponse({ pc_number: pcNumber });
  } catch (error) {
    console.error('[API] PC DELETE error:', error);
    return errorResponse('Internal server error', 500);
  }
}
