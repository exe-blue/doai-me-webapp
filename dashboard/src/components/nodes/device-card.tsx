'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Monitor, Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';
import type { Device } from '@/lib/supabase';

interface DeviceCardProps {
  device: Device;
  onClick?: () => void;
  isSelected?: boolean;
  isMaster?: boolean;
}

type DeviceHealthStatus = 'online' | 'working' | 'stale' | 'offline';

function getDeviceHealth(device: Device): DeviceHealthStatus {
  if (device.status === 'offline') return 'offline';
  if (device.status === 'busy') return 'working';

  // Check heartbeat freshness (1 minute threshold)
  if (device.last_seen_at) {
    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes > 1) return 'stale';
  }

  return 'online';
}

function getRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '알 수 없음';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return `${diffSeconds}초 전`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${Math.floor(diffHours / 24)}일 전`;
}

const statusConfig: Record<DeviceHealthStatus, {
  border: string;
  bg: string;
  text: string;
  label: string;
  icon: typeof Wifi;
}> = {
  online: {
    border: 'border-green-500',
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    label: '정상',
    icon: Wifi,
  },
  working: {
    border: 'border-yellow-500',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    label: '작업중',
    icon: Loader2,
  },
  stale: {
    border: 'border-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    label: '응답없음',
    icon: AlertCircle,
  },
  offline: {
    border: 'border-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-500',
    label: '오프라인',
    icon: WifiOff,
  },
};

export function DeviceCard({ device, onClick, isSelected, isMaster }: DeviceCardProps) {
  const health = useMemo(() => getDeviceHealth(device), [device]);
  const config = statusConfig[health];
  const StatusIcon = config.icon;
  const relativeTime = useMemo(() => getRelativeTime(device.last_seen_at), [device.last_seen_at]);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
    >
      <Card
        onClick={onClick}
        className={cn(
          'cursor-pointer border-2 transition-all duration-200',
          config.border,
          config.bg,
          isSelected && 'ring-2 ring-primary ring-offset-2',
          isMaster && 'ring-2 ring-blue-500 ring-offset-2'
        )}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm font-medium truncate max-w-[120px]">
                {device.serial_number.length > 12
                  ? `${device.serial_number.slice(0, 6)}...${device.serial_number.slice(-4)}`
                  : device.serial_number
                }
              </span>
            </div>
            {isMaster && (
              <Badge variant="default" className="bg-blue-500 text-xs">
                Master
              </Badge>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon
              className={cn(
                'h-4 w-4',
                config.text,
                health === 'working' && 'animate-spin'
              )}
            />
            <span className={cn('text-sm font-medium', config.text)}>
              {config.label}
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {device.group_id}
            </Badge>
            <span>{relativeTime}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
