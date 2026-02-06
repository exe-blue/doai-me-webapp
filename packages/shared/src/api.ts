// ============================================
// REST API 스펙 정의
// ============================================

import type {
  Video,
  Channel,
  Keyword,
  Device,
  DeviceIssue,
  VideoExecution,
  Schedule,
  Node,
  DailyReport,
  SystemLog,
  UUID,
  ApiResponse,
  PaginatedResponse,
  ScheduleConfig,
} from "./types";

// Re-export common types
export type { ApiResponse, PaginatedResponse };

// ============================================
// Videos API
// ============================================

// GET /api/videos
export interface GetVideosParams {
  page?: number;
  pageSize?: number;
  status?: string;
  category?: string;
  channelId?: string;
  search?: string;
  sortBy?: "created_at" | "priority" | "total_executions";
  sortOrder?: "asc" | "desc";
}
export type GetVideosResponse = ApiResponse<PaginatedResponse<Video>>;

// GET /api/videos/:id
export type GetVideoResponse = ApiResponse<Video>;

// POST /api/videos
export interface CreateVideoBody {
  youtube_url: string;
  priority?: number;
  target_watch_seconds?: number;
  category?: string;
}
export type CreateVideoResponse = ApiResponse<Video>;

// POST /api/videos/bulk
export interface BulkCreateVideosBody {
  youtube_urls: string[];
  priority?: number;
  target_watch_seconds?: number;
  category?: string;
}
export type BulkCreateVideosResponse = ApiResponse<{ created: number; failed: string[] }>;

// PATCH /api/videos/:id
export interface UpdateVideoBody {
  status?: "active" | "paused" | "archived";
  priority?: number;
  target_watch_seconds?: number;
  category?: string;
}
export type UpdateVideoResponse = ApiResponse<Video>;

// DELETE /api/videos/:id
export type DeleteVideoResponse = ApiResponse<{ deleted: boolean }>;

// POST /api/videos/:id/refresh-metadata
export type RefreshVideoMetadataResponse = ApiResponse<Video>;

// ============================================
// Channels API
// ============================================

// GET /api/channels
export interface GetChannelsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  autoCollect?: boolean;
  search?: string;
}
export type GetChannelsResponse = ApiResponse<PaginatedResponse<Channel>>;

// POST /api/channels
export interface CreateChannelBody {
  youtube_url: string;
  auto_collect?: boolean;
}
export type CreateChannelResponse = ApiResponse<Channel>;

// PATCH /api/channels/:id
export interface UpdateChannelBody {
  auto_collect?: boolean;
  status?: "active" | "paused";
}
export type UpdateChannelResponse = ApiResponse<Channel>;

// POST /api/channels/:id/collect
export type CollectChannelVideosResponse = ApiResponse<{ collected: number }>;

// DELETE /api/channels/:id
export type DeleteChannelResponse = ApiResponse<{ deleted: boolean }>;

// ============================================
// Keywords API
// ============================================

// GET /api/keywords
export interface GetKeywordsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  category?: string;
}
export type GetKeywordsResponse = ApiResponse<PaginatedResponse<Keyword>>;

// POST /api/keywords
export interface CreateKeywordBody {
  keyword: string;
  category?: string;
  auto_collect?: boolean;
  max_results?: number;
}
export type CreateKeywordResponse = ApiResponse<Keyword>;

// POST /api/keywords/:id/collect
export type CollectKeywordVideosResponse = ApiResponse<{ collected: number }>;

// DELETE /api/keywords/:id
export type DeleteKeywordResponse = ApiResponse<{ deleted: boolean }>;

// ============================================
// Queue API (작업 대기열)
// ============================================

// GET /api/queue
export interface GetQueueParams {
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: number;
  videoId?: string;
}
export type GetQueueResponse = ApiResponse<PaginatedResponse<VideoExecution>>;

// POST /api/queue
export interface AddToQueueBody {
  video_ids: UUID[];
  priority?: number;
  target_watch_seconds?: number;
  device_count?: number;
}
export type AddToQueueResponse = ApiResponse<{ queued: number }>;

// POST /api/queue/batch
export interface BatchQueueActionBody {
  execution_ids: UUID[];
  action: "cancel" | "retry" | "prioritize";
  priority?: number;
}
export type BatchQueueActionResponse = ApiResponse<{ affected: number }>;

// DELETE /api/queue/:id
export type CancelExecutionResponse = ApiResponse<{ cancelled: boolean }>;

// ============================================
// Executions API (실행 이력)
// ============================================

// GET /api/executions
export interface GetExecutionsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  nodeId?: string;
  deviceId?: string;
  videoId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "started_at" | "duration";
  sortOrder?: "asc" | "desc";
}
export type GetExecutionsResponse = ApiResponse<PaginatedResponse<VideoExecution>>;

// GET /api/executions/:id
export type GetExecutionResponse = ApiResponse<VideoExecution>;

// POST /api/executions/:id/retry
export type RetryExecutionResponse = ApiResponse<VideoExecution>;

// ============================================
// Schedules API
// ============================================

// GET /api/schedules
export interface GetSchedulesParams {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
}
export type GetSchedulesResponse = ApiResponse<PaginatedResponse<Schedule>>;

// GET /api/schedules/:id
export type GetScheduleResponse = ApiResponse<Schedule>;

// POST /api/schedules
export interface CreateScheduleBody {
  name: string;
  type: "once" | "interval" | "cron";
  config: ScheduleConfig;
  video_ids: UUID[];
}
export type CreateScheduleResponse = ApiResponse<Schedule>;

// PATCH /api/schedules/:id
export interface UpdateScheduleBody {
  name?: string;
  config?: Partial<ScheduleConfig>;
  video_ids?: UUID[];
  status?: "active" | "paused";
}
export type UpdateScheduleResponse = ApiResponse<Schedule>;

// POST /api/schedules/:id/run
export type RunScheduleNowResponse = ApiResponse<{ queued: number }>;

// POST /api/schedules/:id/duplicate
export type DuplicateScheduleResponse = ApiResponse<Schedule>;

// DELETE /api/schedules/:id
export type DeleteScheduleResponse = ApiResponse<{ deleted: boolean }>;

// ============================================
// Devices API
// ============================================

// GET /api/devices
export interface GetDevicesParams {
  page?: number;
  pageSize?: number;
  status?: string;
  nodeId?: string;
  search?: string;
}
export type GetDevicesResponse = ApiResponse<PaginatedResponse<Device>>;

// GET /api/devices/:id
export type GetDeviceResponse = ApiResponse<Device>;

// POST /api/devices/command
export interface DeviceCommandBody {
  device_ids: UUID[];
  command: "reboot" | "clear_cache" | "kill_app" | "screenshot" | "enable" | "disable";
  params?: Record<string, unknown>;
}
export type DeviceCommandResponse = ApiResponse<{ sent: number; failed: string[] }>;

// PATCH /api/devices/:id
export interface UpdateDeviceBody {
  name?: string;
  status?: "maintenance";
}
export type UpdateDeviceResponse = ApiResponse<Device>;

// ============================================
// Device Issues API
// ============================================

// GET /api/issues
export interface GetIssuesParams {
  page?: number;
  pageSize?: number;
  status?: string;
  severity?: string;
  type?: string;
  nodeId?: string;
  deviceId?: string;
}
export type GetIssuesResponse = ApiResponse<PaginatedResponse<DeviceIssue>>;

// POST /api/issues/:id/resolve
export interface ResolveIssueBody {
  resolution_note?: string;
}
export type ResolveIssueResponse = ApiResponse<DeviceIssue>;

// POST /api/issues/:id/retry
export type RetryIssueResponse = ApiResponse<DeviceIssue>;

// POST /api/issues/batch
export interface BatchIssueActionBody {
  issue_ids: UUID[];
  action: "resolve" | "ignore" | "retry";
}
export type BatchIssueActionResponse = ApiResponse<{ affected: number }>;

// ============================================
// Nodes API
// ============================================

// GET /api/nodes
export type GetNodesResponse = ApiResponse<Node[]>;

// GET /api/nodes/:id
export type GetNodeResponse = ApiResponse<Node>;

// GET /api/nodes/:id/devices
export type GetNodeDevicesResponse = ApiResponse<Device[]>;

// ============================================
// Reports API
// ============================================

// GET /api/reports/daily
export interface GetDailyReportParams {
  date: string;
}
export type GetDailyReportResponse = ApiResponse<DailyReport>;

// GET /api/reports/summary
export interface GetSummaryParams {
  dateFrom: string;
  dateTo: string;
}
export interface ReportSummary {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  total_watch_time: number;
  unique_videos: number;
  active_devices: number;
  avg_success_rate: number;
}
export type GetSummaryResponse = ApiResponse<ReportSummary>;

// ============================================
// Logs API
// ============================================

// GET /api/logs
export interface GetLogsParams {
  page?: number;
  pageSize?: number;
  level?: string;
  source?: string;
  nodeId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}
export type GetLogsResponse = ApiResponse<PaginatedResponse<SystemLog>>;

// ============================================
// YouTube Metadata API
// ============================================

// GET /api/youtube/video/:videoId
export interface YouTubeVideoMetadata {
  id: string;
  title: string;
  channel_id: string;
  channel_name: string;
  thumbnail_url: string;
  duration_seconds: number;
  view_count: number;
  published_at: string;
}
export type GetYouTubeVideoResponse = ApiResponse<YouTubeVideoMetadata>;

// GET /api/youtube/channel/:channelId
export interface YouTubeChannelMetadata {
  id: string;
  name: string;
  handle: string;
  thumbnail_url: string;
  subscriber_count: number;
  video_count: number;
}
export type GetYouTubeChannelResponse = ApiResponse<YouTubeChannelMetadata>;

// GET /api/youtube/search
export interface YouTubeSearchParams {
  q: string;
  maxResults?: number;
}
export type YouTubeSearchResponse = ApiResponse<YouTubeVideoMetadata[]>;
