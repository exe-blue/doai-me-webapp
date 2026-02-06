"use client";

import { useState, useEffect, useRef } from "react";
import {
  Smartphone,
  Server,
  Search,
  RefreshCw,
  MoreHorizontal,
  Battery,
  BatteryLow,
  BatteryWarning,
  BatteryCharging,
  WifiOff,
  Power,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LayoutGrid,
  List,
  Trash2,
  Zap,
  HardDrive,
  Cpu,
  Activity,
  ChevronDown,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { StatsCard } from "@/components/ui/stats-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface Device {
  id: string;
  device_id: string;
  pc_id: string | null;
  pc_number?: string;
  device_number?: number;
  management_code?: string;
  name: string;
  model: string;
  android_version: string;
  status: "online" | "offline" | "busy" | "error";
  battery_level: number;
  is_charging: boolean;
  memory_used: number;
  memory_total: number;
  storage_used: number;
  storage_total: number;
  cpu_usage: number;
  temperature: number;
  wifi_signal: number;
  current_task_id: string | null;
  last_heartbeat: string;
  uptime_seconds: number;
  total_tasks_completed: number;
  total_tasks_failed: number;
  error_message: string | null;
  created_at: string;
  connection_type?: "usb" | "wifi" | "adb_wifi";
  usb_port?: number;
}

interface PCSummary {
  id: string;
  pc_number: string;
  label?: string;
  status: "online" | "offline";
  total: number;
  online: number;
  busy: number;
  error: number;
  offline: number;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  online: { label: "온라인", color: "bg-green-400 text-green-900 border-green-900", icon: CheckCircle2 },
  busy: { label: "작업중", color: "bg-blue-400 text-blue-900 border-blue-900", icon: Activity },
  offline: { label: "오프라인", color: "bg-gray-400 text-gray-900 border-gray-900", icon: WifiOff },
  error: { label: "오류", color: "bg-red-400 text-red-900 border-red-900", icon: AlertTriangle },
};

// 시간 포맷 함수
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return date.toLocaleDateString("ko-KR");
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
}

function getBatteryIcon(level: number, isCharging: boolean) {
  if (isCharging) return BatteryCharging;
  if (level < 20) return BatteryLow;
  if (level < 50) return BatteryWarning;
  return Battery;
}

function getBatteryColor(level: number): string {
  if (level < 20) return "text-red-500";
  if (level < 50) return "text-yellow-500";
  return "text-green-500";
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [pcs, setPCs] = useState<PCSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pcFilter, setPCFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchDevices();

    if (isAutoRefresh) {
      refreshInterval.current = setInterval(fetchDevices, 5000);
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [isAutoRefresh]);

  async function fetchDevices() {
    try {
      // API에서 디바이스 및 PC 목록 조회
      const [devicesRes, pcsRes] = await Promise.all([
        fetch("/api/devices?limit=1000"),
        fetch("/api/pcs"),
      ]);

      const devicesResult = await devicesRes.json();
      const pcsResult = await pcsRes.json();

      // 디바이스 데이터 매핑
      const deviceList = devicesResult.devices || devicesResult.data?.items || [];
      const fetchedDevices: Device[] = deviceList.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        device_id: (d.device_id as string) || (d.id as string),
        pc_id: (d.pc_id as string) || null,
        pc_number: (d.pc_number as string) || undefined,
        device_number: (d.device_number as number) || undefined,
        management_code: (d.management_code as string) || undefined,
        name: (d.management_code as string) || `Device ${d.id}`,
        model: (d.model as string) || "Unknown",
        android_version: (d.android_version as string) || "Unknown",
        status: ((d.status as string) || "offline") as Device["status"],
        battery_level: (d.battery_level as number) ?? 0,
        is_charging: (d.is_charging as boolean) ?? false,
        memory_used: (d.memory_used as number) ?? 0,
        memory_total: (d.memory_total as number) ?? 4096,
        storage_used: (d.storage_used as number) ?? 0,
        storage_total: (d.storage_total as number) ?? 64,
        cpu_usage: (d.cpu_usage as number) ?? 0,
        temperature: (d.temperature as number) ?? 35,
        wifi_signal: (d.wifi_signal as number) ?? 80,
        current_task_id: (d.current_task_id as string) || (d.current_job_id as string) || null,
        last_heartbeat: (d.last_heartbeat as string) || new Date().toISOString(),
        uptime_seconds: (d.uptime_seconds as number) ?? 0,
        total_tasks_completed: (d.total_tasks_completed as number) ?? (d.completed_jobs as number) ?? 0,
        total_tasks_failed: (d.total_tasks_failed as number) ?? (d.failed_jobs as number) ?? 0,
        error_message: (d.error_message as string) || null,
        created_at: (d.created_at as string) || new Date().toISOString(),
        connection_type: (d.connection_type as "usb" | "wifi" | "adb_wifi") || undefined,
        usb_port: (d.usb_port as number) || undefined,
      }));

      setDevices(fetchedDevices);

      // PC 목록 매핑 (API에서 가져오거나, 디바이스 기반으로 생성)
      const pcList = pcsResult.pcs || [];
      if (pcList.length > 0) {
        const pcSummaries: PCSummary[] = pcList.map((pc: Record<string, unknown>) => {
          const pcDevices = fetchedDevices.filter((d) => d.pc_id === pc.id);
          const hasOnlineDevice = pcDevices.some((d) => 
            d.status === "online" || d.status === "busy"
          );
          return {
            id: pc.id as string,
            pc_number: pc.pc_number as string,
            label: (pc.label as string) || (pc.pc_number as string),
            status: (pc.status as "online" | "offline") || (hasOnlineDevice ? "online" : "offline"),
            total: pcDevices.length,
            online: pcDevices.filter((d) => d.status === "online").length,
            busy: pcDevices.filter((d) => d.status === "busy").length,
            error: pcDevices.filter((d) => d.status === "error").length,
            offline: pcDevices.filter((d) => d.status === "offline").length,
          };
        });
        setPCs(pcSummaries);
      } else {
        // PC 테이블이 없는 경우 디바이스 기반으로 생성
        const pcIds = [...new Set(fetchedDevices.map((d) => d.pc_id).filter(Boolean) as string[])];
        const pcSummaries: PCSummary[] = pcIds.map((pcId, idx) => {
          const pcDevices = fetchedDevices.filter((d) => d.pc_id === pcId);
          const hasOnlineDevice = pcDevices.some((d) => 
            d.status === "online" || d.status === "busy"
          );
          return {
            id: pcId,
            pc_number: `PC${String(idx + 1).padStart(2, "0")}`,
            status: hasOnlineDevice ? "online" : "offline",
            total: pcDevices.length,
            online: pcDevices.filter((d) => d.status === "online").length,
            busy: pcDevices.filter((d) => d.status === "busy").length,
            error: pcDevices.filter((d) => d.status === "error").length,
            offline: pcDevices.filter((d) => d.status === "offline").length,
          };
        });
        setPCs(pcSummaries);
      }
    } catch (error) {
      console.error("Error fetching devices:", error);
      setDevices([]);
      setPCs([]);
    } finally {
      setLoading(false);
    }
  }

  async function sendCommand(deviceIds: string[], command: string) {
    try {
      const response = await fetch("/api/devices/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceIds, command }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      if (!result.success) {
        throw new Error(result.error || "명령 전송 실패");
      }

      alert(`${deviceIds.length}대에 ${command} 명령을 성공적으로 전송했습니다`);
      setSelectedDevices([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      alert(`명령 전송 실패: ${message}`);
      console.error("sendCommand error:", error);
    }
  }

  async function rebootDevice(deviceId: string) {
    await sendCommand([deviceId], "reboot");
  }

  async function restartYouTube(deviceId: string) {
    await sendCommand([deviceId], "restart_youtube");
  }

  async function clearCache(deviceId: string) {
    await sendCommand([deviceId], "clear_cache");
  }

  // 필터링
  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.device_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (device.management_code?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    const matchesPC = pcFilter === "all" || device.pc_id === pcFilter;
    const matchesStatus = statusFilter === "all" || device.status === statusFilter;
    return matchesSearch && matchesPC && matchesStatus;
  });

  // 통계
  const stats = {
    total: devices.length,
    online: devices.filter((d) => d.status === "online").length,
    busy: devices.filter((d) => d.status === "busy").length,
    error: devices.filter((d) => d.status === "error").length,
    offline: devices.filter((d) => d.status === "offline").length,
    lowBattery: devices.filter((d) => d.battery_level < 20 && d.status !== "offline").length,
  };

  const isAllSelected = filteredDevices.length > 0 && selectedDevices.length === filteredDevices.length;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-head font-bold text-foreground flex items-center gap-2">
              <Smartphone className="h-6 w-6" />
              디바이스 관리
            </h1>
            <p className="text-sm text-muted-foreground">
              {stats.total}대 디바이스 상태를 관리합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={isAutoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            >
              {isAutoRefresh ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {isAutoRefresh ? "자동 갱신" : "자동 갱신 꺼짐"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchDevices}>
              <RefreshCw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
        </div>

        {/* 상태 요약 카드 */}
        <div className="grid grid-cols-6 gap-4">
          <StatsCard label="전체" value={stats.total} icon={<Smartphone className="h-8 w-8" />} />
          <StatsCard variant="success" label="온라인" value={stats.online} icon={<CheckCircle2 className="h-8 w-8" />} />
          <StatsCard variant="info" label="작업중" value={stats.busy} icon={<Activity className="h-8 w-8" />} />
          <StatsCard variant="danger" label="오류" value={stats.error} icon={<AlertTriangle className="h-8 w-8" />} />
          <StatsCard variant="muted" label="오프라인" value={stats.offline} icon={<WifiOff className="h-8 w-8" />} />
          <StatsCard variant="warning" label="배터리 부족" value={stats.lowBattery} icon={<BatteryLow className="h-8 w-8" />} />
        </div>

        {/* PC별 요약 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              PC별 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {pcs.map((pc) => (
              <div
                key={pc.id}
                className={`p-3 border-2 cursor-pointer transition-all ${
                  pcFilter === pc.id
                    ? "border-primary bg-primary/10 shadow-[2px_2px_0px_0px] shadow-primary"
                    : pc.status === "offline"
                    ? "border-muted-foreground opacity-60"
                    : "border-foreground hover:bg-muted"
                }`}
                onClick={() => setPCFilter(pcFilter === pc.id ? "all" : pc.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-foreground">{pc.pc_number}</span>
                  <Badge
                    className={`${
                      pc.status === "online" ? "bg-green-400 text-green-900 border-green-900" : "bg-gray-400 text-gray-900 border-gray-900"
                    } text-xs border-2 font-bold`}
                  >
                    {pc.status === "online" ? "ON" : "OFF"}
                  </Badge>
                </div>

                <div className="grid grid-cols-4 gap-1 text-xs">
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="text-center p-1 border border-green-600 bg-green-100 dark:bg-green-900/30">
                        <div className="font-bold text-green-600">{pc.online}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>대기</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="text-center p-1 border border-blue-600 bg-blue-100 dark:bg-blue-900/30">
                        <div className="font-bold text-blue-600">{pc.busy}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>작업중</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="text-center p-1 border border-red-600 bg-red-100 dark:bg-red-900/30">
                        <div className="font-bold text-red-600">{pc.error}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>오류</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="text-center p-1 border border-gray-600 bg-gray-100 dark:bg-gray-900/30">
                        <div className="font-bold text-gray-600">{pc.offline}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>오프라인</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
          </CardContent>
        </Card>

        {/* 필터 & 검색 */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="디바이스 검색..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="online">온라인</SelectItem>
              <SelectItem value="busy">작업중</SelectItem>
              <SelectItem value="error">오류</SelectItem>
              <SelectItem value="offline">오프라인</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex border-2 border-foreground">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {selectedDevices.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Zap className="mr-2 h-4 w-4" />
                  {selectedDevices.length}대 선택됨
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>벌크 액션</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => sendCommand(selectedDevices, "reboot")}>
                  <Power className="mr-2 h-4 w-4" />
                  재부팅
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendCommand(selectedDevices, "restart_youtube")}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  YouTube 재시작
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendCommand(selectedDevices, "clear_cache")}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  캐시 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* 디바이스 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-6 gap-3">
            {filteredDevices.slice(0, 120).map((device) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const _StatusIcon = statusConfig[device.status]?.icon || CheckCircle2;
              const BattIcon = getBatteryIcon(device.battery_level, device.is_charging);

              return (
                <div
                  key={device.id}
                  className={`p-3 border-2 cursor-pointer transition-all ${
                    selectedDevices.includes(device.id)
                      ? "border-primary bg-primary/10 shadow-[2px_2px_0px_0px] shadow-primary"
                      : "border-foreground hover:bg-muted"
                  } ${device.status === "offline" ? "opacity-50" : ""}`}
                  onClick={() => {
                    setSelectedDevice(device);
                    setIsDetailOpen(true);
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedDevices.includes(device.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedDevices([...selectedDevices, device.id]);
                          } else {
                            setSelectedDevices(selectedDevices.filter((id) => id !== device.id));
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-sm font-bold text-foreground">{device.device_id}</span>
                    </div>
                    <Badge
                      className={`${statusConfig[device.status]?.color || "bg-gray-400 text-gray-900 border-gray-900"} text-xs border-2 font-bold`}
                    >
                      {statusConfig[device.status]?.label || device.status}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    {/* 배터리 */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <BattIcon className={`h-3 w-3 ${getBatteryColor(device.battery_level)}`} />
                        <span>{device.battery_level}%</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Cpu className="h-3 w-3" />
                        <span>{device.cpu_usage}%</span>
                      </div>
                    </div>

                    {/* 메모리 */}
                    <Progress
                      value={(device.memory_used / device.memory_total) * 100}
                      className="h-2"
                    />

                    {/* 상태 메시지 */}
                    {device.status === "busy" && (
                      <div className="text-xs text-blue-600 font-medium truncate">작업 실행중</div>
                    )}
                    {device.status === "error" && (
                      <div className="text-xs text-red-600 font-medium truncate">{device.error_message}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedDevices(filteredDevices.map((d) => d.id));
                        } else {
                          setSelectedDevices([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>디바이스</TableHead>
                  <TableHead>PC / 관리번호</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>배터리</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>메모리</TableHead>
                  <TableHead>온도</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>마지막 접속</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.slice(0, 100).map((device) => {
                  const StatusIcon = statusConfig[device.status]?.icon || CheckCircle2;
                  const BattIcon = getBatteryIcon(device.battery_level, device.is_charging);

                  return (
                    <TableRow
                      key={device.id}
                      className={`${device.status === "offline" ? "opacity-50" : ""}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedDevices.includes(device.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedDevices([...selectedDevices, device.id]);
                            } else {
                              setSelectedDevices(selectedDevices.filter((id) => id !== device.id));
                            }
                          }}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-bold text-foreground">{device.device_id}</div>
                            <div className="text-xs text-muted-foreground">{device.model}</div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {device.management_code || (device.pc_id ? `${device.pc_id}` : "-")}
                      </TableCell>

                      <TableCell>
                        <Badge
                          className={`${statusConfig[device.status]?.color || "bg-gray-400 text-gray-900 border-gray-900"} border-2 font-bold`}
                        >
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusConfig[device.status]?.label || device.status}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <BattIcon className={`h-4 w-4 ${getBatteryColor(device.battery_level)}`} />
                          <span>{device.battery_level}%</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={device.cpu_usage} className="h-3 w-16" />
                          <span className="text-xs text-muted-foreground">{device.cpu_usage}%</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={(device.memory_used / device.memory_total) * 100}
                            className="h-3 w-16"
                          />
                          <span className="text-xs text-muted-foreground">
                            {Math.round(device.memory_used / 1024)}GB
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className={device.temperature > 40 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                          {device.temperature}°C
                        </span>
                      </TableCell>

                      <TableCell className="text-muted-foreground">{formatUptime(device.uptime_seconds)}</TableCell>

                      <TableCell className="text-muted-foreground">
                        {formatTimeAgo(device.last_heartbeat)}
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedDevice(device);
                                setIsDetailOpen(true);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              상세 보기
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => rebootDevice(device.id)}>
                              <Power className="mr-2 h-4 w-4" />
                              재부팅
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => restartYouTube(device.id)}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              YouTube 재시작
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => clearCache(device.id)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              캐시 삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {filteredDevices.length > 120 && viewMode === "grid" && (
          <p className="text-center text-sm text-muted-foreground">
            {filteredDevices.length}대 중 120대 표시 (필터를 사용하여 더 많은 디바이스를 확인하세요)
          </p>
        )}

        {/* 디바이스 상세 다이얼로그 */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                {selectedDevice?.device_id}
              </DialogTitle>
              <DialogDescription>{selectedDevice?.name}</DialogDescription>
            </DialogHeader>

            {selectedDevice && (
              <div className="space-y-4">
                {/* 상태 */}
                <div className="flex items-center gap-2">
                  <Badge
                    className={`${statusConfig[selectedDevice.status]?.color || "bg-gray-400 text-gray-900 border-gray-900"} border-2 font-bold`}
                  >
                    {statusConfig[selectedDevice.status]?.label || selectedDevice.status}
                  </Badge>
                  {selectedDevice.status === "error" && (
                    <span className="text-sm text-red-600 font-medium">{selectedDevice.error_message}</span>
                  )}
                </div>

                {/* 기본 정보 */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted border-2 border-foreground">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">모델</p>
                    <p className="font-bold text-foreground">{selectedDevice.model}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Android</p>
                    <p className="font-bold text-foreground">{selectedDevice.android_version}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">관리번호</p>
                    <p className="font-bold text-foreground">
                      {selectedDevice.management_code || (selectedDevice.pc_id ? selectedDevice.pc_id : "-")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Uptime</p>
                    <p className="font-bold text-foreground">{formatUptime(selectedDevice.uptime_seconds)}</p>
                  </div>
                </div>

                {/* 리소스 */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-1 text-muted-foreground font-medium">
                        <Battery className="h-4 w-4" />
                        배터리
                      </span>
                      <span className="text-foreground font-bold">{selectedDevice.battery_level}%</span>
                    </div>
                    <Progress value={selectedDevice.battery_level} className="h-3" />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-1 text-muted-foreground font-medium">
                        <Cpu className="h-4 w-4" />
                        CPU
                      </span>
                      <span className="text-foreground font-bold">{selectedDevice.cpu_usage}%</span>
                    </div>
                    <Progress value={selectedDevice.cpu_usage} className="h-3" />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-1 text-muted-foreground font-medium">
                        <HardDrive className="h-4 w-4" />
                        메모리
                      </span>
                      <span className="text-foreground font-bold">
                        {Math.round(selectedDevice.memory_used / 1024)}GB /{" "}
                        {Math.round(selectedDevice.memory_total / 1024)}GB
                      </span>
                    </div>
                    <Progress
                      value={(selectedDevice.memory_used / selectedDevice.memory_total) * 100}
                      className="h-3"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-1 text-muted-foreground font-medium">
                        <HardDrive className="h-4 w-4" />
                        저장소
                      </span>
                      <span className="text-foreground font-bold">
                        {selectedDevice.storage_used}GB / {selectedDevice.storage_total}GB
                      </span>
                    </div>
                    <Progress
                      value={(selectedDevice.storage_used / selectedDevice.storage_total) * 100}
                      className="h-3"
                    />
                  </div>
                </div>

                {/* 통계 */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted border-2 border-foreground">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {selectedDevice.total_tasks_completed}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">완료 작업</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {selectedDevice.total_tasks_failed}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">실패 작업</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{selectedDevice.temperature}°C</div>
                    <div className="text-xs text-muted-foreground font-medium">온도</div>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => rebootDevice(selectedDevice.id)}
                  >
                    <Power className="mr-2 h-4 w-4" />
                    재부팅
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => restartYouTube(selectedDevice.id)}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    YouTube 재시작
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => clearCache(selectedDevice.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    캐시 삭제
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
