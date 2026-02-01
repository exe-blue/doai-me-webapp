'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { Device } from '@/lib/supabase';
import { toast } from 'sonner';

interface DeviceCardProps {
  device: Device;
  onClick?: () => void;
  isSelected?: boolean;
  isMaster?: boolean;
}

// 상태 정의: Running(작업중), Sleep(대기중), Error(오류), Offline(연결끊김)
type DeviceHealthStatus = 'running' | 'sleep' | 'error' | 'offline';

function getDeviceHealth(device: Device): DeviceHealthStatus {
  if (device.status === 'offline') return 'offline';
  if (device.status === 'busy') return 'running';

  // Check heartbeat freshness (1 minute threshold)
  if (device.last_seen_at) {
    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes > 1) return 'error';
  }

  return 'sleep';
}

const statusConfig: Record<DeviceHealthStatus, {
  bgGradient: string;
  borderColor: string;
  glowColor: string;
  label: string;
  labelColor: string;
  neonBar: string;
}> = {
  running: {
    bgGradient: 'from-yellow-500/5 to-transparent',
    borderColor: 'border-yellow-500/30 hover:border-yellow-500/50',
    glowColor: 'shadow-[0_0_15px_rgba(234,179,8,0.15)]',
    label: '작업중',
    labelColor: 'text-yellow-400',
    neonBar: 'bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]',
  },
  sleep: {
    bgGradient: 'from-green-500/5 to-transparent',
    borderColor: 'border-green-500/30 hover:border-green-500/50',
    glowColor: 'shadow-[0_0_15px_rgba(34,197,94,0.15)]',
    label: '대기',
    labelColor: 'text-green-400',
    neonBar: 'bg-gradient-to-r from-green-500 via-green-400 to-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]',
  },
  error: {
    bgGradient: 'from-red-500/5 to-transparent',
    borderColor: 'border-red-500/30 hover:border-red-500/50',
    glowColor: 'shadow-[0_0_15px_rgba(239,68,68,0.15)]',
    label: '오류',
    labelColor: 'text-red-400',
    neonBar: 'bg-gradient-to-r from-red-500 via-red-400 to-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]',
  },
  offline: {
    bgGradient: 'from-zinc-500/5 to-transparent',
    borderColor: 'border-zinc-700 hover:border-zinc-600',
    glowColor: '',
    label: '오프라인',
    labelColor: 'text-zinc-500',
    neonBar: 'bg-zinc-700',
  },
};

export function DeviceCard({ device, onClick, isSelected, isMaster }: DeviceCardProps) {
  const health = useMemo(() => getDeviceHealth(device), [device]);
  const config = statusConfig[health];

  // Device name: use pc_id directly (P01-001 format)
  const deviceName = device.pc_id || 'UNKNOWN';
  // Serial: show first 4 chars
  const serialShort = device.serial_number?.slice(0, 4)?.toLowerCase() || '----';
  // IP validation - check both ip (socket) and ip_address (DB) fields
  const ipValue = device.ip || device.ip_address;
  const hasValidIp = ipValue && ipValue !== '-' && ipValue !== '';

  const handleClick = () => {
    if (health === 'offline') {
      toast.error('연결되지 않은 기기입니다', {
        description: `${deviceName}가 오프라인 상태입니다.`,
      });
      return;
    }
    onClick?.();
  };

  return (
    <motion.div
      whileHover={{ scale: health !== 'offline' ? 1.02 : 1 }}
      whileTap={{ scale: health !== 'offline' ? 0.98 : 1 }}
      transition={{ duration: 0.1 }}
    >
      <div
        onClick={handleClick}
        className={cn(
          // Base styles - MagicUI aesthetic
          'relative cursor-pointer rounded-md border overflow-hidden transition-all duration-200',
          'bg-gradient-to-b bg-black dark:bg-zinc-950',
          config.bgGradient,
          config.borderColor,
          config.glowColor,
          // Selected state
          isSelected && 'ring-1 ring-primary border-primary',
          // Master badge glow
          isMaster && 'ring-1 ring-blue-500 border-blue-500',
          // Offline state - Ghost style but visible
          health === 'offline' && 'opacity-50'
        )}
      >
        {/* Neon Status Bar (Top) */}
        <div className={cn('h-0.5 w-full', config.neonBar)} />

        {/* Content */}
        <div className="p-2.5">
          {/* Header: Device Name (P01-001) - Large, Bold */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-sm font-bold text-white">
              {deviceName}
            </span>
            {isMaster && (
              <span className="text-[8px] font-mono font-semibold text-blue-400 bg-blue-500/20 px-1 rounded">
                M
              </span>
            )}
          </div>

          {/* Row 1: Serial */}
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="font-mono text-zinc-500">Serial:</span>
            <span className="font-mono text-zinc-400">
              {serialShort}...
            </span>
          </div>

          {/* Row 2: IP - Full display */}
          <div className="flex items-center justify-between text-[10px] mb-2">
            <span className="font-mono text-zinc-500">IP:</span>
            <span className={cn(
              'font-mono',
              hasValidIp ? 'text-green-400' : 'text-red-400'
            )}>
              {hasValidIp ? ipValue : 'No IP'}
            </span>
          </div>

          {/* Status Badge */}
          <div className={cn(
            'font-mono text-[10px] font-medium text-center py-0.5 rounded',
            health === 'offline' ? 'bg-zinc-800/50 text-zinc-500' : `${config.labelColor}`
          )}>
            {config.label}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
