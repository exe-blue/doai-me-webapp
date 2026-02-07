'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  JobAnalyticsTable,
  DeviceAnalyticsTable,
  type JobAnalyticsData,
  type DeviceAnalyticsData
} from '@/components/analytics';
import {
  RefreshCw,
  BarChart3,
  Monitor,
  Calendar,
  CheckCircle,
  XCircle,
  Activity
} from 'lucide-react';
import { useJobAnalyticsQuery, useDeviceAnalyticsQuery } from '@/hooks/queries';

type ViewMode = 'jobs' | 'devices';
type DateRange = '1' | '7' | '30';

export default function AnalyticsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('jobs');
  const [dateRange, setDateRange] = useState<DateRange>('7');

  // React Query hooks
  const { data: jobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useJobAnalyticsQuery(dateRange);
  const { data: devices = [], isLoading: devicesLoading, refetch: refetchDevices } = useDeviceAnalyticsQuery();
  const isLoading = jobsLoading || devicesLoading;

  // Calculate stats from query data
  const stats = useMemo(() => {
    const totalCompleted = jobs.reduce((sum, j) => sum + j.completed_count, 0);
    const totalFailed = jobs.reduce((sum, j) => sum + j.failed_count, 0);
    const totalAssignments = jobs.reduce((sum, j) => sum + j.total_assignments, 0);
    const activeDevices = devices.filter(
      (d) => d.status !== 'offline' && d.status !== 'error'
    ).length;

    return {
      totalJobs: jobs.length,
      completedAssignments: totalCompleted,
      failedAssignments: totalFailed,
      activeDevices,
      avgCompletionRate: totalAssignments > 0
        ? Math.round((totalCompleted / totalAssignments) * 100)
        : 0,
    };
  }, [jobs, devices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-head">진행 보기</h1>
          <p className="text-muted-foreground">작업 및 기기 통계 모니터링</p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'jobs' && (
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">오늘</SelectItem>
                <SelectItem value="7">최근 7일</SelectItem>
                <SelectItem value="30">최근 30일</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            onClick={() => { refetchJobs(); refetchDevices(); }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 작업
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{stats.totalJobs}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              완료된 할당
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold text-green-600">{stats.completedAssignments}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              실패한 할당
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold text-red-600">{stats.failedAssignments}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              활성 기기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-purple-500" />
              <span className="text-2xl font-bold text-purple-600">{stats.activeDevices}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              완료율
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-500" />
              <span className="text-2xl font-bold text-cyan-600">{stats.avgCompletionRate}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="jobs" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            영상별 (By Job)
          </TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            기기별 (By Device)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-4">
          <JobAnalyticsTable jobs={jobs} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="devices" className="mt-4">
          <DeviceAnalyticsTable devices={devices} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
