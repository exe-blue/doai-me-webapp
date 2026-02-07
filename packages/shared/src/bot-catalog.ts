/**
 * Bot Catalog — 봇 워크플로우 템플릿 정의
 *
 * YouTube 시청 봇 등 자동화 워크플로우의 템플릿을 정의한다.
 * WorkflowRunner가 이 템플릿을 기반으로 봇을 실행.
 */

import type { WorkflowStep } from './database';

// ============================================
// 봇 액션 확률 타입
// ============================================

export interface BotActionProbabilities {
  like: number;       // 0~1 (예: 0.3 = 30%)
  comment: number;
  subscribe: number;
  playlist: number;
}

// ============================================
// YouTube 시청 파라미터
// ============================================

export interface YouTubeWatchParams {
  keyword: string;
  videoTitle: string;
  videoUrl: string;
  durationMinPct: number;    // 최소 시청률 (예: 70)
  durationMaxPct: number;    // 최대 시청률 (예: 100)
  actionProbabilities: BotActionProbabilities;
  commentText?: string;       // 댓글 내용 (확률 당첨 시)
  skipAdTimeout: number;      // 광고 스킵 대기 (ms)
  watchTimeout: number;       // 전체 타임아웃 (ms, 기본 1200000=20분)
}

// ============================================
// 봇 템플릿 타입
// ============================================

export interface BotTemplate {
  id: string;
  name: string;
  description: string;
  version: number;
  category: 'youtube' | 'install' | 'health' | 'custom';
  defaultParams: Partial<YouTubeWatchParams>;
  steps: WorkflowStep[];
  timeout: number;
}

// ============================================
// YouTube 시청 봇 (11단계)
// ============================================

export const YOUTUBE_WATCH_TEMPLATE: BotTemplate = {
  id: 'youtube-watch-v1',
  name: 'YouTube 시청',
  description: '키워드 검색 → 영상 선택 → 시청 → 유저 액션',
  version: 1,
  category: 'youtube',
  timeout: 1200000,
  defaultParams: {
    durationMinPct: 70,
    durationMaxPct: 100,
    skipAdTimeout: 15000,
    watchTimeout: 1200000,
    actionProbabilities: { like: 0.3, comment: 0.1, subscribe: 0.05, playlist: 0.05 },
  },
  steps: [
    { id: 'launch',         action: 'adb',            command: 'shell am start -n com.google.android.youtube/.HomeActivity' },
    { id: 'wait_launch',    action: 'wait',            params: { ms: 3000 } },
    { id: 'search',         action: 'scrcpy_control',  params: { type: 'youtube_search', keyword: '{{keyword}}' } },
    { id: 'select_video',   action: 'scrcpy_control',  params: { type: 'youtube_select', title: '{{videoTitle}}' } },
    { id: 'skip_ad',        action: 'scrcpy_control',  params: { type: 'youtube_skip_ad', timeout: '{{skipAdTimeout}}' } },
    { id: 'watch',          action: 'scrcpy_control',  params: { type: 'youtube_watch', durationMinPct: '{{durationMinPct}}', durationMaxPct: '{{durationMaxPct}}' } },
    { id: 'action_like',    action: 'scrcpy_control',  params: { type: 'youtube_like', probability: '{{actionProbabilities.like}}' } },
    { id: 'action_sub',     action: 'scrcpy_control',  params: { type: 'youtube_subscribe', probability: '{{actionProbabilities.subscribe}}' } },
    { id: 'action_save',    action: 'scrcpy_control',  params: { type: 'youtube_playlist', probability: '{{actionProbabilities.playlist}}' } },
    { id: 'action_comment', action: 'scrcpy_control',  params: { type: 'youtube_comment', probability: '{{actionProbabilities.comment}}', text: '{{commentText}}' } },
    { id: 'report',         action: 'system',          command: 'report_complete' },
  ],
};

// ============================================
// 봇 카탈로그
// ============================================

export const BOT_CATALOG: Record<string, BotTemplate> = {
  'youtube-watch-v1': YOUTUBE_WATCH_TEMPLATE,
};
