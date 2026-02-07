import { useQuery } from '@tanstack/react-query';
import { fetchDevices, type DeviceRaw, type PCRaw } from '@/lib/api';

export const deviceKeys = {
  all: ['devices'] as const,
  list: (filters?: { status?: string; pcId?: string }) =>
    [...deviceKeys.all, 'list', filters] as const,
  pcs: () => [...deviceKeys.all, 'pcs'] as const,
};

interface Device {
  id: string;
  device_id: string;
  pc_id: string | null;
  pc_number?: string;
  device_number?: number;
  management_code?: string;
  name: string;
  model: string;
  android_version: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  battery_level: number;
  is_charging: boolean;
  memory_used: number;
  memory_total: number;
  storage_used: number;
  storage_total: number;
  cpu_usage: number;
  temperature: number;
  wifi_signal: number;
  current_task_id: string | null;
  last_heartbeat: string;
  uptime_seconds: number;
  total_tasks_completed: number;
  total_tasks_failed: number;
  error_message: string | null;
  created_at: string;
  serial_number: string | null;
  ip_address: string | null;
  connection_type: 'usb' | 'wifi' | 'otg';
  usb_port: number | null;
}

interface PCSummary {
  id: string;
  pc_number: string;
  label?: string;
  status: 'online' | 'offline';
  total: number;
  online: number;
  busy: number;
  error: number;
  offline: number;
}

function mapDevice(d: DeviceRaw): Device {
  return {
    id: d.id,
    device_id: d.device_id || d.id,
    pc_id: d.pc_id || null,
    pc_number: d.pc_number,
    device_number: d.device_number,
    management_code: d.management_code,
    name: d.management_code || `Device ${d.id}`,
    model: d.model || 'Unknown',
    android_version: d.android_version || 'Unknown',
    status: (d.status || 'offline') as Device['status'],
    battery_level: d.battery_level ?? 0,
    is_charging: d.is_charging ?? false,
    memory_used: d.memory_used ?? 0,
    memory_total: d.memory_total ?? 4096,
    storage_used: d.storage_used ?? 0,
    storage_total: d.storage_total ?? 64,
    cpu_usage: d.cpu_usage ?? 0,
    temperature: d.temperature ?? 35,
    wifi_signal: d.wifi_signal ?? 80,
    current_task_id: d.current_task_id || d.current_job_id || null,
    last_heartbeat: d.last_heartbeat || new Date().toISOString(),
    uptime_seconds: d.uptime_seconds ?? 0,
    total_tasks_completed: d.total_tasks_completed ?? d.completed_jobs ?? 0,
    total_tasks_failed: d.total_tasks_failed ?? d.failed_jobs ?? 0,
    error_message: d.error_message || null,
    created_at: d.created_at || new Date().toISOString(),
    serial_number: d.serial_number || null,
    ip_address: d.ip_address || null,
    connection_type: (d.connection_type as Device['connection_type']) || 'usb',
    usb_port: d.usb_port ?? null,
  };
}

function mapPCSummaries(
  pcsRaw: PCRaw[],
  devices: Device[],
): PCSummary[] {
  if (pcsRaw.length > 0) {
    return pcsRaw.map((pc) => {
      const pcDevices = devices.filter((d) => d.pc_id === pc.id);
      const hasOnlineDevice = pcDevices.some(
        (d) => d.status === 'online' || d.status === 'busy',
      );
      return {
        id: pc.id,
        pc_number: pc.pc_number,
        label: pc.label || pc.pc_number,
        status: (pc.status || (hasOnlineDevice ? 'online' : 'offline')) as 'online' | 'offline',
        total: pcDevices.length,
        online: pcDevices.filter((d) => d.status === 'online').length,
        busy: pcDevices.filter((d) => d.status === 'busy').length,
        error: pcDevices.filter((d) => d.status === 'error').length,
        offline: pcDevices.filter((d) => d.status === 'offline').length,
      };
    });
  }

  // Generate from device data when no PC table
  const pcIds = [
    ...new Set(devices.map((d) => d.pc_id).filter(Boolean) as string[]),
  ];
  return pcIds.map((pcId, idx) => {
    const pcDevices = devices.filter((d) => d.pc_id === pcId);
    const hasOnlineDevice = pcDevices.some(
      (d) => d.status === 'online' || d.status === 'busy',
    );
    return {
      id: pcId,
      pc_number: `PC${String(idx + 1).padStart(2, '0')}`,
      status: hasOnlineDevice ? ('online' as const) : ('offline' as const),
      total: pcDevices.length,
      online: pcDevices.filter((d) => d.status === 'online').length,
      busy: pcDevices.filter((d) => d.status === 'busy').length,
      error: pcDevices.filter((d) => d.status === 'error').length,
      offline: pcDevices.filter((d) => d.status === 'offline').length,
    };
  });
}

export function useDevicesQuery(opts?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: deviceKeys.list(),
    queryFn: async () => {
      const { devices: rawDevices, pcs: rawPCs } = await fetchDevices();
      const devices = rawDevices.map(mapDevice);
      const pcs = mapPCSummaries(rawPCs, devices);
      return { devices, pcs };
    },
    refetchInterval: opts?.refetchInterval,
  });
}

export type { Device, PCSummary };
