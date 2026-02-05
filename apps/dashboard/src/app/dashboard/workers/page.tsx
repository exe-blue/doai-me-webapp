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
} from '@/components/ui/table';
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

// 상태 배지 컴포넌트
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    online: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <Wifi className="h-3 w-3" /> },
    busy: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <Activity className="h-3 w-3" /> },
    offline: { color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', icon: <WifiOff className="h-3 w-3" /> },
    error: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <AlertTriangle className="h-3 w-3" /> },
  };

  const { color, icon } = config[status] || config.offline;

  return (
    <Badge variant="outline" className={`font-mono text-xs ${color} flex items-center gap-1`}>
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Worker 데이터 조회
  const fetchWorkers = useCallback(async (showToast = false) => {
    try {
      const response = await fetch('/api/workers');
      if (!response.ok) throw new Error('Failed to fetch workers');
      const result = await response.json();
      // API 응답이 { success: true, data: WorkersResponse } 형태일 수 있음
      const workersData: WorkersResponse = result.data ?? result;
      setData(workersData);
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
          <h1 className="text-xl font-mono font-bold text-foreground">Worker 모니터링</h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${managerOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
              <span className="font-mono text-xs text-zinc-400">
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
            className={`font-mono text-xs ${autoRefresh ? 'border-green-700 text-green-400' : 'border-zinc-700 text-zinc-400'}`}
          >
            <Activity className={`h-3.5 w-3.5 mr-1.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'AUTO' : 'MANUAL'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="font-mono text-xs border-zinc-700 hover:border-zinc-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            REFRESH
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-black border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-xs text-zinc-500 flex items-center gap-2">
              <Server className="h-4 w-4" />
              Workers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-white">
              {summary.onlineWorkers}
              <span className="text-zinc-600">/{summary.totalWorkers}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-xs text-zinc-500 flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-cyan-400">
              {summary.totalDevices}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-xs text-zinc-500 flex items-center gap-2">
              <Play className="h-4 w-4" />
              Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-yellow-400">
              {summary.activeJobs}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-xs text-zinc-500 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-green-400">
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
      <Card className="bg-black border-zinc-800">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-zinc-300">
            연결된 Workers ({workers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <WifiOff className="h-12 w-12 text-zinc-600 mb-4" />
              <p className="text-zinc-500 font-mono text-sm">연결된 Worker가 없습니다</p>
              <p className="text-zinc-600 font-mono text-xs mt-2">
                {managerOnline
                  ? 'Worker 프로세스를 시작해주세요'
                  : 'Desktop Agent를 먼저 실행해주세요'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="font-mono text-xs text-zinc-500">ID</TableHead>
                  <TableHead className="font-mono text-xs text-zinc-500">Type</TableHead>
                  <TableHead className="font-mono text-xs text-zinc-500">Status</TableHead>
                  <TableHead className="font-mono text-xs text-zinc-500">Devices</TableHead>
                  <TableHead className="font-mono text-xs text-zinc-500">Jobs</TableHead>
                  <TableHead className="font-mono text-xs text-zinc-500">Success</TableHead>
                  <TableHead className="font-mono text-xs text-zinc-500">Resources</TableHead>
                  <TableHead className="font-mono text-xs text-zinc-500">Uptime</TableHead>
                  <TableHead className="font-mono text-xs text-zinc-500">Last Heartbeat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.workerId} className="border-zinc-800">
                    <TableCell className="font-mono text-xs text-white">
                      {worker.workerId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs border-zinc-700">
                        {worker.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={worker.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-white">{worker.deviceCount}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-yellow-400">{worker.activeJobs}</span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-zinc-400">{worker.maxConcurrentJobs}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-green-400">{worker.metrics.successfulJobs}</span>
                        <XCircle className="h-3.5 w-3.5 text-red-400 ml-2" />
                        <span className="text-red-400">{worker.metrics.failedJobs}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Cpu className="h-3 w-3 text-zinc-500" />
                          <span className="text-zinc-300">{Math.round(worker.metrics.cpuUsage)}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3 text-zinc-500" />
                          <span className="text-zinc-300">{Math.round(worker.metrics.memoryUsage)}%</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(worker.metrics.uptimeSeconds)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">
                      {formatTimestamp(worker.lastHeartbeat)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Worker Details */}
      {workers.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {workers.map((worker) => (
            <Card key={worker.workerId} className="bg-black border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-sm text-white flex items-center justify-between">
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
                  <h4 className="font-mono text-xs text-zinc-500 mb-2">연결된 디바이스 ({worker.devices.length})</h4>
                  <div className="space-y-1">
                    {worker.devices.length === 0 ? (
                      <p className="font-mono text-xs text-zinc-600">디바이스 없음</p>
                    ) : (
                      worker.devices.slice(0, 5).map((device) => (
                        <div
                          key={device.deviceId}
                          className="flex items-center justify-between px-2 py-1 rounded bg-zinc-900"
                        >
                          <span className="font-mono text-xs text-zinc-300">{device.adbId}</span>
                          <Badge
                            variant="outline"
                            className={`font-mono text-[10px] ${
                              device.state === 'IDLE'
                                ? 'border-green-500/30 text-green-400'
                                : device.state === 'RUNNING'
                                ? 'border-yellow-500/30 text-yellow-400'
                                : 'border-zinc-500/30 text-zinc-400'
                            }`}
                          >
                            {device.state}
                          </Badge>
                        </div>
                      ))
                    )}
                    {worker.devices.length > 5 && (
                      <p className="font-mono text-[10px] text-zinc-600 text-center mt-1">
                        +{worker.devices.length - 5} more devices
                      </p>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-zinc-900">
                    <div className="font-mono text-[10px] text-zinc-500">Total Jobs</div>
                    <div className="font-mono text-lg text-white">{worker.metrics.totalJobsExecuted}</div>
                  </div>
                  <div className="p-2 rounded bg-zinc-900">
                    <div className="font-mono text-[10px] text-zinc-500">Avg Duration</div>
                    <div className="font-mono text-lg text-white">
                      {Math.round(worker.metrics.averageJobDurationMs / 1000)}s
                    </div>
                  </div>
                  <div className="p-2 rounded bg-zinc-900">
                    <div className="font-mono text-[10px] text-zinc-500">Success Rate</div>
                    <div className="font-mono text-lg text-green-400">
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
