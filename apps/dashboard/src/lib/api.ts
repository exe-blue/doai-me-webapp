import { supabase } from '@/lib/supabase';

// =============================================
// Types
// =============================================

export interface DeviceRaw {
  id: string;
  device_id: string;
  pc_id: string | null;
  pc_number?: string;
  device_number?: number;
  management_code?: string;
  name?: string;
  model?: string;
  android_version?: string;
  status?: string;
  battery_level?: number;
  is_charging?: boolean;
  memory_used?: number;
  memory_total?: number;
  storage_used?: number;
  storage_total?: number;
  cpu_usage?: number;
  temperature?: number;
  wifi_signal?: number;
  current_task_id?: string | null;
  current_job_id?: string | null;
  last_heartbeat?: string;
  uptime_seconds?: number;
  total_tasks_completed?: number;
  total_tasks_failed?: number;
  completed_jobs?: number;
  failed_jobs?: number;
  error_message?: string | null;
  created_at?: string;
  serial_number?: string;
  ip_address?: string;
  connection_type?: 'usb' | 'wifi' | 'otg';
  usb_port?: number;
}

export interface PCRaw {
  id: string;
  pc_number: string;
  label?: string;
  status?: 'online' | 'offline';
}

export interface NodeRow {
  id: string;
  name: string | null;
  status: string | null;
  connected_at: string | null;
  total_devices: number | null;
  active_devices: number | null;
  idle_devices: number | null;
  error_devices: number | null;
  tasks_per_minute: number | null;
  cpu_usage: number | null;
  memory_usage: number | null;
}

export interface TodayStats {
  completed: Array<{
    id: string;
    actual_watch_duration_sec: number | null;
    did_like: boolean | null;
    did_comment: boolean | null;
    did_subscribe: boolean | null;
  }>;
  failed: Array<{ id: string }>;
}

// =============================================
// Fetch Functions
// =============================================

export async function fetchDevices(params?: { limit?: number }): Promise<{
  devices: DeviceRaw[];
  pcs: PCRaw[];
}> {
  const limit = params?.limit ?? 1000;

  const [devicesRes, pcsRes] = await Promise.all([
    fetch(`/api/devices?limit=${limit}`),
    fetch('/api/pcs'),
  ]);

  if (!devicesRes.ok) throw new Error(`Devices API error: ${devicesRes.status}`);
  if (!pcsRes.ok) throw new Error(`PCs API error: ${pcsRes.status}`);

  const devicesResult = await devicesRes.json();
  const pcsResult = await pcsRes.json();

  const devices: DeviceRaw[] = devicesResult.devices || devicesResult.data?.items || [];
  const pcs: PCRaw[] = pcsResult.pcs || [];

  return { devices, pcs };
}

export async function fetchJobs(params?: {
  status?: string;
  limit?: number;
}): Promise<{ jobs: Array<Record<string, unknown>> }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const url = `/api/jobs${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Jobs API error: ${response.status}`);

  return response.json();
}

export async function fetchRunningTasks(nodeFilter?: string) {
  let query = supabase
    .from('video_executions')
    .select(`
      *,
      video:videos (title, thumbnail_url, channel_name)
    `)
    .eq('status', 'running')
    .order('started_at', { ascending: false });

  if (nodeFilter && nodeFilter !== 'all') {
    query = query.eq('node_id', nodeFilter);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function fetchNodes(): Promise<NodeRow[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

export async function fetchTodayStats(): Promise<TodayStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [{ data: completed, error: err1 }, { data: failed, error: err2 }] =
    await Promise.all([
      supabase
        .from('video_executions')
        .select('id, actual_watch_duration_sec, did_like, did_comment, did_subscribe')
        .eq('status', 'completed')
        .gte('completed_at', today.toISOString()),
      supabase
        .from('video_executions')
        .select('id')
        .eq('status', 'failed')
        .gte('created_at', today.toISOString()),
    ]);

  if (err1) throw err1;
  if (err2) throw err2;

  return {
    completed: completed || [],
    failed: failed || [],
  };
}
