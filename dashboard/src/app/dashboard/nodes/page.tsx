'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, type Device } from '@/lib/supabase';
import { DeviceGroup } from '@/components/nodes/device-group';
import { RemoteViewModal } from '@/components/nodes/remote-view-modal';
import { BroadcastControl } from '@/components/nodes/broadcast-control';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Monitor, Wifi, WifiOff, Loader2, Radio } from 'lucide-react';
import { toast } from 'sonner';

// Default device resolution (unified via wm size command)
const UNIFIED_RESOLUTION = { width: 1080, height: 2340 };

export default function NodesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Broadcast control state
  const [masterDeviceId, setMasterDeviceId] = useState<string | null>(null);
  const [slaveDeviceIds, setSlaveDeviceIds] = useState<string[]>([]);
  const [isBroadcastActive, setIsBroadcastActive] = useState(false);

  // Modal-level broadcast state
  const [modalBroadcastEnabled, setModalBroadcastEnabled] = useState(false);

  // Load devices
  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('pc_id', { ascending: true })
        .order('serial_number', { ascending: true });

      if (error) throw error;
      setDevices(data || []);
    } catch (error) {
      console.error('Failed to load devices:', error);
      toast.error('기기 목록 로드 실패');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('nodes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDevices(prev => [...prev, payload.new as Device]);
          } else if (payload.eventType === 'UPDATE') {
            setDevices(prev =>
              prev.map(d => d.id === (payload.new as Device).id ? payload.new as Device : d)
            );
          } else if (payload.eventType === 'DELETE') {
            setDevices(prev =>
              prev.filter(d => d.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Group devices by pc_id
  const devicesByPc = useMemo(() => {
    const grouped: Record<string, Device[]> = {};
    devices.forEach(device => {
      if (!grouped[device.pc_id]) {
        grouped[device.pc_id] = [];
      }
      grouped[device.pc_id].push(device);
    });
    return grouped;
  }, [devices]);

  // Stats
  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status !== 'offline').length;
    const working = devices.filter(d => d.status === 'busy').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    return { total, online, working, offline };
  }, [devices]);

  // Get devices in same PC group as selected device
  const sameGroupDeviceIds = useMemo(() => {
    if (!selectedDevice) return [];
    return devices
      .filter(d => d.pc_id === selectedDevice.pc_id && d.id !== selectedDevice.id)
      .map(d => d.id);
  }, [selectedDevice, devices]);

  // Handle device click
  const handleDeviceClick = useCallback((device: Device) => {
    setSelectedDevice(device);
    setIsModalOpen(true);
    // Auto-enable broadcast if in broadcast mode
    if (isBroadcastActive && masterDeviceId === device.id) {
      setModalBroadcastEnabled(true);
    } else {
      setModalBroadcastEnabled(false);
    }
  }, [isBroadcastActive, masterDeviceId]);

  // Handle device command
  const handleDeviceCommand = useCallback(async (
    deviceId: string,
    command: string,
    params?: Record<string, number | string>
  ) => {
    try {
      const response = await fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIds: [deviceId],
          command,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error('Command failed');
      }

      toast.success('명령 전송됨');
    } catch (error) {
      console.error('Command error:', error);
      toast.error('명령 전송 실패');
    }
  }, []);

  // Handle broadcast command
  const handleBroadcastCommand = useCallback(async (
    command: string,
    params?: Record<string, number>
  ) => {
    if (!masterDeviceId || slaveDeviceIds.length === 0) return;

    const allDeviceIds = [masterDeviceId, ...slaveDeviceIds];

    try {
      const response = await fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIds: allDeviceIds,
          command,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error('Broadcast failed');
      }

      toast.success(`${allDeviceIds.length}대 기기에 명령 전송됨`);
    } catch (error) {
      console.error('Broadcast error:', error);
      toast.error('브로드캐스트 실패');
    }
  }, [masterDeviceId, slaveDeviceIds]);

  // Handle slave toggle
  const handleSlaveToggle = useCallback((deviceId: string) => {
    setSlaveDeviceIds(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  }, []);

  // Unify device resolution (execute wm size command on all devices)
  const unifyResolution = useCallback(async () => {
    const onlineDevices = devices.filter(d => d.status !== 'offline');
    if (onlineDevices.length === 0) {
      toast.error('온라인 기기가 없습니다');
      return;
    }

    try {
      // Send wm size command to all online devices
      const response = await fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIds: onlineDevices.map(d => d.id),
          command: 'shell',
          params: {
            shellCommand: `wm size ${UNIFIED_RESOLUTION.width}x${UNIFIED_RESOLUTION.height}`
          }
        }),
      });

      if (response.ok) {
        toast.success(`${onlineDevices.length}대 기기 해상도 통일 명령 전송됨 (${UNIFIED_RESOLUTION.width}x${UNIFIED_RESOLUTION.height})`);
      }
    } catch (error) {
      console.error('Resolution unify error:', error);
      toast.error('해상도 통일 실패');
    }
  }, [devices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">노드 관제</h1>
          <p className="text-muted-foreground">연결된 기기 상태 및 원격 제어</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={unifyResolution}
            title="모든 기기 해상도 통일"
          >
            <Monitor className="h-4 w-4 mr-2" />
            해상도 통일
          </Button>
          <Button
            variant="outline"
            onClick={loadDevices}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              전체 기기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              온라인
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold text-green-600">{stats.online}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              작업중
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />
              <span className="text-2xl font-bold text-yellow-600">{stats.working}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              오프라인
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-gray-400" />
              <span className="text-2xl font-bold text-gray-500">{stats.offline}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Broadcast Control */}
      <BroadcastControl
        devices={devices}
        masterDeviceId={masterDeviceId}
        slaveDeviceIds={slaveDeviceIds}
        onMasterChange={setMasterDeviceId}
        onSlaveToggle={handleSlaveToggle}
        onBroadcastCommand={handleBroadcastCommand}
        isActive={isBroadcastActive}
        onToggleActive={() => setIsBroadcastActive(!isBroadcastActive)}
      />

      {/* Device Groups */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : Object.keys(devicesByPc).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <WifiOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">연결된 기기가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(devicesByPc).map(([pcId, pcDevices]) => (
            <DeviceGroup
              key={pcId}
              pcId={pcId}
              devices={pcDevices}
              onDeviceClick={handleDeviceClick}
              selectedDeviceId={selectedDevice?.id}
              masterDeviceId={masterDeviceId || undefined}
            />
          ))}
        </div>
      )}

      {/* Remote View Modal */}
      <RemoteViewModal
        device={selectedDevice}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onCommand={handleDeviceCommand}
        broadcastEnabled={modalBroadcastEnabled}
        onBroadcastToggle={setModalBroadcastEnabled}
        broadcastDeviceIds={sameGroupDeviceIds}
        deviceResolution={UNIFIED_RESOLUTION}
      />
    </div>
  );
}
