'use client';

import { DeviceCard } from './device-card';
import { Server } from 'lucide-react';
import type { Device } from '@/lib/supabase';

interface DeviceGroupProps {
  pcId: string;
  devices: Device[];
  onDeviceClick: (device: Device) => void;
  selectedDeviceId?: string;
  masterDeviceId?: string;
}

export function DeviceGroup({
  pcId,
  devices,
  onDeviceClick,
  selectedDeviceId,
  masterDeviceId
}: DeviceGroupProps) {
  const onlineCount = devices.filter(d => d.status !== 'offline').length;
  const workingCount = devices.filter(d => d.status === 'busy').length;
  const totalCount = devices.length;

  return (
    <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden">
      {/* Header - Terminal style */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <Server className="h-4 w-4 text-zinc-500" />
          <span className="font-mono text-sm font-bold text-white">
            {pcId}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
            <span className="text-green-400">{onlineCount}</span>
          </div>
          {workingCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.5)]" />
              <span className="text-yellow-400">{workingCount}</span>
            </div>
          )}
          <span className="text-zinc-600">/{totalCount}</span>
        </div>
      </div>

      {/* Device Grid - Bento style (optimized for 20 devices per section) */}
      <div className="p-3">
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
          {devices.map((device, index) => (
            <DeviceCard
              key={device.serial_number || device.id || index}
              device={device}
              onClick={() => onDeviceClick(device)}
              isSelected={device.id === selectedDeviceId}
              isMaster={device.id === masterDeviceId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
