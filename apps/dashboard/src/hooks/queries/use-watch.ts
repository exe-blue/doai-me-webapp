import { useQuery } from '@tanstack/react-query';
import { fetchWatchSessions } from '@/lib/watch-api';
import type { WatchSession } from '@/lib/watch-types';
import { REFRESH_INTERVALS } from '@/lib/refresh-intervals';

export const watchKeys = {
  all: ['watch'] as const,
  list: (params: { page: number; pageSize: number; status?: string; search?: string }) =>
    [...watchKeys.all, 'list', params] as const,
};

interface WatchResult {
  items: WatchSession[];
  total: number;
  totalPages: number;
}

export function useWatchQuery(opts: {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
  refetchInterval?: number | false;
}) {
  const { page, pageSize, status, search } = opts;

  return useQuery({
    queryKey: watchKeys.list({ page, pageSize, status, search }),
    queryFn: async (): Promise<WatchResult> => {
      const result = await fetchWatchSessions({
        page,
        pageSize,
        status,
        search: search?.trim() || undefined,
      });
      return {
        items: result.items,
        total: result.total,
        totalPages: result.totalPages,
      };
    },
    refetchInterval: opts.refetchInterval ?? REFRESH_INTERVALS.CONTENT,
  });
}
