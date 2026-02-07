import { useQuery } from '@tanstack/react-query';
import { REFRESH_INTERVALS } from '@/lib/refresh-intervals';

export const videoKeys = {
  all: ['videos'] as const,
  list: (params: { page: number; statusFilter?: string; searchQuery?: string }) =>
    [...videoKeys.all, 'list', params] as const,
};

export interface Video {
  id: string;
  title: string;
  channel_id: string;
  channel_name: string;
  thumbnail_url: string;
  video_duration_sec: number;
  target_views: number;
  completed_views: number;
  failed_views: number;
  watch_duration_sec: number;
  watch_duration_min_pct: number;
  watch_duration_max_pct: number;
  prob_like: number;
  prob_comment: number;
  prob_subscribe: number;
  status: 'active' | 'paused' | 'completed' | 'archived';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  priority_enabled?: boolean;
  priority_updated_at?: string;
  registration_method?: string;
  search_keyword: string;
  tags: string[];
  created_at: string;
}

interface VideosResult {
  items: Video[];
  totalCount: number;
}

const PAGE_SIZE = 20;

export function useVideosQuery(opts: {
  page: number;
  pageSize?: number;
  statusFilter?: string;
  searchQuery?: string;
  refetchInterval?: number | false;
}) {
  const { page, pageSize = PAGE_SIZE, statusFilter = 'all', searchQuery = '' } = opts;

  return useQuery({
    queryKey: videoKeys.list({ page, statusFilter, searchQuery }),
    queryFn: async (): Promise<VideosResult> => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/videos?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch videos: ${response.status}`);
      }
      const result = await response.json();

      if (result.success && result.data) {
        return {
          items: (result.data.items || []) as Video[],
          totalCount: result.data.total || 0,
        };
      }

      return { items: [], totalCount: 0 };
    },
    refetchInterval: opts.refetchInterval ?? REFRESH_INTERVALS.CONTENT,
  });
}
