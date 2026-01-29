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

/**
 * Extract slot ID from pc_id (e.g., "P01-B01S01" -> "B01S01")
 */
function extractSlotId(pcId: string | undefined): string {
  if (!pcId) return 'UNKNOWN';
  const match = pcId.match(/(B\d+S\d+)/);
  return match ? match[1] : pcId;
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

  // Extract slot ID for header (B01S01)
  const slotId = extractSlotId(device.pc_id);
  // Show last 4 chars of serial
  const serialShort = device.serial_number?.slice(-4)?.toUpperCase() || '----';

  const handleClick = () => {
    if (health === 'offline') {
      toast.error('연결되지 않은 기기입니다', {
        description: `${slotId}가 오프라인 상태입니다.`,
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
          // Base styles - Compact MagicUI aesthetic
          'relative cursor-pointer rounded-md border overflow-hidden transition-all duration-200',
          'bg-gradient-to-b bg-black dark:bg-zinc-950',
          config.bgGradient,
          config.borderColor,
          config.glowColor,
          // Selected state
          isSelected && 'ring-1 ring-primary border-primary',
          // Master badge glow
          isMaster && 'ring-1 ring-blue-500 border-blue-500',
          // Offline state
          health === 'offline' && 'opacity-60 cursor-not-allowed'
        )}
      >
        {/* Neon Status Bar (Top) */}
        <div className={cn('h-0.5 w-full', config.neonBar)} />

        {/* Content - Compact */}
        <div className="p-2">
          {/* Header: Slot ID + Master Badge */}
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-xs font-bold text-white">
              {slotId}
            </span>
            {isMaster && (
              <span className="text-[8px] font-mono font-semibold text-blue-400 bg-blue-500/20 px-1 rounded">
                M
              </span>
            )}
          </div>

          {/* Body: IP (single row) */}
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="font-mono text-zinc-500">
              {serialShort}
            </span>
            <span className="font-mono text-cyan-400 truncate ml-1">
              {device.ip && device.ip !== '-' ? device.ip.split('.').slice(-1)[0] : '---'}
            </span>
          </div>

          {/* Footer: Status Label */}
          <div className={cn('font-mono text-[10px] font-medium text-center', config.labelColor)}>
            {config.label}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
