import * as React from "react";
import { cn } from "@packages/ui/lib/utils";
import type { JobProgress, JobPhase, ActionType } from "@doai/shared";

/**
 * 진행 단계별 라벨 (한국어)
 */
const PHASE_LABELS: Record<JobPhase, string> = {
  searching: "영상 검색 중",
  watching: "시청 중",
  interacting: "상호작용 중",
  surfing: "피드 서핑 중",
  completed: "완료",
  failed: "실패",
};

/**
 * 진행 단계별 색상 스타일
 */
const PHASE_STYLES: Record<JobPhase, string> = {
  searching: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  watching: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
  interacting: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
  surfing: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800",
  completed: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  failed: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

/**
 * 액션 타입별 아이콘 (이모지)
 */
const ACTION_ICONS: Record<ActionType, string> = {
  like: "👍",
  comment: "💬",
  subscribe: "🔔",
  playlist: "📋",
};

export interface StatusCardProps {
  /** Job 진행 상태 데이터 */
  progress: JobProgress;
  /** 로딩 상태 (스켈레톤 표시) */
  loading?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * StatusCard 컴포넌트
 * JobProgress 데이터를 기반으로 영상 시청 진행 상태를 표시
 *
 * @example
 * <StatusCard progress={jobProgress} />
 */
export const StatusCard = ({ progress, loading, className }: StatusCardProps) => {
  // 로딩 상태: 스켈레톤 UI
  if (loading) {
    return (
      <div
        className={cn(
          "w-full max-w-md rounded-lg border bg-card p-4 animate-pulse",
          className
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-24 bg-muted rounded" />
          <div className="h-5 w-16 bg-muted rounded-full" />
        </div>
        <div className="h-4 w-3/4 bg-muted rounded mb-3" />
        <div className="h-2 w-full bg-muted rounded mb-2" />
        <div className="flex gap-2">
          <div className="h-6 w-6 bg-muted rounded" />
          <div className="h-6 w-6 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const { phase, currentVideoTitle, watchDuration, targetDuration, actionsPerformed, errorMessage } = progress;

  // 진행률 계산 (0-100)
  const progressPercent = targetDuration > 0 
    ? Math.min(100, Math.round((watchDuration / targetDuration) * 100))
    : 0;

  // 시간 포맷 (초 → mm:ss)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isCompleted = phase === "completed";
  const isFailed = phase === "failed";

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200",
        isFailed && "border-red-300 dark:border-red-800",
        isCompleted && "border-green-300 dark:border-green-800",
        className
      )}
    >
      {/* 헤더: Job ID + Phase 배지 */}
      <div className="flex items-center justify-between p-4 pb-2">
        <span className="text-xs font-mono text-muted-foreground">
          {progress.jobId}
        </span>
        <span
          className={cn(
            "px-2.5 py-0.5 rounded-full text-xs font-medium border",
            PHASE_STYLES[phase]
          )}
        >
          {PHASE_LABELS[phase]}
        </span>
      </div>

      {/* 본문: 영상 제목 + 진행률 */}
      <div className="px-4 pb-3">
        {/* 영상 제목 */}
        {currentVideoTitle ? (
          <p className="text-sm font-medium truncate mb-2" title={currentVideoTitle}>
            {currentVideoTitle}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic mb-2">
            {isFailed ? "영상을 찾지 못함" : "영상 검색 중..."}
          </p>
        )}

        {/* 진행 바 (시청 중일 때만) */}
        {!isCompleted && !isFailed && (
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(watchDuration)}</span>
              <span>{formatTime(targetDuration)}</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  phase === "watching" ? "bg-primary animate-pulse" : "bg-primary/70"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* 완료 시 전체 시간 표시 */}
        {isCompleted && (
          <div className="text-sm text-green-600 dark:text-green-400 mb-2">
            ✓ 시청 완료 ({formatTime(watchDuration)})
          </div>
        )}

        {/* 에러 메시지 */}
        {isFailed && errorMessage && (
          <div className="text-sm text-red-600 dark:text-red-400 mb-2">
            ✗ {errorMessage}
          </div>
        )}
      </div>

      {/* 푸터: 수행된 액션 */}
      {actionsPerformed && actionsPerformed.length > 0 && (
        <div className="px-4 pb-4 pt-2 border-t border-border">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">수행:</span>
            {actionsPerformed?.map((action) => (
              <span
                key={action}
                className="text-sm"
                title={action}
              >
                {ACTION_ICONS[action]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
