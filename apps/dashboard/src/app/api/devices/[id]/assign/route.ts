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
 * POST /api/devices/[id]/assign - 디바이스를 PC에 배정
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = getSupabase();
    const { id } = await context.params;
    const body = await request.json();
    const { pc_id, usb_port } = body;

    if (!pc_id) {
      return NextResponse.json(
        { error: 'pc_id is required' },
        { status: 400 }
      );
    }

    // PC가 존재하는지 확인
    const { data: pc, error: pcError } = await supabase
      .from('pcs')
      .select('id, pc_number, max_devices')
      .eq('id', pc_id)
      .single();

    if (pcError || !pc) {
      return NextResponse.json(
        { error: 'PC not found' },
        { status: 404 }
      );
    }

    // 해당 PC에 이미 배정된 디바이스 수 확인
    const { count } = await supabase
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('pc_id', pc_id);

    if (count && count >= pc.max_devices) {
      return NextResponse.json(
        { error: `PC ${pc.pc_number} has reached max device capacity (${pc.max_devices})` },
        { status: 400 }
      );
    }

    // 새 디바이스 번호 생성
    const { data: deviceNumber, error: numError } = await supabase.rpc('generate_device_number', {
      target_pc_id: pc_id,
    });

    if (numError) {
      console.error('[API] generate_device_number error:', numError);
      return NextResponse.json({ error: numError.message }, { status: 500 });
    }

    // 디바이스 업데이트
    const { data: device, error } = await supabase
      .from('devices')
      .update({
        pc_id,
        device_number: deviceNumber,
        usb_port: usb_port || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[API] Device assign error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ device });
  } catch (error) {
    console.error('[API] Device assign error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/devices/[id]/assign - 디바이스를 PC에서 해제
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = getSupabase();
    const { id } = await context.params;

    const { data: device, error } = await supabase
      .from('devices')
      .update({
        pc_id: null,
        device_number: null,
        usb_port: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[API] Device unassign error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ device });
  } catch (error) {
    console.error('[API] Device unassign error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
