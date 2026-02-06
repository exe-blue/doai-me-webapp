import { useQuery } from '@tanstack/react-query';
import { fetchJobs } from '@/lib/api';

export const jobKeys = {
  all: ['jobs'] as const,
  active: () => [...jobKeys.all, 'active'] as const,
  completed: () => [...jobKeys.all, 'completed'] as const,
};

export function useActiveJobsQuery(refetchInterval?: number | false) {
  return useQuery({
    queryKey: jobKeys.active(),
    queryFn: async () => {
      const data = await fetchJobs();
      return (data.jobs || []) as Array<Record<string, unknown>>;
    },
    refetchInterval: refetchInterval ?? 5000,
  });
}

export function useCompletedJobsQuery() {
  return useQuery({
    queryKey: jobKeys.completed(),
    queryFn: async () => {
      const data = await fetchJobs({ status: 'completed', limit: 100 });
      return (data.jobs || []) as Array<Record<string, unknown>>;
    },
    refetchInterval: 5000,
  });
}
