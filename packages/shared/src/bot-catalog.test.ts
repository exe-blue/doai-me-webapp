import { describe, it, expect } from 'vitest';
import {
  YOUTUBE_WATCH_TEMPLATE,
  BOT_CATALOG,
  type BotTemplate,
  type BotActionProbabilities,
  type YouTubeWatchParams,
} from './bot-catalog';

describe('bot-catalog', () => {
  describe('BotActionProbabilities 타입', () => {
    it('확률 값이 0~1 범위인지 검증', () => {
      const probs: BotActionProbabilities = { like: 0.3, comment: 0.1, subscribe: 0.05, playlist: 0.05 };
      expect(probs.like).toBeGreaterThanOrEqual(0);
      expect(probs.like).toBeLessThanOrEqual(1);
      expect(probs.comment).toBeGreaterThanOrEqual(0);
      expect(probs.comment).toBeLessThanOrEqual(1);
      expect(probs.subscribe).toBeGreaterThanOrEqual(0);
      expect(probs.subscribe).toBeLessThanOrEqual(1);
      expect(probs.playlist).toBeGreaterThanOrEqual(0);
      expect(probs.playlist).toBeLessThanOrEqual(1);
    });
  });

  describe('YOUTUBE_WATCH_TEMPLATE', () => {
    it('올바른 ID와 메타데이터를 가짐', () => {
      expect(YOUTUBE_WATCH_TEMPLATE.id).toBe('youtube-watch-v1');
      expect(YOUTUBE_WATCH_TEMPLATE.name).toBe('YouTube 시청');
      expect(YOUTUBE_WATCH_TEMPLATE.version).toBe(1);
      expect(YOUTUBE_WATCH_TEMPLATE.category).toBe('youtube');
    });

    it('11개 스텝을 포함', () => {
      expect(YOUTUBE_WATCH_TEMPLATE.steps).toHaveLength(11);
    });

    it('모든 step.action이 유효한 타입', () => {
      const validActions = ['adb', 'system', 'wait', 'condition', 'celery', 'appium', 'scrcpy_control'];
      for (const step of YOUTUBE_WATCH_TEMPLATE.steps) {
        expect(validActions).toContain(step.action);
      }
    });

    it('모든 step에 고유한 id가 존재', () => {
      const ids = YOUTUBE_WATCH_TEMPLATE.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('첫 번째 스텝은 YouTube 앱 실행 (adb)', () => {
      const first = YOUTUBE_WATCH_TEMPLATE.steps[0];
      expect(first.action).toBe('adb');
      expect(first.command).toContain('com.google.android.youtube');
    });

    it('마지막 스텝은 report_complete (system)', () => {
      const last = YOUTUBE_WATCH_TEMPLATE.steps[YOUTUBE_WATCH_TEMPLATE.steps.length - 1];
      expect(last.action).toBe('system');
      expect(last.command).toBe('report_complete');
    });

    it('scrcpy_control 스텝이 8개', () => {
      const scrcpySteps = YOUTUBE_WATCH_TEMPLATE.steps.filter((s) => s.action === 'scrcpy_control');
      expect(scrcpySteps).toHaveLength(8);
    });

    it('defaultParams에 합리적인 기본값이 설정됨', () => {
      const dp = YOUTUBE_WATCH_TEMPLATE.defaultParams;
      expect(dp.durationMinPct).toBe(70);
      expect(dp.durationMaxPct).toBe(100);
      expect(dp.skipAdTimeout).toBe(15000);
      expect(dp.watchTimeout).toBe(1200000);
      expect(dp.actionProbabilities).toBeDefined();
      expect(dp.actionProbabilities!.like).toBe(0.3);
    });

    it('timeout이 20분(1200000ms)', () => {
      expect(YOUTUBE_WATCH_TEMPLATE.timeout).toBe(1200000);
    });
  });

  describe('BOT_CATALOG', () => {
    it('youtube-watch-v1 템플릿을 포함', () => {
      expect(BOT_CATALOG['youtube-watch-v1']).toBeDefined();
      expect(BOT_CATALOG['youtube-watch-v1']).toBe(YOUTUBE_WATCH_TEMPLATE);
    });

    it('모든 카탈로그 항목이 BotTemplate 구조를 만족', () => {
      for (const [key, template] of Object.entries(BOT_CATALOG)) {
        expect(template.id).toBe(key);
        expect(typeof template.name).toBe('string');
        expect(typeof template.description).toBe('string');
        expect(typeof template.version).toBe('number');
        expect(Array.isArray(template.steps)).toBe(true);
        expect(template.steps.length).toBeGreaterThan(0);
        expect(typeof template.timeout).toBe('number');
      }
    });
  });
});
