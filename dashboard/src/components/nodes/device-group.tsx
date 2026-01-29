'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5" />
            {pcId}
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-green-600">
              {onlineCount} 온라인
            </Badge>
            {workingCount > 0 && (
              <Badge variant="outline" className="text-yellow-600">
                {workingCount} 작업중
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onClick={() => onDeviceClick(device)}
              isSelected={device.id === selectedDeviceId}
              isMaster={device.id === masterDeviceId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
