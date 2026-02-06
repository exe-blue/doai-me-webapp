import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key);
}

// GET /api/devices - Fetch all devices from Supabase
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status'); // online, busy, offline, error
    const pcId = searchParams.get('pc_id'); // Filter by PC code (P01, P02)
    const limit = parseInt(searchParams.get('limit') || '500');

    let query = supabase
      .from('devices')
      .select('*')
      .order('pc_id', { ascending: true })
      .limit(limit);

    // Status filter
    if (status) {
      query = query.eq('status', status);
    }

    const { data: allDevices, error } = await query;

    // PC ID filter (prefix match) - done in JS to avoid UUID type mismatch
    let devices = allDevices;
    if (pcId && devices) {
      devices = devices.filter(d => String(d.pc_id || '').startsWith(pcId));
    }

    if (error) {
      console.error('[API] Devices query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate stats
    const stats = {
      total: devices?.length || 0,
      online: devices?.filter(d => d.status === 'online').length || 0,
      busy: devices?.filter(d => d.status === 'busy').length || 0,
      offline: devices?.filter(d => d.status === 'offline').length || 0,
      error: devices?.filter(d => d.status === 'error').length || 0,
    };

    return NextResponse.json({
      devices: devices || [],
      stats,
    });
  } catch (error) {
    console.error('[API] Devices GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/devices?status=offline - Delete devices by status
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    
    // 인증 확인: 현재 세션 검증
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError || !session) {
      console.warn('[API] Unauthorized DELETE attempt - no valid session');
      return NextResponse.json(
        { error: 'Authentication required. Please log in.' },
        { status: 401 }
      );
    }
    
    // 사용자 역할/권한 확인 (user_metadata에서 role 확인)
    const userRole = session.user?.user_metadata?.role;
    const isAdmin = userRole === 'admin' || session.user?.email?.endsWith('@doai.me');
    
    if (!isAdmin) {
      console.warn(`[API] Unauthorized DELETE attempt by user: ${session.user?.id}`);
      return NextResponse.json(
        { error: 'Insufficient permissions. Admin access required.' },
        { status: 403 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const confirm = searchParams.get('confirm');

    if (!status) {
      return NextResponse.json(
        { error: 'status query parameter required (e.g., ?status=offline)' },
        { status: 400 }
      );
    }
    
    // 확인 플래그 체크 (실수로 인한 삭제 방지)
    if (confirm !== 'true') {
      return NextResponse.json(
        { error: 'Confirmation required. Add ?confirm=true to proceed with deletion.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('devices')
      .delete()
      .eq('status', status)
      .select('id');

    if (error) {
      console.error('[API] Device delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 감사 로그 기록
    console.log(`[API] Devices deleted by user ${session.user?.id}: ${data?.length || 0} devices with status '${status}'`);

    return NextResponse.json({
      deleted: data?.length || 0,
      message: `Deleted ${data?.length || 0} devices with status '${status}'`,
    });
  } catch (error) {
    console.error('[API] Devices DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/devices - Update device status (for manual status changes)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    const { device_id, serial_number, status, ...updates } = body;

    if (!device_id && !serial_number) {
      return NextResponse.json(
        { error: 'device_id or serial_number required' },
        { status: 400 }
      );
    }

    let query = supabase.from('devices').update({
      status,
      ...updates,
      last_heartbeat: new Date().toISOString(),
    });

    if (device_id) {
      query = query.eq('id', device_id);
    } else {
      query = query.eq('serial_number', serial_number);
    }

    const { data, error } = await query.select().single();

    if (error) {
      console.error('[API] Device update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ device: data });
  } catch (error) {
    console.error('[API] Devices PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
