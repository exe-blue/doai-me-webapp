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

interface CommandBody {
  deviceIds: string[];
  command: 'tap' | 'swipe' | 'keyevent' | 'text' | 'shell';
  params?: {
    x?: number;
    y?: number;
    x2?: number;
    y2?: number;
    keycode?: number;
    text?: string;
    duration?: number;
    shellCommand?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: CommandBody = await request.json();
    const { deviceIds, command, params } = body;

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return NextResponse.json(
        { error: 'deviceIds array is required' },
        { status: 400 }
      );
    }

    if (!command) {
      return NextResponse.json(
        { error: 'command is required' },
        { status: 400 }
      );
    }

    // Validate command type
    const validCommands = ['tap', 'swipe', 'keyevent', 'text', 'shell'];
    if (!validCommands.includes(command)) {
      return NextResponse.json(
        { error: `Invalid command. Must be one of: ${validCommands.join(', ')}` },
        { status: 400 }
      );
    }

    // Build ADB command string
    let adbCommand: string;
    switch (command) {
      case 'tap':
        if (params?.x === undefined || params?.y === undefined) {
          return NextResponse.json(
            { error: 'tap command requires x and y params' },
            { status: 400 }
          );
        }
        adbCommand = `input tap ${params.x} ${params.y}`;
        break;

      case 'swipe':
        if (params?.x === undefined || params?.y === undefined ||
            params?.x2 === undefined || params?.y2 === undefined) {
          return NextResponse.json(
            { error: 'swipe command requires x, y, x2, y2 params' },
            { status: 400 }
          );
        }
        const duration = params.duration || 300;
        adbCommand = `input swipe ${params.x} ${params.y} ${params.x2} ${params.y2} ${duration}`;
        break;

      case 'keyevent':
        if (params?.keycode === undefined) {
          return NextResponse.json(
            { error: 'keyevent command requires keycode param' },
            { status: 400 }
          );
        }
        adbCommand = `input keyevent ${params.keycode}`;
        break;

      case 'text':
        if (!params?.text) {
          return NextResponse.json(
            { error: 'text command requires text param' },
            { status: 400 }
          );
        }
        // Escape special characters for shell
        const escapedText = params.text.replace(/['"\\]/g, '\\$&');
        adbCommand = `input text "${escapedText}"`;
        break;

      case 'shell':
        if (!params?.shellCommand) {
          return NextResponse.json(
            { error: 'shell command requires shellCommand param' },
            { status: 400 }
          );
        }
        // Only allow specific safe shell commands
        const allowedShellCommands = ['wm size', 'wm density', 'settings', 'getprop'];
        const isAllowed = allowedShellCommands.some(cmd => params.shellCommand!.startsWith(cmd));
        if (!isAllowed) {
          return NextResponse.json(
            { error: `Shell command not allowed. Allowed prefixes: ${allowedShellCommands.join(', ')}` },
            { status: 400 }
          );
        }
        adbCommand = params.shellCommand;
        break;

      default:
        return NextResponse.json(
          { error: 'Unknown command' },
          { status: 400 }
        );
    }

    const supabase = getSupabaseClient();

    // Insert commands for all devices
    const commands = deviceIds.map(deviceId => ({
      device_id: deviceId,
      command_type: 'input',
      command_data: { adbCommand },
      status: 'pending',
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('scrcpy_commands')
      .insert(commands)
      .select();

    if (error) {
      console.error('Failed to create commands:', error);
      return NextResponse.json(
        { error: 'Failed to create commands' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      commandCount: data.length,
      commandIds: data.map(c => c.id)
    });

  } catch (error) {
    console.error('Command API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
