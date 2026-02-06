import type { WatchSession, WatchStatusResponse, WatchStatus } from './watch-types';

// Map existing job data to WatchSession format
function mapJobToWatchSession(job: any): WatchSession {
  // Extract video ID from target_url
  const videoIdMatch = job.target_url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  const videoId = videoIdMatch?.[1] || job.id || '';

  // Map job status to watch status
  const statusMap: Record<string, WatchStatus> = {
    active: 'running',
    paused: 'paused',
    completed: 'completed',
    cancelled: 'failed',
    pending: 'queued',
  };

  return {
    id: job.id,
    watch_id: job.watch_id || job.display_name || `${new Date(job.created_at).toISOString().slice(0,10).replace(/-/g,'')}___${String(1).padStart(3, '0')}`,
    status: statusMap[job.status] || 'queued',
    priority_enabled: job.priority || false,
    paused: job.status === 'paused',
    video_id: videoId,
    video_title: job.title || '',
    video_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : job.target_url || '',
    channel_handle: job.channel_handle || '',
    channel_name: job.channel_name,
    thumbnail_url: videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : undefined,
    registration_method: job.registration_method || 'manual',
    viewing_device_count: job.stats?.running,
    node_count: undefined,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.finished_at,
    target_views: job.total_assigned,
    completed_views: job.stats?.completed,
    watch_duration_min_pct: job.watch_duration_min_pct,
    watch_duration_max_pct: job.watch_duration_max_pct,
    prob_like: job.prob_like,
    prob_comment: job.prob_comment,
    prob_subscribe: job.prob_subscribe,
  };
}

// Fetch watch sessions list (maps from /api/jobs)
export async function fetchWatchSessions(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}): Promise<{ items: WatchSession[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params.status && params.status !== 'all') searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);

  const response = await fetch(`/api/jobs?${searchParams.toString()}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || '시청 목록을 불러오지 못했습니다.');
  }

  const jobs = data.jobs || data.data?.items || [];
  const total = data.total || data.data?.total || jobs.length;
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;

  return {
    items: jobs.map(mapJobToWatchSession),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Fetch watch session status (시청 현황)
export async function fetchWatchStatus(sessionId: string): Promise<WatchStatusResponse> {
  // Try dedicated endpoint first, fall back to computing from devices
  try {
    const response = await fetch(`/api/jobs/${sessionId}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error?.message || '시청 현황을 불러오지 못했습니다.');

    const job = data.job || data.data || data;
    return {
      node_count: job.node_count || 0,
      viewing_device_count: job.stats?.running || 0,
      devices: job.devices,
    };
  } catch {
    throw new Error('시청 현황을 불러오지 못했습니다.');
  }
}

// Toggle priority
export async function toggleWatchPriority(sessionId: string, enabled: boolean): Promise<void> {
  const response = await fetch(`/api/jobs/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority: enabled }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || '요청을 처리하지 못했습니다. 다시 시도해주세요.');
  }
}

// Pause/Resume
export async function toggleWatchPause(sessionId: string, paused: boolean): Promise<void> {
  const response = await fetch(`/api/jobs/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: paused ? 'paused' : 'active' }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || '요청을 처리하지 못했습니다. 다시 시도해주세요.');
  }
}

// Delete watch session
export async function deleteWatchSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/jobs/${sessionId}`, { method: 'DELETE' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || '요청을 처리하지 못했습니다. 다시 시도해주세요.');
  }
}

// Check if video is already registered (duplicate prevention)
export async function checkDuplicateVideo(videoId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/videos/${videoId}`);
    if (response.ok) return true; // video exists
    if (response.status === 404) return false;
    return false;
  } catch {
    return false;
  }
}
