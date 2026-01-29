'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Radio,
  Users,
  Play,
  Pause,
  Home,
  ArrowLeft,
  MousePointer
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Device } from '@/lib/supabase';

interface BroadcastControlProps {
  devices: Device[];
  masterDeviceId: string | null;
  slaveDeviceIds: string[];
  onMasterChange: (deviceId: string | null) => void;
  onSlaveToggle: (deviceId: string) => void;
  onBroadcastCommand: (command: string, params?: Record<string, number>) => void | Promise<void>;
  isActive: boolean;
  onToggleActive: () => void;
}

// Extract B{Board}S{Slot} format from pc_id (e.g., "P01-B01S02" -> "B01S02")
function getSlotName(device: Device): string {
  const pcId = device.pc_id;
  if (pcId) {
    const match = pcId.match(/(B\d+S\d+)/);
    if (match) return match[1];
  }
  // Fallback to last 6 chars of serial
  return device.serial_number?.slice(-6) || 'UNKNOWN';
}

export function BroadcastControl({
  devices,
  masterDeviceId,
  slaveDeviceIds,
  onMasterChange,
  onSlaveToggle,
  onBroadcastCommand,
  isActive,
  onToggleActive
}: BroadcastControlProps) {
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handleCommand = useCallback(async (command: string, params?: Record<string, number>) => {
    if (!isActive || !masterDeviceId || slaveDeviceIds.length === 0) return;

    setIsBroadcasting(true);
    try {
      await onBroadcastCommand(command, params);
    } finally {
      setIsBroadcasting(false);
    }
  }, [isActive, masterDeviceId, slaveDeviceIds, onBroadcastCommand]);

  const masterDevice = devices.find(d => d.id === masterDeviceId);
  const onlineDevices = devices.filter(d => d.status !== 'offline');

  return (
    <div className={cn(
      'rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden transition-all',
      isActive && 'ring-1 ring-blue-500/50 border-blue-500/50'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <Radio className="h-4 w-4 text-zinc-500" />
          <div>
            <span className="font-mono text-sm font-bold text-white">BROADCAST_CONTROL</span>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
              Sync master actions to slaves
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleActive}
          className={cn(
            'font-mono text-xs border-zinc-700',
            isActive
              ? 'bg-blue-500/20 border-blue-500 text-blue-400 hover:bg-blue-500/30'
              : 'hover:border-zinc-600 hover:bg-zinc-900'
          )}
        >
          {isActive ? (
            <>
              <Pause className="h-3 w-3 mr-1" />
              STOP
            </>
          ) : (
            <>
              <Play className="h-3 w-3 mr-1" />
              START
            </>
          )}
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Master Selection */}
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase block mb-2">
            Master Device
          </label>
          <div className="flex flex-wrap gap-1.5">
            {onlineDevices.map((device, index) => (
              <button
                key={device.serial_number || device.id || index}
                onClick={() => onMasterChange(masterDeviceId === device.id ? null : device.id)}
                className={cn(
                  'px-2 py-1 rounded text-xs font-mono transition-all',
                  'border border-zinc-700 hover:border-zinc-600',
                  masterDeviceId === device.id
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                    : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                )}
              >
                {getSlotName(device)}
              </button>
            ))}
          </div>
          {masterDevice && (
            <p className="font-mono text-[10px] text-zinc-600 mt-2">
              Selected: {getSlotName(masterDevice)}
            </p>
          )}
        </div>

        {/* Slave Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-mono text-[10px] text-zinc-500 uppercase">
              Slave Devices
            </label>
            <button
              onClick={() => {
                const allIds = onlineDevices
                  .filter(d => d.id !== masterDeviceId)
                  .map(d => d.id);
                allIds.forEach(id => {
                  if (!slaveDeviceIds.includes(id)) {
                    onSlaveToggle(id);
                  }
                });
              }}
              className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <Users className="h-3 w-3" />
              SELECT_ALL
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {onlineDevices
              .filter(d => d.id !== masterDeviceId)
              .map((device, index) => (
                <label
                  key={device.serial_number || device.id || index}
                  className="flex items-center gap-2 cursor-pointer group"
                >
                  <Checkbox
                    checked={slaveDeviceIds.includes(device.id)}
                    onCheckedChange={() => onSlaveToggle(device.id)}
                    disabled={!isActive}
                    className="border-zinc-600 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                  />
                  <span className="font-mono text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
                    {getSlotName(device)}
                  </span>
                </label>
              ))}
          </div>
          {slaveDeviceIds.length > 0 && (
            <p className="font-mono text-[10px] text-zinc-600 mt-2">
              {slaveDeviceIds.length} devices selected
            </p>
          )}
        </div>

        {/* Quick Commands */}
        {isActive && masterDeviceId && slaveDeviceIds.length > 0 && (
          <div>
            <label className="font-mono text-[10px] text-zinc-500 uppercase block mb-2">
              Quick Commands
            </label>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCommand('keyevent', { keycode: 4 })}
                disabled={isBroadcasting}
                className="font-mono text-xs border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900"
              >
                <ArrowLeft className="h-3 w-3 mr-1" />
                BACK
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCommand('keyevent', { keycode: 3 })}
                disabled={isBroadcasting}
                className="font-mono text-xs border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900"
              >
                <Home className="h-3 w-3 mr-1" />
                HOME
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCommand('tap', { x: 540, y: 1200 })}
                disabled={isBroadcasting}
                className="font-mono text-xs border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900"
              >
                <MousePointer className="h-3 w-3 mr-1" />
                TAP
              </Button>
            </div>
          </div>
        )}

        {/* Status */}
        {isActive && (
          <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
            <div className={cn(
              'w-2 h-2 rounded-full',
              masterDeviceId && slaveDeviceIds.length > 0
                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                : 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]'
            )} />
            <span className="font-mono text-xs text-zinc-500">
              {masterDeviceId && slaveDeviceIds.length > 0
                ? 'BROADCAST_READY'
                : 'SELECT_MASTER_AND_SLAVES'
              }
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
