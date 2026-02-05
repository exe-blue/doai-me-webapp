'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Wifi,
  WifiOff,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DeviceAnalyticsData {
  id: string;
  serial_number: string;
  pc_id: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  last_heartbeat: string | null;
  today_completed_count: number;
  today_failed_count: number;
  recent_error_log: string | null;
  current_job?: {
    job_id: string;
    title: string;
    progress_pct: number;
    started_at: string;
  } | null;
  next_pending_job?: {
    job_id: string;
    title: string;
    assigned_at: string;
  } | null;
}

interface DeviceAnalyticsTableProps {
  devices: DeviceAnalyticsData[];
  isLoading?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}초 전`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return `${Math.floor(diffSec / 86400)}일 전`;
}

function getStatusBadge(status: string) {
  if (status === 'offline') {
    return (
      <Badge variant="outline" className="border-gray-400 text-gray-500">
        <WifiOff className="h-3 w-3 mr-1" />
        오프라인
      </Badge>
    );
  }

  if (status === 'error') {
    return (
      <Badge variant="destructive" className="bg-orange-500">
        <AlertTriangle className="h-3 w-3 mr-1" />
        오류
      </Badge>
    );
  }

  if (status === 'busy') {
    return (
      <Badge variant="default" className="bg-yellow-500">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        작업중
      </Badge>
    );
  }

  return (
    <Badge variant="default" className="bg-green-500">
      <Wifi className="h-3 w-3 mr-1" />
      대기중
    </Badge>
  );
}

export function DeviceAnalyticsTable({ devices, isLoading }: DeviceAnalyticsTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (devices.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">기기 데이터가 없습니다</p>
        </CardContent>
      </Card>
    );
  }

  // Group by PC ID
  const groupedDevices = devices.reduce((acc, device) => {
    if (!acc[device.pc_id]) {
      acc[device.pc_id] = [];
    }
    acc[device.pc_id].push(device);
    return acc;
  }, {} as Record<string, DeviceAnalyticsData[]>);

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">기기별 진행 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PC / 기기</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead className="text-center">금일 완료</TableHead>
                <TableHead className="text-center">금일 실패</TableHead>
                <TableHead>현재 작업</TableHead>
                <TableHead>최근 에러</TableHead>
                <TableHead className="text-center">마지막 응답</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(groupedDevices).map(([pcId, pcDevices]) => (
                <>
                  {/* PC Header Row */}
                  <TableRow key={`pc-${pcId}`} className="bg-muted/50">
                    <TableCell colSpan={7} className="font-medium">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        {pcId}
                        <Badge variant="outline" className="ml-2">
                          {pcDevices.length}대
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Device Rows */}
                  {pcDevices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {device.serial_number}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(device.status)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span className="font-medium">{device.today_completed_count}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {device.today_failed_count > 0 ? (
                          <div className="flex items-center justify-center gap-1 text-red-600">
                            <XCircle className="h-4 w-4" />
                            <span className="font-medium">{device.today_failed_count}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {device.current_job ? (
                          <div className="flex flex-col gap-1 max-w-[200px]">
                            <span className="text-sm font-medium truncate" title={device.current_job.title}>
                              {device.current_job.title}
                            </span>
                            <div className="flex items-center gap-2">
                              <Progress value={device.current_job.progress_pct} className="h-1.5 flex-1" />
                              <span className="text-xs text-muted-foreground">
                                {device.current_job.progress_pct}%
                              </span>
                            </div>
                          </div>
                        ) : device.next_pending_job ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span className="text-xs truncate" title={device.next_pending_job.title}>
                              대기: {device.next_pending_job.title}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {device.recent_error_log ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="flex items-center gap-1 text-red-500 max-w-[150px]">
                                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                <span className="text-xs truncate">
                                  {device.recent_error_log.slice(0, 30)}...
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[300px]">
                              <p className="text-xs">{device.recent_error_log}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "text-xs",
                          device.status === 'online' || device.status === 'busy' ? 'text-green-600' :
                          device.status === 'error' ? 'text-orange-600' :
                          'text-gray-500'
                        )}>
                          {device.last_heartbeat ? formatRelativeTime(device.last_heartbeat) : '-'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
