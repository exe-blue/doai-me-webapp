import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('[Seed] Missing Supabase credentials');
    return null;
  }

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabase;
}

/**
 * Seed test devices into the database
 */
export async function seedDevices(count: number = 10) {
  const supabase = getServiceClient();
  if (!supabase) return [];

  const devices = Array.from({ length: count }, (_, i) => ({
    device_id: `E2E-S9-${String(i + 1).padStart(3, '0')}`,
    serial_number: `E2E-SER-${String(i + 1).padStart(4, '0')}`,
    status: i < 5 ? 'online' : 'offline',
    battery_level: 50 + ((i * 5) % 50),
    pc_id: `E2E-PC-${Math.ceil((i + 1) / 5)}`,
    last_heartbeat: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('devices')
    .upsert(devices, { onConflict: 'serial_number' })
    .select();

  if (error) {
    console.error('[Seed] Devices seed error:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Clean up E2E test data
 */
export async function cleanupTestData() {
  const supabase = getServiceClient();
  if (!supabase) return;

  // Delete E2E test devices
  await supabase.from('devices').delete().like('device_id', 'E2E-%');

  // Delete E2E test jobs
  await supabase.from('jobs').delete().like('title', 'E2E %');

  console.log('[Seed] Test data cleaned up');
}
