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

    const status = searchParams.get('status'); // idle, busy, offline
    const pcId = searchParams.get('pc_id'); // Filter by PC code (P01, P02)
    const limit = parseInt(searchParams.get('limit') || '500');

    let query = supabase
      .from('devices')
      .select('*')
      .like('pc_id', 'P__-___') // Strict filter: only P01-001 format devices
      .order('pc_id', { ascending: true })
      .limit(limit);

    // Status filter
    if (status) {
      query = query.eq('status', status);
    }

    // PC ID filter (prefix match)
    if (pcId) {
      query = query.like('pc_id', `${pcId}-%`);
    }

    const { data: devices, error } = await query;

    if (error) {
      console.error('[API] Devices query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate stats
    const stats = {
      total: devices?.length || 0,
      idle: devices?.filter(d => d.status === 'idle').length || 0,
      busy: devices?.filter(d => d.status === 'busy').length || 0,
      offline: devices?.filter(d => d.status === 'offline').length || 0,
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
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    if (!status) {
      return NextResponse.json(
        { error: 'status query parameter required (e.g., ?status=offline)' },
        { status: 400 }
      );
    }

    const { data, error, count } = await supabase
      .from('devices')
      .delete()
      .eq('status', status)
      .select('id');

    if (error) {
      console.error('[API] Device delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
      last_seen_at: new Date().toISOString(),
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
