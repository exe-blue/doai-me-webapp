import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { REFRESH_INTERVALS } from '@/lib/refresh-intervals';

export const scheduleKeys = {
  all: ['schedules'] as const,
  list: () => [...scheduleKeys.all, 'list'] as const,
};

export interface Schedule {
  id: string;
  name: string;
  description: string | null;
  schedule_type: 'interval' | 'cron' | 'once';
  cron_expression: string | null;
  interval_minutes: number | null;
  target_type: 'all_videos' | 'by_channel' | 'by_keyword' | 'specific_videos';
  target_ids: string[] | null;
  task_config: {
    priority: 'high' | 'normal' | 'low';
    batch_size: number;
    max_concurrent: number;
    distribute_evenly: boolean;
  } | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
}

export function useSchedulesQuery(opts?: {
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: scheduleKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`스케줄 로드 실패: ${error.message}`);
      }

      return (data || []) as Schedule[];
    },
    refetchInterval: opts?.refetchInterval ?? REFRESH_INTERVALS.CONTENT,
  });
}
