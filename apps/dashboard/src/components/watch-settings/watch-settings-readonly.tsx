'use client';

import { useState } from 'react';
import { ThumbsUp, MessageSquare, UserPlus, Clock } from 'lucide-react';

interface WatchDefaults {
  defaultLikeRate: number;
  defaultCommentRate: number;
  defaultSubscribeRate: number;
  defaultWatchDurationMinPct: number;
  defaultWatchDurationMaxPct: number;
}

const STORAGE_KEY = 'doaime-settings';

const FALLBACK: WatchDefaults = {
  defaultLikeRate: 30,
  defaultCommentRate: 5,
  defaultSubscribeRate: 10,
  defaultWatchDurationMinPct: 30,
  defaultWatchDurationMaxPct: 100,
};

export function WatchSettingsReadonly() {
  const [defaults] = useState<WatchDefaults>(() => {
    if (typeof window === 'undefined') return FALLBACK;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...FALLBACK, ...JSON.parse(stored) };
    } catch {
      // keep fallback
    }
    return FALLBACK;
  });

  return (
    <div className="rounded-lg border border-border p-4 bg-card/50 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium font-head text-foreground">글로벌 기본값</span>
        <span className="text-[10px] text-muted-foreground">시청설정 페이지에서 변경</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ThumbsUp className="h-3 w-3" />
          좋아요
        </div>
        <div className="text-foreground">{defaults.defaultLikeRate}%</div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          댓글
        </div>
        <div className="text-foreground">{defaults.defaultCommentRate}%</div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <UserPlus className="h-3 w-3" />
          구독
        </div>
        <div className="text-foreground">{defaults.defaultSubscribeRate}%</div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          시청 비율
        </div>
        <div className="text-foreground">
          {defaults.defaultWatchDurationMinPct}% ~ {defaults.defaultWatchDurationMaxPct}%
        </div>
      </div>
    </div>
  );
}
