'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Device } from '@/lib/supabase';
import { DeviceGroup } from '@/components/nodes/device-group';
import { RemoteViewModal } from '@/components/nodes/remote-view-modal';
import { BroadcastControl } from '@/components/nodes/broadcast-control';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Monitor, WifiOff, Loader2, Zap, Sun, Volume2, Filter, AlertCircle, ChevronDown, Home, Youtube, Power } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useSocketContext } from '@/contexts/socket-context';

const SETTINGS_STORAGE_KEY = 'doaime-settings';

// Default device settings (fallback)
const DEFAULT_DEVICE_SETTINGS = {
  resolution: { width: 1080, height: 2340 },
  brightness: 0,
  volume: 0,
};

// Load device settings from global settings
function getDeviceSettingsFromStorage() {
  if (typeof window === 'undefined') return DEFAULT_DEVICE_SETTINGS;
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!stored) return DEFAULT_DEVICE_SETTINGS;
  try {
    const settings = JSON.parse(stored);
    return {
      resolution: {
        width: settings.defaultResolutionWidth ?? DEFAULT_DEVICE_SETTINGS.resolution.width,
        height: settings.defaultResolutionHeight ?? DEFAULT_DEVICE_SETTINGS.resolution.height,
      },
      brightness: settings.defaultBrightness ?? DEFAULT_DEVICE_SETTINGS.brightness,
      volume: settings.defaultVolume ?? DEFAULT_DEVICE_SETTINGS.volume,
    };
  } catch {
    return DEFAULT_DEVICE_SETTINGS;
  }
}

export default function NodesPage() {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deviceSettings, setDeviceSettings] = useState(DEFAULT_DEVICE_SETTINGS);

  // Filter state
  const [filterPC, setFilterPC] = useState<string>('all');
  const [filterBoard, setFilterBoard] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Load settings from localStorage on mount
  useEffect(() => {
    setDeviceSettings(getDeviceSettingsFromStorage());
  }, []);

  // Socket.io integration - ONLY use real-time data, no mock/fallback
  const { isConnected, devices, sendCommand, broadcastCommand } = useSocketContext();

  // Broadcast control state
  const [masterDeviceId, setMasterDeviceId] = useState<string | null>(null);
  const [slaveDeviceIds, setSlaveDeviceIds] = useState<string[]>([]);
  const [isBroadcastActive, setIsBroadcastActive] = useState(false);

  // Modal-level broadcast state
  const [modalBroadcastEnabled, setModalBroadcastEnabled] = useState(false);

  // Loading state based on connection
  const isLoading = !isConnected;

  // Get unique PC list for filter
  const pcList = useMemo(() => {
    const pcs = new Set(devices.map(d => d.pc_id));
    return Array.from(pcs).sort();
  }, [devices]);

  // Get unique Board list for filter (extract B## from pc_id like P01-B01S01)
  const boardList = useMemo(() => {
    const boards = new Set<string>();
    devices.forEach(d => {
      const match = d.pc_id?.match(/B(\d+)/);
      if (match) {
        boards.add(`B${match[1].padStart(2, '0')}`);
      }
    });
    return Array.from(boards).sort();
  }, [devices]);

  // Filter devices
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      // PC filter
      if (filterPC !== 'all' && device.pc_id !== filterPC) return false;

      // Board filter (extract B## from pc_id)
      if (filterBoard !== 'all') {
        const match = device.pc_id?.match(/B(\d+)/);
        const deviceBoard = match ? `B${match[1].padStart(2, '0')}` : null;
        if (deviceBoard !== filterBoard) return false;
      }

      // Status filter
      if (filterStatus === 'idle' && device.status !== 'idle') return false;
      if (filterStatus === 'running' && device.status !== 'busy') return false;
      if (filterStatus === 'error') {
        // Check if device is stale (no heartbeat for 1 minute)
        if (device.last_seen_at) {
          const lastSeen = new Date(device.last_seen_at);
          const diffMs = Date.now() - lastSeen.getTime();
          if (diffMs < 60000) return false; // Not stale
        }
        if (device.status === 'offline') return true;
        return false;
      }
      if (filterStatus === 'offline' && device.status !== 'offline') return false;

      return true;
    });
  }, [devices, filterPC, filterBoard, filterStatus]);

  // Group devices by pc_id (filtered)
  const devicesByPc = useMemo(() => {
    const grouped: Record<string, Device[]> = {};
    filteredDevices.forEach(device => {
      if (!grouped[device.pc_id]) {
        grouped[device.pc_id] = [];
      }
      grouped[device.pc_id].push(device);
    });
    return grouped;
  }, [filteredDevices]);

  // Stats (from all devices, not filtered)
  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status !== 'offline').length;
    const working = devices.filter(d => d.status === 'busy').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    // Error: stale heartbeat (over 1 minute)
    const error = devices.filter(d => {
      if (d.status === 'offline') return false;
      if (d.last_seen_at) {
        const lastSeen = new Date(d.last_seen_at);
        const diffMs = Date.now() - lastSeen.getTime();
        return diffMs > 60000;
      }
      return false;
    }).length;
    const pcCount = new Set(devices.map(d => d.pc_id)).size;
    return { total, online, working, offline, error, pcCount };
  }, [devices]);

  // Get devices in same PC group as selected device
  const sameGroupDeviceIds = useMemo(() => {
    if (!selectedDevice) return [];
    return devices
      .filter(d => d.pc_id === selectedDevice.pc_id && d.id !== selectedDevice.id)
      .map(d => d.id);
  }, [selectedDevice, devices]);

  // Get broadcast devices info for modal
  // Extract slot name (B01S02) from full pc_id (P01-B01S02)
  const extractSlotName = (pcId: string | undefined): string => {
    if (!pcId) return 'UNKNOWN';
    const match = pcId.match(/(B\d+S\d+)/);
    return match ? match[1] : pcId;
  };

  const broadcastDevices = useMemo(() => {
    if (!selectedDevice) return [];
    return devices
      .filter(d => d.pc_id === selectedDevice.pc_id && d.id !== selectedDevice.id)
      .map(d => ({
        id: d.id,
        name: extractSlotName(d.pc_id), // Display B01S02 format
        status: d.status
      }));
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

  // Handle device command via Socket.io
  const handleDeviceCommand = useCallback((
    deviceId: string,
    command: string,
    params?: Record<string, number | string>
  ) => {
    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }
    sendCommand(deviceId, command, params);
    toast.success('명령 전송됨');
  }, [isConnected, sendCommand]);

  // Handle broadcast command via Socket.io
  const handleBroadcastCommand = useCallback((
    command: string,
    params?: Record<string, number>
  ) => {
    if (!masterDeviceId || slaveDeviceIds.length === 0) return;

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const allDeviceIds = [masterDeviceId, ...slaveDeviceIds];
    broadcastCommand(allDeviceIds, command, params);
    toast.success(`${allDeviceIds.length}대 기기에 명령 전송됨`);
  }, [isConnected, masterDeviceId, slaveDeviceIds, broadcastCommand]);

  // Handle slave toggle
  const handleSlaveToggle = useCallback((deviceId: string) => {
    setSlaveDeviceIds(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  }, []);

  // Unify device resolution (execute wm size command on all devices) via Socket.io
  const unifyResolution = useCallback(() => {
    const onlineDevices = devices.filter(d => d.status !== 'offline');
    if (onlineDevices.length === 0) {
      toast.error('온라인 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = onlineDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: `wm size ${deviceSettings.resolution.width}x${deviceSettings.resolution.height}`
    });
    toast.success(`${onlineDevices.length}대 기기 해상도 통일 명령 전송됨 (${deviceSettings.resolution.width}x${deviceSettings.resolution.height})`);
  }, [devices, isConnected, broadcastCommand, deviceSettings]);

  // Initialize all devices (resolution + brightness + volume)
  const initializeAllDevices = useCallback(() => {
    const onlineDevices = devices.filter(d => d.status !== 'offline');
    if (onlineDevices.length === 0) {
      toast.error('온라인 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = onlineDevices.map(d => d.id);

    // 1. Set resolution
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: `wm size ${deviceSettings.resolution.width}x${deviceSettings.resolution.height}`
    });

    // 2. Set brightness to minimum (using settings command)
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: `settings put system screen_brightness ${deviceSettings.brightness}`
    });

    // 3. Set volume to 0 (media volume)
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: `media volume --stream 3 --set ${deviceSettings.volume}`
    });

    toast.success(`${onlineDevices.length}대 기기 초기화 명령 전송됨 (해상도 + 밝기 + 볼륨)`);
  }, [devices, isConnected, broadcastCommand, deviceSettings]);

  // Set brightness on all devices
  const setBrightnessAll = useCallback(() => {
    const onlineDevices = devices.filter(d => d.status !== 'offline');
    if (onlineDevices.length === 0) {
      toast.error('온라인 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = onlineDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: `settings put system screen_brightness ${deviceSettings.brightness}`
    });
    toast.success(`${onlineDevices.length}대 기기 밝기 최소화 명령 전송됨`);
  }, [devices, isConnected, broadcastCommand, deviceSettings]);

  // Set volume to 0 on all devices
  const setVolumeAll = useCallback(() => {
    const onlineDevices = devices.filter(d => d.status !== 'offline');
    if (onlineDevices.length === 0) {
      toast.error('온라인 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = onlineDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: `media volume --stream 3 --set ${deviceSettings.volume}`
    });
    toast.success(`${onlineDevices.length}대 기기 볼륨 음소거 명령 전송됨`);
  }, [devices, isConnected, broadcastCommand, deviceSettings]);

  // Batch Actions: Wake Up All
  const wakeUpAll = useCallback(() => {
    const onlineDevices = devices.filter(d => d.status !== 'offline');
    if (onlineDevices.length === 0) {
      toast.error('온라인 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = onlineDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'keyevent', { keycode: 224 }); // KEYCODE_WAKEUP = 224
    toast.success(`${onlineDevices.length}대 기기 화면 켜기 명령 전송됨`);
  }, [devices, isConnected, broadcastCommand]);

  // Batch Actions: Home All
  const homeAll = useCallback(() => {
    const onlineDevices = devices.filter(d => d.status !== 'offline');
    if (onlineDevices.length === 0) {
      toast.error('온라인 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = onlineDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'keyevent', { keycode: 3 }); // KEYCODE_HOME = 3
    toast.success(`${onlineDevices.length}대 기기 홈 화면 이동 명령 전송됨`);
  }, [devices, isConnected, broadcastCommand]);

  // Batch Actions: YouTube All
  const openYoutubeAll = useCallback(() => {
    const onlineDevices = devices.filter(d => d.status !== 'offline');
    if (onlineDevices.length === 0) {
      toast.error('온라인 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = onlineDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: 'am start -n com.google.android.youtube/.HomeActivity'
    });
    toast.success(`${onlineDevices.length}대 기기 YouTube 앱 열기 명령 전송됨`);
  }, [devices, isConnected, broadcastCommand]);

  return (
    <div className="space-y-6">
      {/* Header - Dev Tool Style */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono font-bold text-foreground">기기관리</h1>
          <div className="flex items-center gap-3 mt-2">
            {/* Connection Status Indicator */}
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
              <span className="font-mono text-xs text-zinc-400">
                {isConnected ? '연결됨' : '연결 끊김'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Batch Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!isConnected}
                className="font-mono text-xs border-green-700 bg-green-500/10 text-green-400 hover:border-green-600 hover:bg-green-500/20"
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                BATCH_ACTIONS
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mono text-xs bg-zinc-900 border-zinc-700">
              <DropdownMenuItem onClick={wakeUpAll} className="cursor-pointer">
                <Power className="h-3.5 w-3.5 mr-2 text-yellow-400" />
                전체 화면 켜기
              </DropdownMenuItem>
              <DropdownMenuItem onClick={homeAll} className="cursor-pointer">
                <Home className="h-3.5 w-3.5 mr-2 text-blue-400" />
                전체 홈 화면
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openYoutubeAll} className="cursor-pointer">
                <Youtube className="h-3.5 w-3.5 mr-2 text-red-400" />
                전체 YouTube 실행
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem onClick={initializeAllDevices} className="cursor-pointer">
                <Zap className="h-3.5 w-3.5 mr-2 text-purple-400" />
                전체 초기화
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={unifyResolution}
            disabled={!isConnected}
            className="font-mono text-xs border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900"
          >
            <Monitor className="h-3.5 w-3.5 mr-1.5" />
            UNIFY_RES
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={setBrightnessAll}
            disabled={!isConnected}
            className="font-mono text-xs border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900"
          >
            <Sun className="h-3.5 w-3.5 mr-1.5" />
            BRIGHTNESS
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={setVolumeAll}
            disabled={!isConnected}
            className="font-mono text-xs border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900"
          >
            <Volume2 className="h-3.5 w-3.5 mr-1.5" />
            MUTE
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            disabled={isLoading}
            className="font-mono text-xs border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH
          </Button>
        </div>
      </div>

      {/* Stats - Dev Tool Bento Grid */}
      <div className="grid grid-cols-5 gap-2">
        {/* Total */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">총 기기</span>
            <Monitor className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <span className="font-mono text-2xl font-bold text-white">{stats.total}</span>
        </div>

        {/* Online */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">대기</span>
            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          </div>
          <span className="font-mono text-2xl font-bold text-green-400">{stats.online}</span>
        </div>

        {/* Working */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">작업중</span>
            <div className="h-2 w-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
          </div>
          <span className="font-mono text-2xl font-bold text-yellow-400">{stats.working}</span>
        </div>

        {/* Error */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">오류</span>
            <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
          </div>
          <span className="font-mono text-2xl font-bold text-red-400">{stats.error}</span>
        </div>

        {/* Offline Count */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">오프라인</span>
            <div className="h-2 w-2 rounded-full bg-zinc-500" />
          </div>
          <span className="font-mono text-2xl font-bold text-zinc-400">{stats.offline}</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 p-3 rounded-md border border-zinc-800 bg-black dark:bg-zinc-950">
        <Filter className="h-4 w-4 text-zinc-500" />
        <span className="font-mono text-xs text-zinc-500">필터:</span>

        {/* PC Select */}
        <Select value={filterPC} onValueChange={setFilterPC}>
          <SelectTrigger className="w-[140px] h-8 font-mono text-xs bg-zinc-900 border-zinc-700">
            <SelectValue placeholder="전체 PC" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 PC</SelectItem>
            {pcList.map(pc => (
              <SelectItem key={pc} value={pc}>{pc}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Board Select */}
        <Select value={filterBoard} onValueChange={setFilterBoard}>
          <SelectTrigger className="w-[120px] h-8 font-mono text-xs bg-zinc-900 border-zinc-700">
            <SelectValue placeholder="전체 보드" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 보드</SelectItem>
            {boardList.map(board => (
              <SelectItem key={board} value={board}>{board}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Select */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-8 font-mono text-xs bg-zinc-900 border-zinc-700">
            <SelectValue placeholder="전체 상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="idle">대기</SelectItem>
            <SelectItem value="running">작업중</SelectItem>
            <SelectItem value="error">오류</SelectItem>
            <SelectItem value="offline">오프라인</SelectItem>
          </SelectContent>
        </Select>

        {/* Filter count */}
        <span className="font-mono text-xs text-zinc-600 ml-auto">
          {filteredDevices.length} / {devices.length}개 기기
        </span>

        {/* Reset filter */}
        {(filterPC !== 'all' || filterBoard !== 'all' || filterStatus !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterPC('all'); setFilterBoard('all'); setFilterStatus('all'); }}
            className="h-8 font-mono text-xs text-zinc-400 hover:text-white"
          >
            초기화
          </Button>
        )}
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
        <div className="flex flex-col items-center justify-center py-16 rounded-md border border-zinc-800 bg-black dark:bg-zinc-950">
          <Loader2 className="h-6 w-6 animate-spin text-primary mb-3" />
          <span className="font-mono text-xs text-zinc-500">연결중...</span>
        </div>
      ) : Object.keys(devicesByPc).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-md border border-zinc-800 border-dashed bg-black dark:bg-zinc-950">
          <WifiOff className="h-8 w-8 text-zinc-600 mb-3" />
          <span className="font-mono text-sm text-zinc-500">연결된 기기 없음</span>
          <span className="font-mono text-xs text-zinc-600 mt-1">워커 연결 대기중...</span>
        </div>
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
        broadcastDevices={broadcastDevices}
        deviceResolution={deviceSettings.resolution}
      />
    </div>
  );
}
