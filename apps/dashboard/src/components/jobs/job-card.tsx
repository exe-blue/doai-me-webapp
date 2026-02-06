'use client';

import { memo, useMemo } from 'react';
import {
  PlayCircle,
  PauseCircle,
  Trash2,
  Terminal,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Clock,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface JobStats {
  pending: number;
  paused: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

interface JobProgress {
  progressPercent: number;
  currentStep: number;
  totalSteps: number;
  deviceSerial?: string;
  status?: string;
  startedAt?: number; // timestamp when job started
}

export interface Job {
  id: string;
  title: string;
  display_name?: string;
  target_url: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  duration_sec: number;
  prob_like: number;
  prob_comment: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  priority?: boolean;
  stats?: JobStats;
  total_assigned?: number;
  comment_count?: number;
}

interface JobCardProps {
  readonly job: Job;
  readonly queuePosition?: number;
  readonly totalInQueue?: number;
  readonly isRunning?: boolean;
  readonly progress?: JobProgress;
  readonly isLoading?: boolean;
  readonly elapsedSeconds?: number;
  readonly onPauseResume: (job: Job) => void;
  readonly onDelete: (job: Job) => void;
  readonly onTogglePriority?: (job: Job) => void;
  readonly onOpenLogs?: (job: Job) => void;
}

/**
 * YouTube 영상 ID 추출 유틸리티
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&?/]+)/,
    /youtube\.com\/shorts\/([^&?/]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * 시간 포맷팅 (초 -> MM:SS 또는 HH:MM:SS)
 */
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 대기 시간 포맷팅
 */
function formatWaitTime(createdAt: string): string {
  const waitMs = Date.now() - new Date(createdAt).getTime();
  const waitMins = Math.floor(waitMs / 60000);
  
  if (waitMins < 1) return '방금 전';
  if (waitMins < 60) return `${waitMins}분`;
  const waitHrs = Math.floor(waitMins / 60);
  return `${waitHrs}시간 ${waitMins % 60}분`;
}

/**
 * ETA 계산 (예상 완료 시각)
 */
function calculateETA(queuePosition: number, avgDurationSec: number): string {
  const etaMs = Date.now() + (queuePosition * avgDurationSec * 1000);
  const etaDate = new Date(etaMs);
  return etaDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Enhanced MagicUI Job Card
 * 
 * Features:
 * - YouTube thumbnail on the left
 * - Timing info (Elapsed for running, Waited/ETA for pending)
 * - Device badges
 * - Gradient progress bar with shimmer animation
 */
export const JobCard = memo(function JobCard({
  job,
  queuePosition = 0,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  totalInQueue: _totalInQueue = 0,
  isRunning = false,
  progress,
  isLoading = false,
  elapsedSeconds = 0,
  onPauseResume,
  onDelete,
  onTogglePriority,
  onOpenLogs,
}: JobCardProps) {
  // YouTube 썸네일 URL
  const videoId = useMemo(() => extractVideoId(job.target_url), [job.target_url]);
  const thumbnailUrl = videoId 
    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    : null;

  // 프로그레스 퍼센트 계산
  const progressPercent = progress?.progressPercent ?? 
    (job.stats && job.total_assigned 
      ? Math.round(((job.stats.completed + job.stats.failed) / job.total_assigned) * 100)
      : 0);

  // 현재 실행 중인 디바이스 정보
  const runningDevices = job.stats?.running || 0;
  
  // 디바이스 배지 생성
  const deviceSerial = progress?.deviceSerial;
  const deviceBadges = deviceSerial
    ? [deviceSerial]
    : runningDevices > 0
      ? [`${runningDevices}대`]
      : [];

  // 상태 배지 렌더링
  const renderStatusBadge = () => {
    const isActiveRunning = isRunning || (job.status === 'active' && runningDevices > 0);
    
    if (isActiveRunning) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-green-500/20 text-green-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Running
        </span>
      );
    }
    
    if (job.status === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-yellow-500/20 text-yellow-400">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    }
    
    if (job.status === 'paused') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-500/20 text-muted-foreground">
          <PauseCircle className="h-3 w-3" />
          Paused
        </span>
      );
    }
    
    if (job.status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-500/20 text-blue-400">
          <CheckCircle2 className="h-3 w-3" />
          Done
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-500/20 text-muted-foreground">
        <AlertCircle className="h-3 w-3" />
        {job.status}
      </span>
    );
  };

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border transition-all duration-300',
        isRunning
          ? 'border-green-500/50 bg-gradient-to-br from-green-500/5 via-card to-card shadow-lg shadow-green-500/10'
          : 'border-border bg-card/50 hover:border-border hover:bg-card/80',
        job.priority && !isRunning && 'border-l-2 border-l-yellow-500'
      )}
    >
      <div className="flex gap-3 p-3">
        {/* =========================================== */}
        {/* Left: YouTube Thumbnail */}
        {/* =========================================== */}
        <a 
          href={job.target_url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative shrink-0 w-24 h-16 rounded-md overflow-hidden bg-muted cursor-pointer hover:opacity-80 transition-opacity"
          title="YouTube에서 보기"
        >
          {thumbnailUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumbnailUrl}
              alt="Video thumbnail"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <PlayCircle className="h-6 w-6" />
            </div>
          )}
          
          {/* Queue Position Badge (only for non-running) */}
          {!isRunning && queuePosition > 0 && (
            <div className="absolute top-1 left-1 flex items-center justify-center w-5 h-5 rounded-full bg-black/80 text-white font-mono text-[10px] font-bold">
              {job.priority ? <Zap className="h-3 w-3 text-yellow-500" /> : queuePosition}
            </div>
          )}
          
          {/* Running Indicator */}
          {isRunning && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-6 w-6 text-green-500 animate-spin" />
            </div>
          )}
        </a>

        {/* =========================================== */}
        {/* Center: Job Metadata */}
        {/* =========================================== */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          {/* Top: Title & Status */}
          <div>
            <div className="flex items-center gap-2">
              <a 
                href={job.target_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm font-semibold text-foreground truncate cursor-pointer hover:text-blue-400 transition-colors"
                title="YouTube에서 보기"
              >
                {job.display_name || job.title}
              </a>
              {renderStatusBadge()}
            </div>
            
            {/* Video Title (truncated) */}
            <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
              {job.title === job.display_name ? job.target_url : job.title}
            </p>
          </div>

          {/* Bottom: Device Badges & Stats */}
          <div className="flex items-center gap-2 mt-2">
            {/* Device Badges */}
            {deviceBadges.map((badge) => (
              <span
                key={badge}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-500/20 text-blue-400"
              >
                {badge}
              </span>
            ))}
            
            {/* Stats */}
            <span className="font-mono text-[10px] text-muted-foreground">
              <span className="text-green-400">{job.stats?.completed || 0}</span>
              /
              <span className="text-muted-foreground">{job.total_assigned || 0}</span>
              {(job.stats?.failed || 0) > 0 && (
                <span className="text-red-400 ml-1">({job.stats?.failed} fail)</span>
              )}
            </span>
          </div>
        </div>

        {/* =========================================== */}
        {/* Right: Timing Info & Actions */}
        {/* =========================================== */}
        <div className="flex flex-col items-end justify-between shrink-0">
          {/* Timing Info */}
          <div className="text-right">
            {/* Running: Elapsed Time */}
            {isRunning && (
              <div className="flex items-center gap-1 text-green-400">
                <Timer className="h-3 w-3" />
                <span className="font-mono text-xs font-bold">
                  {formatDuration(elapsedSeconds)}
                </span>
              </div>
            )}
            
            {/* Pending: Wait Time & ETA */}
            {!isRunning && job.status === 'active' && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-yellow-400">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono text-[10px]">
                    대기: {formatWaitTime(job.created_at)}
                  </span>
                </div>
                {queuePosition > 0 && (
                  <div className="font-mono text-[10px] text-muted-foreground">
                    ETA: {calculateETA(queuePosition, job.duration_sec + 30)}
                  </div>
                )}
              </div>
            )}
            
            {/* Other: Duration */}
            {!isRunning && job.status !== 'active' && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {job.duration_sec}초
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {/* Console Log Button */}
            {onOpenLogs && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 hover:bg-muted"
                onClick={() => onOpenLogs(job)}
                title="로그 보기"
              >
                <Terminal className="h-3.5 w-3.5 text-green-500" />
              </Button>
            )}

            {/* Priority Toggle */}
            {onTogglePriority && !isRunning && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 hover:bg-muted"
                onClick={() => onTogglePriority(job)}
                disabled={isLoading}
                title={job.priority ? '우선순위 해제' : '우선순위 설정'}
              >
                <Zap className={cn('h-3.5 w-3.5', job.priority ? 'text-yellow-500' : 'text-muted-foreground')} />
              </Button>
            )}

            {/* Pause/Resume */}
            {(job.status === 'active' || job.status === 'paused') && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 hover:bg-muted"
                disabled={isLoading}
                onClick={() => onPauseResume(job)}
                title={job.status === 'active' ? '일시정지' : '재개'}
              >
                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {!isLoading && job.status === 'active' && <PauseCircle className="h-3.5 w-3.5 text-yellow-500" />}
                {!isLoading && job.status !== 'active' && <PlayCircle className="h-3.5 w-3.5 text-green-500" />}
              </Button>
            )}

            {/* Delete */}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 hover:bg-muted"
              disabled={isLoading}
              onClick={() => onDelete(job)}
              title="삭제"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </div>
      </div>

      {/* =========================================== */}
      {/* Bottom Progress Bar with Shimmer Animation */}
      {/* =========================================== */}
      <div className="absolute bottom-0 left-0 w-full h-1 bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 transition-all duration-500 ease-out',
            isRunning && 'bg-[length:200%_100%] animate-gradient-x'
          )}
          style={{ width: `${progressPercent}%` }}
        />
        
        {/* Shimmer Effect */}
        {isRunning && progressPercent > 0 && (
          <div
            className="absolute top-0 left-0 h-full pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          </div>
        )}
      </div>
    </div>
  );
});

export default JobCard;
