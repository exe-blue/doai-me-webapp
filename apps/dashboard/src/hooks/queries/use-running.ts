import { useQuery } from '@tanstack/react-query';
import { fetchRunningTasks, fetchNodes, fetchTodayStats, type NodeRow } from '@/lib/api';
import type { JobProgressMap } from '@/hooks/use-socket';
import { REFRESH_INTERVALS } from '@/lib/refresh-intervals';

export const runningKeys = {
  all: ['running'] as const,
  tasks: (nodeFilter?: string) =>
    [...runningKeys.all, 'tasks', nodeFilter] as const,
  nodes: () => [...runningKeys.all, 'nodes'] as const,
  todayStats: () => [...runningKeys.all, 'todayStats'] as const,
};

// =============================================
// Types
// =============================================

export interface RunningTask {
  id: string;
  video_id: string;
  device_id: string;
  node_id: string;
  status: 'running' | 'completing';
  progress: number;
  current_step: string;
  watch_duration_sec: number;
  elapsed_sec: number;
  will_like: boolean;
  will_comment: boolean;
  will_subscribe: boolean;
  started_at: string;
  video?: {
    title: string;
    thumbnail_url: string;
    channel_name: string;
  };
}

export interface NodeStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  connected_at: string | null;
  total_devices: number;
  active_devices: number;
  idle_devices: number;
  error_devices: number;
  tasks_per_minute: number;
  cpu_usage: number;
  memory_usage: number;
}

export interface RealtimeStats {
  total_running: number;
  completed_today: number;
  failed_today: number;
  avg_duration: number;
  tasks_per_minute: number;
  likes_today: number;
  comments_today: number;
  subscribes_today: number;
}

// =============================================
// Helpers
// =============================================

function estimateStep(task: {
  started_at?: string;
  watch_duration_sec?: number;
}): string {
  const elapsed =
    (Date.now() - new Date(task.started_at || Date.now()).getTime()) / 1000;
  const duration = task.watch_duration_sec || 60;
  const progress = elapsed / duration;

  if (progress < 0.05) return 'initializing';
  if (progress < 0.1) return 'opening_youtube';
  if (progress < 0.15) return 'searching';
  if (progress < 0.2) return 'selecting_video';
  if (progress < 0.9) return 'watching';
  if (progress < 0.93) return 'liking';
  if (progress < 0.96) return 'commenting';
  if (progress < 0.98) return 'subscribing';
  return 'completing';
}

function mapNode(n: NodeRow): NodeStatus {
  return {
    id: n.id,
    name: n.name || n.id,
    status: (n.status === 'online'
      ? 'online'
      : n.status === 'busy'
        ? 'busy'
        : 'offline') as NodeStatus['status'],
    connected_at: n.connected_at,
    total_devices: n.total_devices || 100,
    active_devices: n.active_devices || 0,
    idle_devices: n.idle_devices || 0,
    error_devices: n.error_devices || 0,
    tasks_per_minute: n.tasks_per_minute || 0,
    cpu_usage: n.cpu_usage || 0,
    memory_usage: n.memory_usage || 0,
  };
}

// =============================================
// Hooks
// =============================================

export function useRunningTasksQuery(
  nodeFilter?: string,
  refetchInterval?: number | false,
  jobProgressMap?: JobProgressMap,
) {
  return useQuery({
    queryKey: runningKeys.tasks(nodeFilter),
    queryFn: async () => {
      const data = await fetchRunningTasks(nodeFilter);
      const tasks: RunningTask[] = data.map(
        (task: Record<string, unknown>) => {
          const video = Array.isArray(task.video)
            ? task.video[0]
            : task.video;
          const deviceId = task.device_id as string;

          // Use real-time Socket.IO data if available
          const socketData = jobProgressMap?.get(deviceId);

          const elapsedSec = Math.floor(
            (Date.now() -
              new Date(
                (task.started_at as string) || Date.now(),
              ).getTime()) /
              1000,
          );

          const estimatedProgress = Math.min(
            100,
            Math.floor(
              (elapsedSec / ((task.watch_duration_sec as number) || 60)) * 100,
            ),
          );

          return {
            ...task,
            video,
            progress: socketData?.progress ?? estimatedProgress,
            current_step: socketData?.currentStep ??
              estimateStep(
                task as { started_at?: string; watch_duration_sec?: number },
              ),
            elapsed_sec: elapsedSec,
            // DB uses did_* (result) — map to will_* (intent) for running tasks
            will_like: (task.did_like as boolean) || (task.will_like as boolean) || false,
            will_comment: (task.did_comment as boolean) || (task.will_comment as boolean) || false,
            will_subscribe: (task.did_subscribe as boolean) || (task.will_subscribe as boolean) || false,
          } as RunningTask;
        },
      );
      return tasks;
    },
    refetchInterval: refetchInterval ?? 3000,
  });
}

export function useNodesQuery(refetchInterval?: number | false) {
  return useQuery({
    queryKey: runningKeys.nodes(),
    queryFn: async () => {
      const data = await fetchNodes();
      return data.map(mapNode);
    },
    staleTime: 10_000,
    refetchInterval: refetchInterval ?? REFRESH_INTERVALS.OPERATIONAL,
  });
}

export function useTodayStatsQuery(opts?: {
  runningCount?: number;
  nodesData?: NodeStatus[];
}) {
  return useQuery({
    queryKey: runningKeys.todayStats(),
    queryFn: async () => {
      const { completed, failed } = await fetchTodayStats();
      return { completed, failed };
    },
    select: (data) => {
      const { completed, failed } = data;
      return {
        total_running: opts?.runningCount ?? 0,
        completed_today: completed.length,
        failed_today: failed.length,
        avg_duration:
          completed.length > 0
            ? Math.round(
                completed.reduce(
                  (sum, c) => sum + (c.actual_watch_duration_sec || 0),
                  0,
                ) / completed.length,
              )
            : 0,
        tasks_per_minute: (opts?.nodesData ?? []).reduce(
          (sum, n) => sum + n.tasks_per_minute,
          0,
        ),
        likes_today: completed.filter((c) => c.did_like).length,
        comments_today: completed.filter((c) => c.did_comment).length,
        subscribes_today: completed.filter((c) => c.did_subscribe).length,
      } satisfies RealtimeStats;
    },
    refetchInterval: 5000,
  });
}
