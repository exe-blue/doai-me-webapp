import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { REFRESH_INTERVALS } from '@/lib/refresh-intervals';

export const keywordKeys = {
  all: ['keywords'] as const,
  list: (categoryFilter?: string) =>
    [...keywordKeys.all, 'list', categoryFilter] as const,
};

export interface Keyword {
  id: number;
  keyword: string;
  category: string | null;
  is_active: boolean;
  collect_interval_hours: number;
  max_results: number;
  discovered_count: number;
  used_count: number;
  last_collected_at: string | null;
  min_views: number;
  min_duration_sec: number;
  max_duration_sec: number;
  exclude_keywords: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useKeywordsQuery(opts?: {
  categoryFilter?: string;
  refetchInterval?: number | false;
}) {
  const categoryFilter = opts?.categoryFilter ?? 'all';

  return useQuery({
    queryKey: keywordKeys.list(categoryFilter),
    queryFn: async () => {
      let query = supabase
        .from('keywords')
        .select('*')
        .order('created_at', { ascending: false });

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`키워드 목록 로드 실패: ${error.message}`);
      }

      return (data || []) as Keyword[];
    },
    refetchInterval: opts?.refetchInterval ?? REFRESH_INTERVALS.CONTENT,
  });
}
