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

interface StreamRequestBody {
  deviceId: string;
  action: 'start' | 'stop';
  fps?: number; // frames per second, default 2
}

/**
 * POST /api/device/stream
 * Start or stop real-time frame streaming for a device
 *
 * MVP: Uses polling-based approach with scrcpy_commands table
 * PC Worker will poll for stream commands and capture frames
 */
export async function POST(request: NextRequest) {
  try {
    const body: StreamRequestBody = await request.json();
    const { deviceId, action, fps = 2 } = body;

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 }
      );
    }

    if (!['start', 'stop'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "start" or "stop"' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Check device exists
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, serial_number, pc_id')
      .eq('id', deviceId)
      .single();

    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      );
    }

    if (action === 'start') {
      // Insert stream start command
      const { data: command, error: cmdError } = await supabase
        .from('scrcpy_commands')
        .insert({
          device_id: deviceId,
          command_type: 'stream_start',
          command_data: {
            fps,
            interval_ms: Math.round(1000 / fps)
          },
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (cmdError) {
        console.error('Failed to create stream start command:', cmdError);
        return NextResponse.json(
          { error: 'Failed to start stream' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'start',
        commandId: command.id,
        fps
      });

    } else {
      // Insert stream stop command
      const { data: command, error: cmdError } = await supabase
        .from('scrcpy_commands')
        .insert({
          device_id: deviceId,
          command_type: 'stream_stop',
          command_data: {},
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (cmdError) {
        console.error('Failed to create stream stop command:', cmdError);
        return NextResponse.json(
          { error: 'Failed to stop stream' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'stop',
        commandId: command.id
      });
    }

  } catch (error) {
    console.error('Stream API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/device/stream?deviceId=xxx
 * Get the latest frame for a device (polling endpoint)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Get the latest frame from device_frames table or scrcpy_commands result
    const { data: frame, error } = await supabase
      .from('scrcpy_commands')
      .select('result_data, completed_at')
      .eq('device_id', deviceId)
      .eq('command_type', 'frame')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !frame) {
      return NextResponse.json({
        success: false,
        hasFrame: false
      });
    }

    return NextResponse.json({
      success: true,
      hasFrame: true,
      imageUrl: frame.result_data?.imageUrl || frame.result_data,
      timestamp: frame.completed_at
    });

  } catch (error) {
    console.error('Stream GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
