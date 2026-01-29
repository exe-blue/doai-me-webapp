'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    <Card className={cn(
      'transition-all',
      isActive && 'ring-2 ring-blue-500'
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              브로드캐스트 제어
            </CardTitle>
            <CardDescription>
              마스터 기기의 동작을 슬레이브 기기들에 동기화
            </CardDescription>
          </div>
          <Button
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleActive}
          >
            {isActive ? (
              <>
                <Pause className="h-4 w-4 mr-1" />
                비활성화
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                활성화
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Master Selection */}
        <div>
          <label className="text-sm font-medium mb-2 block">마스터 기기</label>
          <div className="flex flex-wrap gap-2">
            {onlineDevices.map((device) => (
              <Button
                key={device.id}
                variant={masterDeviceId === device.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => onMasterChange(masterDeviceId === device.id ? null : device.id)}
                className={cn(
                  masterDeviceId === device.id && 'bg-blue-500 hover:bg-blue-600'
                )}
              >
                {device.serial_number.slice(-6)}
              </Button>
            ))}
          </div>
          {masterDevice && (
            <p className="text-xs text-muted-foreground mt-2">
              선택됨: {masterDevice.serial_number}
            </p>
          )}
        </div>

        {/* Slave Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">슬레이브 기기</label>
            <Button
              variant="ghost"
              size="sm"
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
            >
              <Users className="h-4 w-4 mr-1" />
              전체 선택
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            {onlineDevices
              .filter(d => d.id !== masterDeviceId)
              .map((device) => (
                <label
                  key={device.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={slaveDeviceIds.includes(device.id)}
                    onCheckedChange={() => onSlaveToggle(device.id)}
                    disabled={!isActive}
                  />
                  <span className="text-sm">{device.serial_number.slice(-6)}</span>
                </label>
              ))}
          </div>
          {slaveDeviceIds.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {slaveDeviceIds.length}대 선택됨
            </p>
          )}
        </div>

        {/* Quick Commands */}
        {isActive && masterDeviceId && slaveDeviceIds.length > 0 && (
          <div>
            <label className="text-sm font-medium mb-2 block">빠른 명령</label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCommand('keyevent', { keycode: 4 })}
                disabled={isBroadcasting}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                뒤로
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCommand('keyevent', { keycode: 3 })}
                disabled={isBroadcasting}
              >
                <Home className="h-4 w-4 mr-1" />
                홈
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCommand('tap', { x: 540, y: 1200 })}
                disabled={isBroadcasting}
              >
                <MousePointer className="h-4 w-4 mr-1" />
                중앙 탭
              </Button>
            </div>
          </div>
        )}

        {/* Status */}
        {isActive && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <div className={cn(
              'w-2 h-2 rounded-full',
              masterDeviceId && slaveDeviceIds.length > 0
                ? 'bg-green-500 animate-pulse'
                : 'bg-yellow-500'
            )} />
            <span className="text-sm text-muted-foreground">
              {masterDeviceId && slaveDeviceIds.length > 0
                ? '브로드캐스트 준비됨'
                : '마스터와 슬레이브를 선택하세요'
              }
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
