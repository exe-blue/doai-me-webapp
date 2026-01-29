'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Clock,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

type ViewMode = 'jobs' | 'devices';
type DateRange = '1' | '7' | '30';

export default function AnalyticsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('jobs');
  const [dateRange, setDateRange] = useState<DateRange>('7');
  const [isLoading, setIsLoading] = useState(true);
  const [jobs, setJobs] = useState<JobAnalyticsData[]>([]);
  const [devices, setDevices] = useState<DeviceAnalyticsData[]>([]);

  // Summary stats
  const [stats, setStats] = useState({
    totalJobs: 0,
    completedAssignments: 0,
    failedAssignments: 0,
    activeDevices: 0,
    avgCompletionRate: 0
  });

  // Load job analytics
  const loadJobAnalytics = useCallback(async () => {
    try {
      const response = await fetch(`/api/analytics/jobs?days=${dateRange}`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);

        // Calculate stats
        const totalCompleted = data.jobs.reduce((sum: number, j: JobAnalyticsData) => sum + j.completed_count, 0);
        const totalFailed = data.jobs.reduce((sum: number, j: JobAnalyticsData) => sum + j.failed_count, 0);
        const totalAssignments = data.jobs.reduce((sum: number, j: JobAnalyticsData) => sum + j.total_assignments, 0);

        setStats(prev => ({
          ...prev,
          totalJobs: data.jobs.length,
          completedAssignments: totalCompleted,
          failedAssignments: totalFailed,
          avgCompletionRate: totalAssignments > 0
            ? Math.round((totalCompleted / totalAssignments) * 100)
            : 0
        }));
      }
    } catch (error) {
      console.error('Failed to load job analytics:', error);
      toast.error('작업 통계 로드 실패');
    }
  }, [dateRange]);

  // Load device analytics
  const loadDeviceAnalytics = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics/devices');
      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);

        // Calculate active devices
        const active = data.devices.filter(
          (d: DeviceAnalyticsData) => d.status !== 'offline' && d.health_status !== 'offline'
        ).length;

        setStats(prev => ({
          ...prev,
          activeDevices: active
        }));
      }
    } catch (error) {
      console.error('Failed to load device analytics:', error);
      toast.error('기기 통계 로드 실패');
    }
  }, []);

  // Load data based on view mode
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadJobAnalytics(), loadDeviceAnalytics()]);
    } finally {
      setIsLoading(false);
    }
  }, [loadJobAnalytics, loadDeviceAnalytics]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when date range changes (for job view)
  useEffect(() => {
    if (viewMode === 'jobs') {
      loadJobAnalytics();
    }
  }, [dateRange, viewMode, loadJobAnalytics]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (viewMode === 'jobs') {
        loadJobAnalytics();
      } else {
        loadDeviceAnalytics();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [viewMode, loadJobAnalytics, loadDeviceAnalytics]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">진행 보기</h1>
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
            onClick={loadData}
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
