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

interface BulkDevice {
  serial_number?: string;
  ip_address?: string;
  model?: string;
  android_version?: string;
  connection_type?: 'usb' | 'wifi' | 'otg';
}

/**
 * POST /api/devices/bulk - ADB 스캔 결과 일괄 등록
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    const { pc_id, devices } = body as { pc_id: string; devices: BulkDevice[] };

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return errorResponse('devices array is required', 400);
    }

    // PC 존재 확인 (pc_id가 제공된 경우)
    let pcData = null;
    if (pc_id) {
      const { data: pc, error: pcError } = await supabase
        .from('pcs')
        .select('id, pc_number')
        .eq('id', pc_id)
        .single();

      if (pcError || !pc) {
        return errorResponse('PC not found', 404);
      }
      pcData = pc;
    }

    const results = {
      created: [] as string[],
      updated: [] as string[],
      failed: [] as { device: BulkDevice; error: string }[],
    };

    for (const device of devices) {
      // 식별자 필수 확인
      if (!device.serial_number && !device.ip_address) {
        results.failed.push({ device, error: 'serial_number or ip_address required' });
        continue;
      }

      try {
        // 기존 디바이스 확인 (serial 또는 IP로)
        let existingDevice = null;

        if (device.serial_number) {
          const { data } = await supabase
            .from('devices')
            .select('id, pc_id')
            .eq('serial_number', device.serial_number)
            .single();
          existingDevice = data;
        }

        if (!existingDevice && device.ip_address) {
          const { data } = await supabase
            .from('devices')
            .select('id, pc_id')
            .eq('ip_address', device.ip_address)
            .single();
          existingDevice = data;
        }

        if (existingDevice) {
          // 기존 디바이스 업데이트
          const { error } = await supabase
            .from('devices')
            .update({
              ...device,
              pc_id: pc_id || existingDevice.pc_id,
              status: 'online',
              last_heartbeat: new Date().toISOString(),
            })
            .eq('id', existingDevice.id);

          if (error) {
            results.failed.push({ device, error: error.message });
          } else {
            results.updated.push(device.serial_number || device.ip_address || 'unknown');
          }
        } else {
          // 새 디바이스 생성
          // 디바이스 번호 자동 생성
          const { data: deviceNumber, error: genError } = await supabase.rpc(
            'generate_device_number',
            { target_pc_id: pc_id || null }
          );

          if (genError) {
            results.failed.push({ device, error: genError.message });
            continue;
          }

          const { error } = await supabase
            .from('devices')
            .insert({
              pc_id: pc_id || null,
              device_number: deviceNumber,
              serial_number: device.serial_number || null,
              ip_address: device.ip_address || null,
              model: device.model || 'Galaxy S9',
              android_version: device.android_version || null,
              connection_type: device.connection_type || 'usb',
              status: 'online',
              last_heartbeat: new Date().toISOString(),
            });

          if (error) {
            results.failed.push({ device, error: error.message });
          } else {
            results.created.push(device.serial_number || device.ip_address || 'unknown');
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.failed.push({ device, error: errorMessage });
      }
    }

    return successResponse({
      ...results,
      message: `등록 완료: ${results.created.length}개 생성, ${results.updated.length}개 갱신`
    });
  } catch (error) {
    console.error('[API] Bulk register error:', error);
    return errorResponse('Internal server error', 500);
  }
}
