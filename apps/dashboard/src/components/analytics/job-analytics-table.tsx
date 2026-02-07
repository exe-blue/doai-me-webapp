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
  Progress,
} from '@packages/ui';
import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';

export interface JobAnalyticsData {
  id: string;
  title: string;
  target_url: string;
  created_at: string;
  is_active: boolean;
  total_assignments: number;
  completed_count: number;
  running_count: number;
  pending_count: number;
  failed_count: number;
  avg_duration_sec: number;
  running_devices: Array<{
    device_id: string;
    serial_number: string;
    progress_pct: number;
  }>;
}

interface JobAnalyticsTableProps {
  jobs: JobAnalyticsData[];
  isLoading?: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}분 ${secs}초`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function JobAnalyticsTable({ jobs, isLoading }: JobAnalyticsTableProps) {
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

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">작업 데이터가 없습니다</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">영상별 진행 현황</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">영상 제목</TableHead>
              <TableHead className="text-center">상태</TableHead>
              <TableHead className="text-center">할당</TableHead>
              <TableHead className="text-center">완료</TableHead>
              <TableHead className="text-center">진행중</TableHead>
              <TableHead className="text-center">실패</TableHead>
              <TableHead className="text-center">평균 시청</TableHead>
              <TableHead>진행중 기기</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const completionRate = job.total_assignments > 0
                ? Math.round((job.completed_count / job.total_assignments) * 100)
                : 0;

              return (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium line-clamp-1" title={job.title}>
                        {job.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(job.created_at)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={job.is_active ? 'default' : 'secondary'}>
                      {job.is_active ? '활성' : '비활성'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {job.total_assignments}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>{job.completed_count}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-yellow-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{job.running_count}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {job.failed_count > 0 ? (
                      <div className="flex items-center justify-center gap-1 text-red-600">
                        <AlertCircle className="h-4 w-4" />
                        <span>{job.failed_count}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{formatDuration(job.avg_duration_sec)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {job.running_devices.length > 0 ? (
                      <div className="flex flex-col gap-1 max-w-[200px]">
                        {job.running_devices.slice(0, 3).map((device) => (
                          <div key={device.device_id} className="flex items-center gap-2">
                            <span className="text-xs font-mono truncate">
                              {device.serial_number.slice(-6)}
                            </span>
                            <Progress value={device.progress_pct} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground w-8">
                              {device.progress_pct}%
                            </span>
                          </div>
                        ))}
                        {job.running_devices.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{job.running_devices.length - 3}개 더
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
