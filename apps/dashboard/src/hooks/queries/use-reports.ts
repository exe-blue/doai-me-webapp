import { useQuery } from '@tanstack/react-query';
import { REFRESH_INTERVALS } from '@/lib/refresh-intervals';

export const reportKeys = {
  all: ['reports'] as const,
  daily: (date: string, compareMode: string) =>
    [...reportKeys.all, 'daily', date, compareMode] as const,
  history: (filters: Record<string, unknown>) =>
    [...reportKeys.all, 'history', filters] as const,
};

export interface DailyStats {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  cancelled_tasks: number;
  total_watch_time: number;
  avg_watch_time: number;
  unique_videos: number;
  unique_devices: number;
  active_devices: number;
  error_rate: number;
  avg_task_duration: number;
  peak_concurrent: number;
  tasks_per_hour: number[];
}

export interface VideoPerformance {
  video_id: string;
  title: string;
  channel: string;
  executions: number;
  completed: number;
  failed: number;
  total_watch_time: number;
  avg_watch_time: number;
  success_rate: number;
}

export interface NodePerformance {
  node_id: string;
  name: string;
  total_tasks: number;
  completed: number;
  failed: number;
  avg_duration: number;
  devices_used: number;
  error_rate: number;
}

interface DailyReportResult {
  stats: DailyStats;
  prevStats: DailyStats;
  videoPerformance: VideoPerformance[];
  nodePerformance: NodePerformance[];
}

function formatDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function parseDailyStats(data: Record<string, unknown> | null, dateStr: string): DailyStats {
  return {
    date: dateStr,
    total_tasks: (data?.total_tasks as number) ?? 0,
    completed_tasks: (data?.completed_tasks as number) ?? 0,
    failed_tasks: (data?.failed_tasks as number) ?? 0,
    cancelled_tasks: (data?.cancelled_tasks as number) ?? 0,
    total_watch_time: (data?.total_watch_time as number) ?? 0,
    avg_watch_time: (data?.avg_watch_time as number) ?? 0,
    unique_videos: (data?.unique_videos as number) ?? 0,
    unique_devices: (data?.unique_devices as number) ?? 0,
    active_devices: (data?.active_devices as number) ?? 0,
    error_rate: (data?.error_rate as number) ?? 0,
    avg_task_duration: (data?.avg_task_duration as number) ?? 0,
    peak_concurrent: (data?.peak_concurrent as number) ?? 0,
    tasks_per_hour: (data?.tasks_per_hour as number[]) ?? Array(24).fill(0),
  };
}

export function useDailyReportQuery(
  selectedDate: Date,
  compareMode: 'prev_day' | 'prev_week' = 'prev_day',
  refetchInterval?: number | false,
) {
  const dateStr = formatDateStr(selectedDate);
  const prevDate = compareMode === 'prev_day'
    ? subDays(selectedDate, 1)
    : subDays(selectedDate, 7);
  const prevDateStr = formatDateStr(prevDate);

  return useQuery({
    queryKey: reportKeys.daily(dateStr, compareMode),
    queryFn: async (): Promise<DailyReportResult> => {
      const [currentRes, prevRes] = await Promise.all([
        fetch(`/api/reports/daily?date=${dateStr}`),
        fetch(`/api/reports/daily?date=${prevDateStr}`),
      ]);

      if (!currentRes.ok || !prevRes.ok) {
        throw new Error(`Failed to fetch reports: ${!currentRes.ok ? currentRes.statusText : prevRes.statusText}`);
      }

      const currentResult = await currentRes.json();
      const prevResult = await prevRes.json();

      const currentData = currentResult.success && currentResult.data ? currentResult.data : null;
      const prevData = prevResult.success && prevResult.data ? prevResult.data : null;

      return {
        stats: parseDailyStats(currentData, dateStr),
        prevStats: parseDailyStats(prevData, prevDateStr),
        videoPerformance: (currentData?.video_performance ?? []) as VideoPerformance[],
        nodePerformance: (currentData?.node_performance ?? []) as NodePerformance[],
      };
    },
    refetchInterval: refetchInterval ?? REFRESH_INTERVALS.ANALYTICS,
  });
}

export interface ExecutionHistory {
  id: string;
  video_id: string;
  video_title: string;
  video_thumbnail: string;
  channel_name: string;
  device_id: string;
  device_name: string;
  node_id: string;
  status: 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  watch_duration_seconds: number | null;
  target_watch_seconds: number;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  metadata: {
    ip_address?: string;
    resolution?: string;
    playback_quality?: string;
    buffering_count?: number;
    ads_skipped?: number;
  };
}

interface ExecutionHistoryResult {
  items: ExecutionHistory[];
  totalCount: number;
  totalPages: number;
}

export function useExecutionHistoryQuery(
  opts: {
    filters: {
      status: string;
      node: string;
      dateRange?: { from?: Date; to?: Date };
    };
    search: string;
    sortField: 'started_at' | 'duration';
    sortOrder: 'asc' | 'desc';
    page: number;
    pageSize: number;
    refetchInterval?: number | false;
  },
) {
  const { filters, search, sortField, sortOrder, page, pageSize } = opts;

  return useQuery({
    queryKey: reportKeys.history({
      ...filters,
      dateFrom: filters.dateRange?.from?.toISOString(),
      dateTo: filters.dateRange?.to?.toISOString(),
      search,
      sortField,
      sortOrder,
      page,
    }),
    queryFn: async (): Promise<ExecutionHistoryResult> => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        sortBy: sortField,
        sortOrder,
      });

      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.node !== 'all') params.append('nodeId', filters.node);
      if (filters.dateRange?.from) params.append('dateFrom', filters.dateRange.from.toISOString());
      if (filters.dateRange?.to) params.append('dateTo', filters.dateRange.to.toISOString());
      if (search.trim()) params.append('search', search.trim());

      const response = await fetch(`/api/executions?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch executions: ${response.statusText}`);
      }
      const result = await response.json();

      if (!result.success || !result.data) {
        return { items: [], totalCount: 0, totalPages: 0 };
      }

      const { items, total, totalPages: tp } = result.data;

      const mapped: ExecutionHistory[] = items.map((d: Record<string, unknown>) => {
        const startedAt = (d.started_at as string) || (d.created_at as string);
        const completedAt = d.completed_at as string | null;
        let duration: number | null = null;
        if (startedAt && completedAt) {
          const startTime = new Date(startedAt).getTime();
          const endTime = new Date(completedAt).getTime();
          if (!isNaN(startTime) && !isNaN(endTime)) {
            duration = Math.floor((endTime - startTime) / 1000);
          }
        }

        return {
          id: d.id as string,
          video_id: d.video_id as string,
          video_title: ((d.videos as Record<string, unknown>)?.title as string) || `Video ${d.video_id}`,
          video_thumbnail: `https://img.youtube.com/vi/${d.video_id}/default.jpg`,
          channel_name: ((d.videos as Record<string, unknown>)?.channel_name as string) || 'Unknown',
          device_id: d.device_id as string,
          device_name: ((d.devices as Record<string, unknown>)?.name as string) || `Device ${d.device_id}`,
          node_id: (d.node_id as string) || 'unknown',
          status: (d.status as ExecutionHistory['status']) || 'completed',
          started_at: startedAt || null,
          completed_at: completedAt,
          duration_seconds: duration,
          watch_duration_seconds: (d.actual_watch_duration_sec as number) || null,
          target_watch_seconds: (d.target_watch_seconds as number) || 60,
          error_message: (d.error_message as string) || null,
          error_code: (d.error_code as string) || null,
          retry_count: (d.retry_count as number) || 0,
          metadata: {
            ip_address: ((d.metadata as Record<string, unknown>)?.ip_address as string) || undefined,
            resolution: ((d.metadata as Record<string, unknown>)?.resolution as string) || undefined,
            playback_quality: ((d.metadata as Record<string, unknown>)?.playback_quality as string) || undefined,
            buffering_count: ((d.metadata as Record<string, unknown>)?.buffering_count as number) || undefined,
            ads_skipped: ((d.metadata as Record<string, unknown>)?.ads_skipped as number) || undefined,
          },
        };
      });

      return { items: mapped, totalCount: total, totalPages: tp };
    },
    refetchInterval: opts.refetchInterval ?? false,
  });
}
