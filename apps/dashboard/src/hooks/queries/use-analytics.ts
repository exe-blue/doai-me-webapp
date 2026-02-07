import { useQuery } from '@tanstack/react-query';
import { REFRESH_INTERVALS } from '@/lib/refresh-intervals';
import type { JobAnalyticsData, DeviceAnalyticsData } from '@/components/analytics';

export const analyticsKeys = {
  all: ['analytics'] as const,
  jobs: (days: string) => [...analyticsKeys.all, 'jobs', days] as const,
  devices: () => [...analyticsKeys.all, 'devices'] as const,
};

export function useJobAnalyticsQuery(days: string, refetchInterval?: number | false) {
  return useQuery({
    queryKey: analyticsKeys.jobs(days),
    queryFn: async () => {
      const response = await fetch(`/api/analytics/jobs?days=${days}`);
      if (!response.ok) {
        throw new Error('작업 통계 로드 실패');
      }
      const data = await response.json();
      return (data.jobs || []) as JobAnalyticsData[];
    },
    refetchInterval: refetchInterval ?? REFRESH_INTERVALS.ANALYTICS,
  });
}

export function useDeviceAnalyticsQuery(refetchInterval?: number | false) {
  return useQuery({
    queryKey: analyticsKeys.devices(),
    queryFn: async () => {
      const response = await fetch('/api/analytics/devices');
      if (!response.ok) {
        throw new Error('기기 통계 로드 실패');
      }
      const data = await response.json();
      return (data.devices || []) as DeviceAnalyticsData[];
    },
    refetchInterval: refetchInterval ?? REFRESH_INTERVALS.ANALYTICS,
  });
}
