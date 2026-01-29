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
import { RefreshCw, Monitor, WifiOff, Loader2, Zap, Sun, Volume2, Filter, AlertCircle, ChevronDown, Home, Youtube, Power, RotateCcw, AppWindow } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
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
  // Status checkboxes: Normal (Sleep+Running), Error, Offline
  const [showNormal, setShowNormal] = useState(true);
  const [showError, setShowError] = useState(true);
  const [showOffline, setShowOffline] = useState(true);

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

  // Get unique PC list for filter (extract PC code like P01 from P01-001)
  const pcList = useMemo(() => {
    const pcs = new Set<string>();
    devices.forEach(d => {
      if (d.pc_id && d.pc_id.startsWith('P')) {
        // Extract PC code (P01) from pc_id (P01-001)
        const pcCode = d.pc_id.split('-')[0];
        if (pcCode) pcs.add(pcCode);
      }
    });
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

  // Helper function to determine device health status
  const getDeviceHealthStatus = useCallback((device: Device) => {
    if (device.status === 'offline') return 'offline';
    if (device.status === 'busy') return 'running'; // Running (working)
    // Check heartbeat freshness (1 minute threshold)
    if (device.last_seen_at) {
      const lastSeen = new Date(device.last_seen_at);
      const diffMs = Date.now() - lastSeen.getTime();
      if (diffMs > 60000) return 'error';
    }
    return 'sleep'; // Normal/Sleep state
  }, []);

  // Filter devices - includes strict naming convention filter
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      // STRICT FILTER: Only show devices with valid naming convention (P{PC}-{001~999})
      // This filters out garbage data like "device", "List", "TEST-PC"
      if (!device.pc_id || !device.pc_id.startsWith('P')) return false;

      // PC filter (e.g., P01, P02)
      if (filterPC !== 'all') {
        // Extract PC code (P01, P02) from pc_id (P01-001)
        const devicePcCode = device.pc_id.split('-')[0];
        if (devicePcCode !== filterPC) return false;
      }

      // Board filter - now simplified (no B/S logic, just for backwards compat)
      if (filterBoard !== 'all') {
        // Skip board filter if no board info in naming
        const match = device.pc_id?.match(/B(\d+)/);
        if (match) {
          const deviceBoard = `B${match[1].padStart(2, '0')}`;
          if (deviceBoard !== filterBoard) return false;
        }
      }

      // Status checkbox filter
      const healthStatus = getDeviceHealthStatus(device);

      // Normal = sleep (idle) + running (busy)
      if (!showNormal && (healthStatus === 'sleep' || healthStatus === 'running')) return false;
      if (!showError && healthStatus === 'error') return false;
      if (!showOffline && healthStatus === 'offline') return false;

      return true;
    });
  }, [devices, filterPC, filterBoard, showNormal, showError, showOffline, getDeviceHealthStatus]);

  // Group devices by PC code (P01, P02) - extract from pc_id like P01-001
  const devicesByPc = useMemo(() => {
    const grouped: Record<string, Device[]> = {};
    filteredDevices.forEach(device => {
      // Extract PC code (P01) from pc_id (P01-001)
      const pcCode = device.pc_id?.split('-')[0] || 'UNKNOWN';
      if (!grouped[pcCode]) {
        grouped[pcCode] = [];
      }
      grouped[pcCode].push(device);
    });
    // Sort devices within each group by their sequential number
    Object.keys(grouped).forEach(pcCode => {
      grouped[pcCode].sort((a, b) => {
        const numA = parseInt(a.pc_id?.split('-')[1] || '0', 10);
        const numB = parseInt(b.pc_id?.split('-')[1] || '0', 10);
        return numA - numB;
      });
    });
    return grouped;
  }, [filteredDevices]);

  // Stats (from valid devices only - those with pc_id starting with 'P')
  const stats = useMemo(() => {
    // Filter to valid devices only
    const validDevices = devices.filter(d => d.pc_id && d.pc_id.startsWith('P'));
    const total = validDevices.length;
    const online = validDevices.filter(d => d.status !== 'offline').length;
    const working = validDevices.filter(d => d.status === 'busy').length;
    const offline = validDevices.filter(d => d.status === 'offline').length;
    // Error: stale heartbeat (over 1 minute)
    const error = validDevices.filter(d => {
      if (d.status === 'offline') return false;
      if (d.last_seen_at) {
        const lastSeen = new Date(d.last_seen_at);
        const diffMs = Date.now() - lastSeen.getTime();
        return diffMs > 60000;
      }
      return false;
    }).length;
    // Count unique PC codes (P01, P02, etc.)
    const pcCount = new Set(validDevices.map(d => d.pc_id?.split('-')[0])).size;
    return { total, online, working, offline, error, pcCount };
  }, [devices]);

  // Get devices in same PC group as selected device (by PC code like P01)
  const sameGroupDeviceIds = useMemo(() => {
    if (!selectedDevice) return [];
    const selectedPcCode = selectedDevice.pc_id?.split('-')[0];
    return devices
      .filter(d => d.pc_id?.split('-')[0] === selectedPcCode && d.id !== selectedDevice.id)
      .map(d => d.id);
  }, [selectedDevice, devices]);

  // Get broadcast devices info for modal
  const broadcastDevices = useMemo(() => {
    if (!selectedDevice) return [];
    const selectedPcCode = selectedDevice.pc_id?.split('-')[0];
    return devices
      .filter(d => d.pc_id?.split('-')[0] === selectedPcCode && d.id !== selectedDevice.id)
      .map(d => ({
        id: d.id,
        name: d.pc_id || 'UNKNOWN', // Display full pc_id (P01-001 format)
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

  // Get target devices for batch actions (filtered devices that are not offline)
  const getTargetDevices = useCallback(() => {
    return filteredDevices.filter(d => d.status !== 'offline');
  }, [filteredDevices]);

  // Batch Actions: Wake Up All (filtered devices)
  const wakeUpAll = useCallback(() => {
    const targetDevices = getTargetDevices();
    if (targetDevices.length === 0) {
      toast.error('대상 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = targetDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'keyevent', { keycode: 224 }); // KEYCODE_WAKEUP = 224
    toast.success(`${targetDevices.length}대 기기 화면 켜기 명령 전송됨`);
  }, [getTargetDevices, isConnected, broadcastCommand]);

  // Batch Actions: Home All (filtered devices)
  const homeAll = useCallback(() => {
    const targetDevices = getTargetDevices();
    if (targetDevices.length === 0) {
      toast.error('대상 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = targetDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'keyevent', { keycode: 3 }); // KEYCODE_HOME = 3
    toast.success(`${targetDevices.length}대 기기 홈 화면 이동 명령 전송됨`);
  }, [getTargetDevices, isConnected, broadcastCommand]);

  // Batch Actions: Reboot All (filtered devices)
  const rebootAll = useCallback(() => {
    const targetDevices = getTargetDevices();
    if (targetDevices.length === 0) {
      toast.error('대상 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = targetDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'shell', { shellCommand: 'reboot' });
    toast.success(`${targetDevices.length}대 기기 재부팅 명령 전송됨`);
  }, [getTargetDevices, isConnected, broadcastCommand]);

  // Batch Actions: Restart App (YouTube)
  const restartAppAll = useCallback(() => {
    const targetDevices = getTargetDevices();
    if (targetDevices.length === 0) {
      toast.error('대상 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = targetDevices.map(d => d.id);
    // Force stop and restart YouTube
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: 'am force-stop com.google.android.youtube && am start -n com.google.android.youtube/.HomeActivity'
    });
    toast.success(`${targetDevices.length}대 기기 앱 재시작 명령 전송됨`);
  }, [getTargetDevices, isConnected, broadcastCommand]);

  // Batch Actions: YouTube All (filtered devices)
  const openYoutubeAll = useCallback(() => {
    const targetDevices = getTargetDevices();
    if (targetDevices.length === 0) {
      toast.error('대상 기기가 없습니다');
      return;
    }

    if (!isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    const deviceIds = targetDevices.map(d => d.id);
    broadcastCommand(deviceIds, 'shell', {
      shellCommand: 'am start -n com.google.android.youtube/.HomeActivity'
    });
    toast.success(`${targetDevices.length}대 기기 YouTube 앱 열기 명령 전송됨`);
  }, [getTargetDevices, isConnected, broadcastCommand]);

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
                BATCH ({getTargetDevices().length})
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mono text-xs bg-zinc-900 border-zinc-700">
              <div className="px-2 py-1.5 text-[10px] text-zinc-500">
                대상: 필터된 {getTargetDevices().length}대 기기
              </div>
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem onClick={wakeUpAll} className="cursor-pointer">
                <Power className="h-3.5 w-3.5 mr-2 text-yellow-400" />
                Wake Up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={homeAll} className="cursor-pointer">
                <Home className="h-3.5 w-3.5 mr-2 text-blue-400" />
                Go Home
              </DropdownMenuItem>
              <DropdownMenuItem onClick={rebootAll} className="cursor-pointer">
                <RotateCcw className="h-3.5 w-3.5 mr-2 text-orange-400" />
                Reboot
              </DropdownMenuItem>
              <DropdownMenuItem onClick={restartAppAll} className="cursor-pointer">
                <AppWindow className="h-3.5 w-3.5 mr-2 text-cyan-400" />
                Restart App
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem onClick={openYoutubeAll} className="cursor-pointer">
                <Youtube className="h-3.5 w-3.5 mr-2 text-red-400" />
                YouTube 실행
              </DropdownMenuItem>
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
      <div className="flex items-center gap-4 p-3 rounded-md border border-zinc-800 bg-black dark:bg-zinc-950">
        <Filter className="h-4 w-4 text-zinc-500" />

        {/* Group Filters */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-500 uppercase">Groups:</span>
          {/* PC Select */}
          <Select value={filterPC} onValueChange={setFilterPC}>
            <SelectTrigger className="w-[100px] h-7 font-mono text-xs bg-zinc-900 border-zinc-700">
              <SelectValue placeholder="PC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All PC</SelectItem>
              {pcList.map(pc => (
                <SelectItem key={pc} value={pc}>{pc}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Board Select */}
          <Select value={filterBoard} onValueChange={setFilterBoard}>
            <SelectTrigger className="w-[90px] h-7 font-mono text-xs bg-zinc-900 border-zinc-700">
              <SelectValue placeholder="Board" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Board</SelectItem>
              {boardList.map(board => (
                <SelectItem key={board} value={board}>{board}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-zinc-800" />

        {/* Status Checkboxes */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-zinc-500 uppercase">Status:</span>

          {/* Normal (Sleep + Running) */}
          <label className="flex items-center gap-1.5 cursor-pointer group">
            <Checkbox
              checked={showNormal}
              onCheckedChange={(checked) => setShowNormal(checked === true)}
              className="h-4 w-4 border-zinc-600 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
            />
            <span className="font-mono text-xs text-zinc-400 group-hover:text-zinc-300">
              Normal
            </span>
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          </label>

          {/* Error */}
          <label className="flex items-center gap-1.5 cursor-pointer group">
            <Checkbox
              checked={showError}
              onCheckedChange={(checked) => setShowError(checked === true)}
              className="h-4 w-4 border-zinc-600 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
            />
            <span className="font-mono text-xs text-zinc-400 group-hover:text-zinc-300">
              Error
            </span>
            <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
          </label>

          {/* Offline */}
          <label className="flex items-center gap-1.5 cursor-pointer group">
            <Checkbox
              checked={showOffline}
              onCheckedChange={(checked) => setShowOffline(checked === true)}
              className="h-4 w-4 border-zinc-600 data-[state=checked]:bg-zinc-500 data-[state=checked]:border-zinc-500"
            />
            <span className="font-mono text-xs text-zinc-400 group-hover:text-zinc-300">
              Offline
            </span>
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
          </label>
        </div>

        {/* Filter count */}
        <span className="font-mono text-xs text-zinc-600 ml-auto">
          {filteredDevices.length} / {devices.length}
        </span>

        {/* Reset filter */}
        {(filterPC !== 'all' || filterBoard !== 'all' || !showNormal || !showError || !showOffline) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterPC('all');
              setFilterBoard('all');
              setShowNormal(true);
              setShowError(true);
              setShowOffline(true);
            }}
            className="h-7 font-mono text-xs text-zinc-400 hover:text-white"
          >
            Reset
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
