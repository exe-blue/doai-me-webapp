import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key);
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/pcs/[id] - PC 상세 조회 (연결된 디바이스 포함)
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = getSupabase();
    const { id } = await context.params;

    // PC 정보 조회
    const { data: pc, error: pcError } = await supabase
      .from('pcs')
      .select('*')
      .eq('id', id)
      .single();

    if (pcError) {
      console.error('[API] PC query error:', pcError);
      return NextResponse.json(
        { error: 'PC not found' },
        { status: 404 }
      );
    }

    // 해당 PC에 연결된 디바이스 조회
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('*')
      .eq('pc_id', id)
      .order('device_number', { ascending: true });

    if (devicesError) {
      console.error('[API] Devices query error:', devicesError);
      // 디바이스 조회 실패해도 PC 정보는 반환
    }

    return NextResponse.json({
      pc,
      devices: devices || [],
      device_count: devices?.length || 0,
    });
  } catch (error) {
    console.error('[API] PC GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/pcs/[id] - PC 정보 수정
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = getSupabase();
    const { id } = await context.params;
    const body = await request.json();

    const allowedFields = ['label', 'location', 'hostname', 'ip_address', 'max_devices', 'status', 'metadata'];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data: pc, error } = await supabase
      .from('pcs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[API] PC update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pc });
  } catch (error) {
    console.error('[API] PC PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pcs/[id] - PC 삭제
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = getSupabase();
    const { id } = await context.params;

    // 먼저 해당 PC에 연결된 디바이스 확인
    const { data: devices } = await supabase
      .from('devices')
      .select('id')
      .eq('pc_id', id);

    if (devices && devices.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete PC with assigned devices. ${devices.length} device(s) are currently assigned.` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('pcs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] PC delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] PC DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
