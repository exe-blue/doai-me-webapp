// Watch session status types
export type WatchStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed';

export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  queued: '대기열',
  running: '진행중',
  paused: '일시정지',
  completed: '완료',
  failed: '오류',
};

export const WATCH_STATUS_COLORS: Record<WatchStatus, string> = {
  queued: 'bg-gray-200 text-gray-800 border-gray-800',
  running: 'bg-green-400 text-green-900 border-green-900',
  paused: 'bg-amber-400 text-amber-900 border-amber-900',
  completed: 'bg-gray-400 text-gray-900 border-gray-900',
  failed: 'bg-red-400 text-red-900 border-red-900',
};

export const REGISTRATION_METHOD_LABELS: Record<string, string> = {
  manual: '직접 등록',
  MANUAL: '직접 등록',
  API: 'API 등록',
  api: 'API 등록',
};

export interface WatchSession {
  id: string;
  watch_id: string; // YYYYMMDD_handle_### format
  status: WatchStatus;
  priority_enabled: boolean;
  paused: boolean;

  // Video info
  video_id: string;
  video_title: string;
  video_url: string; // canonical URL
  channel_handle: string;
  channel_name?: string;
  thumbnail_url?: string;

  // Registration
  registration_method: 'manual' | 'API';

  // Counts (optional - fetched on demand via 시청 현황)
  viewing_device_count?: number;
  node_count?: number;

  // Timestamps
  created_at: string;
  started_at?: string;
  completed_at?: string;

  // Settings from job
  target_views?: number;
  completed_views?: number;
  watch_duration_min_pct?: number;
  watch_duration_max_pct?: number;
  prob_like?: number;
  prob_comment?: number;
  prob_subscribe?: number;
}

export interface WatchStatusResponse {
  node_count: number;
  viewing_device_count: number;
  devices?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export interface WatchListResponse {
  success: boolean;
  data?: {
    items: WatchSession[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  error?: { code: string; message: string };
}
