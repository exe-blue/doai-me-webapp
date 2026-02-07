'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@packages/ui';
import {
  RefreshCw,
  Server,
  Smartphone,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Wifi,
  WifiOff,
  Cpu,
  HardDrive,
  Play,
  Loader2,
  Plug,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';

// Worker 정보 타입
interface WorkerDevice {
  deviceId: string;
  state: string;
  adbId: string;
}

interface WorkerMetrics {
  totalJobsExecuted: number;
  successfulJobs: number;
  failedJobs: number;
  averageJobDurationMs: number;
  cpuUsage: number;
  memoryUsage: number;
  uptimeSeconds: number;
}

interface Worker {
  workerId: string;
  type: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  connectionState: string;
  connectedAt: string | null;
  lastHeartbeat: string | null;
  deviceCount: number;
  devices: WorkerDevice[];
  activeJobs: number;
  maxConcurrentJobs: number;
  metrics: WorkerMetrics;
}

interface WorkersSummary {
  totalWorkers: number;
  onlineWorkers: number;
  totalDevices: number;
  activeJobs: number;
}

interface WorkersResponse {
  managerOnline: boolean;
  workers: Worker[];
  summary: WorkersSummary;
}

// Appium 세션 메트릭 타입
interface AppiumMetrics {
  appiumOnline: boolean;
  appiumReady: boolean;
  activeSessions: number;
  maxSessions: number;
  availablePorts: number;
  usedPorts: Record<string, number>;
  activeDevices: string[];
}

// 상태 배지 컴포넌트
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    online: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <Wifi className="h-3 w-3" /> },
    busy: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <Activity className="h-3 w-3" /> },
    offline: { color: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30', icon: <WifiOff className="h-3 w-3" /> },
    error: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <AlertTriangle className="h-3 w-3" /> },
  };

  const { color, icon } = config[status] || config.offline;

  return (
    <Badge variant="outline" className={`font-sans text-xs ${color} flex items-center gap-1`}>
      {icon}
      {status.toUpperCase()}
    </Badge>
  );
}

// 시간 포맷팅 함수
function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return date.toLocaleDateString('ko-KR');
}

export default function WorkersPage() {
  const [data, setData] = useState<WorkersResponse | null>(null);
  const [appiumData, setAppiumData] = useState<AppiumMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Worker + Appium 데이터 병렬 조회
  const fetchWorkers = useCallback(async (showToast = false) => {
    try {
      const [workersRes, appiumRes] = await Promise.all([
        fetch('/api/workers').catch(() => null),
        fetch('/api/appium').catch(() => null),
      ]);

      // Workers 데이터
      if (workersRes && workersRes.ok) {
        const result = await workersRes.json();
        const workersData: WorkersResponse = result.data ?? result;
        setData(workersData);
      }

      // Appium 데이터
      if (appiumRes && appiumRes.ok) {
        const result = await appiumRes.json();
        const metrics: AppiumMetrics = result.data ?? result;
        setAppiumData(metrics);
      }

      if (showToast) {
        toast.success('Worker 상태 갱신됨');
      }
    } catch (error) {
      console.error('Failed to fetch workers:', error);
      if (showToast) {
        toast.error('Worker 조회 실패');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 초기 로딩
  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  // Auto-refresh (5초마다)
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchWorkers();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, fetchWorkers]);

  // 수동 새로고침
  const handleRefresh = () => {
    setRefreshing(true);
    fetchWorkers(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { managerOnline, workers, summary } = data || {
    managerOnline: false,
    workers: [],
    summary: { totalWorkers: 0, onlineWorkers: 0, totalDevices: 0, activeJobs: 0 },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-head text-foreground">Worker 모니터링</h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 border-2 border-foreground ${managerOnline ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-sans text-xs text-muted-foreground">
                Manager: {managerOnline ? '연결됨' : '오프라인'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`font-sans text-xs ${autoRefresh ? 'border-green-700 text-green-400' : 'border-border text-muted-foreground'}`}
          >
            <Activity className={`h-3.5 w-3.5 mr-1.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'AUTO' : 'MANUAL'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="font-sans text-xs border-border hover:border-border"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            REFRESH
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-head font-sans text-xs text-muted-foreground flex items-center gap-2">
              <Server className="h-4 w-4" />
              Workers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-foreground">
              {summary.onlineWorkers}
              <span className="text-muted-foreground">/{summary.totalWorkers}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-head font-sans text-xs text-muted-foreground flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-cyan-400">
              {summary.totalDevices}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-head font-sans text-xs text-muted-foreground flex items-center gap-2">
              <Play className="h-4 w-4" />
              Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-yellow-400">
              {summary.activeJobs}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-head font-sans text-xs text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-green-400">
              {workers.length > 0
                ? Math.round(
                    (workers.reduce((sum, w) => sum + w.metrics.successfulJobs, 0) /
                      Math.max(1, workers.reduce((sum, w) => sum + w.metrics.totalJobsExecuted, 0))) *
                      100
                  )
                : 0}
              %
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workers Table */}
      <Card className="bg-background border-border">
        <CardHeader>
          <CardTitle className="font-head font-sans text-sm text-foreground">
            연결된 Workers ({workers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground font-sans text-sm">연결된 Worker가 없습니다</p>
              <p className="text-muted-foreground font-sans text-xs mt-2">
                {managerOnline
                  ? 'Worker 프로세스를 시작해주세요'
                  : 'Desktop Agent를 먼저 실행해주세요'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-sans text-xs text-muted-foreground">ID</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Type</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Status</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Devices</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Jobs</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Success</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Resources</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Uptime</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Last Heartbeat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.workerId} className="border-border">
                    <TableCell className="font-sans text-xs text-foreground">
                      {worker.workerId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-sans text-xs border-border">
                        {worker.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={worker.status} />
                    </TableCell>
                    <TableCell className="font-sans text-xs">
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-foreground">{worker.deviceCount}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-sans text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-yellow-400">{worker.activeJobs}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-muted-foreground">{worker.maxConcurrentJobs}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-sans text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-green-400">{worker.metrics.successfulJobs}</span>
                        <XCircle className="h-3.5 w-3.5 text-red-400 ml-2" />
                        <span className="text-red-400">{worker.metrics.failedJobs}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-sans text-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Cpu className="h-3 w-3 text-muted-foreground" />
                          <span className="text-foreground">{Math.round(worker.metrics.cpuUsage)}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3 text-muted-foreground" />
                          <span className="text-foreground">{Math.round(worker.metrics.memoryUsage)}%</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-sans text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(worker.metrics.uptimeSeconds)}
                      </div>
                    </TableCell>
                    <TableCell className="font-sans text-xs text-muted-foreground">
                      {formatTimestamp(worker.lastHeartbeat)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Appium Session Monitoring */}
      <Card className="bg-background border-border">
        <CardHeader>
          <CardTitle className="font-head font-sans text-sm text-foreground flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-purple-400" />
              Appium 세션 모니터링
            </div>
            {appiumData ? (
              <Badge
                variant="outline"
                className={`font-sans text-xs flex items-center gap-1 ${
                  appiumData.appiumReady
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}
              >
                {appiumData.appiumReady ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {appiumData.appiumReady ? 'READY' : 'OFFLINE'}
              </Badge>
            ) : (
              <Badge variant="outline" className="font-sans text-xs border-zinc-500/30 text-muted-foreground">
                <Unplug className="h-3 w-3 mr-1" />
                UNKNOWN
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Appium Summary Cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded bg-card border border-border">
              <div className="font-sans text-[10px] text-muted-foreground">Server Status</div>
              <div className="font-sans text-lg mt-1">
                {appiumData?.appiumReady ? (
                  <span className="text-green-400">Ready</span>
                ) : (
                  <span className="text-red-400">Offline</span>
                )}
              </div>
            </div>
            <div className="p-3 rounded bg-card border border-border">
              <div className="font-sans text-[10px] text-muted-foreground">Active Sessions</div>
              <div className="font-sans text-lg mt-1 text-foreground">
                {appiumData?.activeSessions ?? 0}
                <span className="text-muted-foreground">/{appiumData?.maxSessions ?? 10}</span>
              </div>
            </div>
            <div className="p-3 rounded bg-card border border-border">
              <div className="font-sans text-[10px] text-muted-foreground">Available Ports</div>
              <div className="font-sans text-lg mt-1 text-cyan-400">
                {appiumData?.availablePorts ?? 0}
              </div>
            </div>
            <div className="p-3 rounded bg-card border border-border">
              <div className="font-sans text-[10px] text-muted-foreground">Port Usage</div>
              <div className="mt-2">
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-300"
                    style={{
                      width: `${
                        appiumData
                          ? Math.round(
                              (Object.keys(appiumData.usedPorts).length /
                                Math.max(1, appiumData.availablePorts + Object.keys(appiumData.usedPorts).length)) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="font-sans text-[10px] text-muted-foreground mt-1">
                  {appiumData ? Object.keys(appiumData.usedPorts).length : 0} used
                </div>
              </div>
            </div>
          </div>

          {/* Active Sessions Table */}
          {appiumData && appiumData.activeDevices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-sans text-xs text-muted-foreground">Device UDID</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Port</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appiumData.activeDevices.map((deviceUdid) => (
                  <TableRow key={deviceUdid} className="border-border">
                    <TableCell className="font-sans text-xs text-foreground">
                      {deviceUdid}
                    </TableCell>
                    <TableCell className="font-sans text-xs text-cyan-400">
                      {appiumData.usedPorts[deviceUdid] ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="font-sans text-xs bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1 w-fit"
                      >
                        <Activity className="h-3 w-3" />
                        ACTIVE
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Smartphone className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground font-sans text-xs">
                {appiumData?.appiumReady
                  ? '활성 Appium 세션이 없습니다'
                  : 'Appium 서버에 연결할 수 없습니다'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Worker Details */}
      {workers.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {workers.map((worker) => (
            <Card key={worker.workerId} className="bg-background border-border">
              <CardHeader className="pb-3">
                <CardTitle className="font-head font-sans text-sm text-foreground flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-cyan-400" />
                    {worker.workerId}
                  </div>
                  <StatusBadge status={worker.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Devices List */}
                <div>
                  <h4 className="font-sans text-xs text-muted-foreground mb-2">연결된 디바이스 ({worker.devices.length})</h4>
                  <div className="space-y-1">
                    {worker.devices.length === 0 ? (
                      <p className="font-sans text-xs text-muted-foreground">디바이스 없음</p>
                    ) : (
                      worker.devices.slice(0, 5).map((device) => (
                        <div
                          key={device.deviceId}
                          className="flex items-center justify-between px-2 py-1 rounded bg-card"
                        >
                          <span className="font-sans text-xs text-foreground">{device.adbId}</span>
                          <Badge
                            variant="outline"
                            className={`font-sans text-[10px] ${
                              device.state === 'IDLE'
                                ? 'border-green-500/30 text-green-400'
                                : device.state === 'RUNNING'
                                ? 'border-yellow-500/30 text-yellow-400'
                                : 'border-zinc-500/30 text-muted-foreground'
                            }`}
                          >
                            {device.state}
                          </Badge>
                        </div>
                      ))
                    )}
                    {worker.devices.length > 5 && (
                      <p className="font-sans text-[10px] text-muted-foreground text-center mt-1">
                        +{worker.devices.length - 5} more devices
                      </p>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-card">
                    <div className="font-sans text-[10px] text-muted-foreground">Total Jobs</div>
                    <div className="font-sans text-lg text-foreground">{worker.metrics.totalJobsExecuted}</div>
                  </div>
                  <div className="p-2 rounded bg-card">
                    <div className="font-sans text-[10px] text-muted-foreground">Avg Duration</div>
                    <div className="font-sans text-lg text-foreground">
                      {Math.round(worker.metrics.averageJobDurationMs / 1000)}s
                    </div>
                  </div>
                  <div className="p-2 rounded bg-card">
                    <div className="font-sans text-[10px] text-muted-foreground">Success Rate</div>
                    <div className="font-sans text-lg text-green-400">
                      {worker.metrics.totalJobsExecuted > 0
                        ? Math.round((worker.metrics.successfulJobs / worker.metrics.totalJobsExecuted) * 100)
                        : 0}
                      %
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
