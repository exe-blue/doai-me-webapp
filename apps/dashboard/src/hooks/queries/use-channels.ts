import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { REFRESH_INTERVALS } from '@/lib/refresh-intervals';

export const channelKeys = {
  all: ['channels'] as const,
  list: (statusFilter?: string) =>
    [...channelKeys.all, 'list', statusFilter] as const,
};

export interface Channel {
  id: string;
  name: string;
  handle: string;
  profile_url: string;
  banner_url: string;
  subscriber_count: string;
  video_count: number;
  auto_collect: boolean;
  push_status: 'active' | 'pending' | 'expired' | 'none';
  push_expires_at: string | null;
  last_collected_at: string | null;
  default_watch_duration_sec: number;
  default_prob_like: number;
  default_prob_comment: number;
  default_prob_subscribe: number;
  status: 'active' | 'paused' | 'archived';
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useChannelsQuery(opts?: {
  statusFilter?: string;
  refetchInterval?: number | false;
}) {
  const statusFilter = opts?.statusFilter ?? 'all';

  return useQuery({
    queryKey: channelKeys.list(statusFilter),
    queryFn: async () => {
      let query = supabase
        .from('channels')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`채널 목록 로드 실패: ${error.message}`);
      }

      return (data || []) as Channel[];
    },
    refetchInterval: opts?.refetchInterval ?? REFRESH_INTERVALS.CONTENT,
  });
}
