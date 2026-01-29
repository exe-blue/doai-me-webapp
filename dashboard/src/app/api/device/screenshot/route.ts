import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId } = body;

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Get device info
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('serial_number, pc_id')
      .eq('id', deviceId)
      .single();

    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      );
    }

    // Insert screenshot command to scrcpy_commands table
    // PC Worker will pick this up and execute
    const { data: command, error: cmdError } = await supabase
      .from('scrcpy_commands')
      .insert({
        device_id: deviceId,
        command_type: 'screenshot',
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (cmdError) {
      console.error('Failed to create screenshot command:', cmdError);
      return NextResponse.json(
        { error: 'Failed to create command' },
        { status: 500 }
      );
    }

    // Wait for command to complete (polling with timeout)
    const timeout = 10000; // 10 seconds
    const pollInterval = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const { data: result } = await supabase
        .from('scrcpy_commands')
        .select('status, result_data')
        .eq('id', command.id)
        .single();

      if (result?.status === 'completed' && result?.result_data) {
        return NextResponse.json({
          success: true,
          imageUrl: result.result_data.imageUrl || result.result_data,
        });
      }

      if (result?.status === 'failed') {
        return NextResponse.json(
          { error: 'Screenshot capture failed' },
          { status: 500 }
        );
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return NextResponse.json(
      { error: 'Screenshot timeout' },
      { status: 504 }
    );

  } catch (error) {
    console.error('Screenshot API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
