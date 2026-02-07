import { describe, it, expect } from 'vitest';
import {
  CANONICAL_WORKER_EVENTS,
  CANONICAL_DASHBOARD_EVENTS,
  type JobAssignPayload,
  type JobProgressPayload,
  type JobCompletePayload,
} from './events';
import { WORKER_EVENTS, DASHBOARD_EVENTS } from './constants';

describe('events — Canonical Event Map', () => {
  describe('CANONICAL_WORKER_EVENTS', () => {
    it('필수 이벤트가 모두 존재', () => {
      expect(CANONICAL_WORKER_EVENTS.HEARTBEAT).toBeDefined();
      expect(CANONICAL_WORKER_EVENTS.JOB_ASSIGN).toBeDefined();
      expect(CANONICAL_WORKER_EVENTS.JOB_STARTED).toBeDefined();
      expect(CANONICAL_WORKER_EVENTS.JOB_PROGRESS).toBeDefined();
      expect(CANONICAL_WORKER_EVENTS.JOB_COMPLETED).toBeDefined();
      expect(CANONICAL_WORKER_EVENTS.JOB_FAILED).toBeDefined();
      expect(CANONICAL_WORKER_EVENTS.SCRCPY_THUMBNAIL).toBeDefined();
    });

    it('constants.ts WORKER_EVENTS와 동일한 값 사용 (하위 호환)', () => {
      expect(CANONICAL_WORKER_EVENTS.HEARTBEAT).toBe(WORKER_EVENTS.HEARTBEAT);
      expect(CANONICAL_WORKER_EVENTS.HEARTBEAT_ACK).toBe(WORKER_EVENTS.HEARTBEAT_ACK);
      expect(CANONICAL_WORKER_EVENTS.JOB_ASSIGN).toBe(WORKER_EVENTS.JOB_ASSIGN);
      expect(CANONICAL_WORKER_EVENTS.JOB_STARTED).toBe(WORKER_EVENTS.JOB_STARTED);
      expect(CANONICAL_WORKER_EVENTS.JOB_PROGRESS).toBe(WORKER_EVENTS.JOB_PROGRESS);
      expect(CANONICAL_WORKER_EVENTS.JOB_COMPLETED).toBe(WORKER_EVENTS.JOB_COMPLETED);
      expect(CANONICAL_WORKER_EVENTS.JOB_FAILED).toBe(WORKER_EVENTS.JOB_FAILED);
      expect(CANONICAL_WORKER_EVENTS.DEVICE_INIT).toBe(WORKER_EVENTS.DEVICE_INIT);
      expect(CANONICAL_WORKER_EVENTS.DEVICE_COMMAND).toBe(WORKER_EVENTS.DEVICE_COMMAND);
      expect(CANONICAL_WORKER_EVENTS.COMMAND_ACK).toBe(WORKER_EVENTS.COMMAND_ACK);
      expect(CANONICAL_WORKER_EVENTS.SCRCPY_THUMBNAIL).toBe(WORKER_EVENTS.SCRCPY_THUMBNAIL);
    });

    it('모든 값이 문자열', () => {
      for (const value of Object.values(CANONICAL_WORKER_EVENTS)) {
        expect(typeof value).toBe('string');
      }
    });

    it('중복 이벤트 값이 없음', () => {
      const values = Object.values(CANONICAL_WORKER_EVENTS);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe('CANONICAL_DASHBOARD_EVENTS', () => {
    it('필수 이벤트가 모두 존재', () => {
      expect(CANONICAL_DASHBOARD_EVENTS.DEVICES_INITIAL).toBeDefined();
      expect(CANONICAL_DASHBOARD_EVENTS.DEVICE_UPDATE).toBeDefined();
      expect(CANONICAL_DASHBOARD_EVENTS.JOB_DISTRIBUTE).toBeDefined();
      expect(CANONICAL_DASHBOARD_EVENTS.SCRCPY_START).toBeDefined();
      expect(CANONICAL_DASHBOARD_EVENTS.SCRCPY_STOP).toBeDefined();
    });

    it('constants.ts DASHBOARD_EVENTS와 동일한 값 사용 (하위 호환)', () => {
      expect(CANONICAL_DASHBOARD_EVENTS.DEVICES_INITIAL).toBe(DASHBOARD_EVENTS.DEVICES_INITIAL);
      expect(CANONICAL_DASHBOARD_EVENTS.DEVICE_UPDATE).toBe(DASHBOARD_EVENTS.DEVICE_UPDATE);
      expect(CANONICAL_DASHBOARD_EVENTS.JOB_DISTRIBUTE).toBe(DASHBOARD_EVENTS.JOB_DISTRIBUTE);
      expect(CANONICAL_DASHBOARD_EVENTS.SCRCPY_START).toBe(DASHBOARD_EVENTS.SCRCPY_START);
      expect(CANONICAL_DASHBOARD_EVENTS.SCRCPY_STOP).toBe(DASHBOARD_EVENTS.SCRCPY_STOP);
    });

    it('중복 이벤트 값이 없음', () => {
      const values = Object.values(CANONICAL_DASHBOARD_EVENTS);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe('JobAssignPayload 타입 검증', () => {
    it('올바른 페이로드 구조 생성', () => {
      const payload: JobAssignPayload = {
        jobId: 'job-1',
        assignmentId: 'assign-1',
        deviceId: 'dev-1',
        deviceSerial: '192.168.50.111:5555',
        botTemplateId: 'youtube-watch-v1',
        params: {
          keyword: '테스트 키워드',
          videoTitle: '테스트 영상',
          videoUrl: 'https://youtube.com/watch?v=test',
          youtubeId: 'test123',
          durationMinPct: 70,
          durationMaxPct: 100,
          actionProbabilities: { like: 0.3, comment: 0.1, subscribe: 0.05, playlist: 0.05 },
          skipAdTimeout: 15000,
          watchTimeout: 1200000,
        },
        priority: 1,
        timeoutMs: 1200000,
      };
      expect(payload.jobId).toBe('job-1');
      expect(payload.botTemplateId).toBe('youtube-watch-v1');
      expect(payload.params.actionProbabilities.like).toBe(0.3);
    });
  });

  describe('JobProgressPayload 타입 검증', () => {
    it('올바른 페이로드 구조 생성', () => {
      const payload: JobProgressPayload = {
        jobId: 'job-1',
        assignmentId: 'assign-1',
        deviceId: 'dev-1',
        stepId: 'watch',
        progress: 50,
        message: '시청 중...',
        timestamp: Date.now(),
      };
      expect(payload.progress).toBe(50);
      expect(payload.stepId).toBe('watch');
    });
  });

  describe('JobCompletePayload 타입 검증', () => {
    it('성공 페이로드 생성', () => {
      const payload: JobCompletePayload = {
        jobId: 'job-1',
        assignmentId: 'assign-1',
        deviceId: 'dev-1',
        success: true,
        durationMs: 600000,
        result: {
          actualWatchPct: 85,
          didLike: true,
          didComment: false,
          didSubscribe: false,
          didPlaylist: false,
        },
        timestamp: Date.now(),
      };
      expect(payload.success).toBe(true);
      expect(payload.result!.actualWatchPct).toBe(85);
    });

    it('실패 페이로드 생성', () => {
      const payload: JobCompletePayload = {
        jobId: 'job-1',
        assignmentId: 'assign-1',
        deviceId: 'dev-1',
        success: false,
        durationMs: 30000,
        error: {
          code: 'AD_SKIP_FAILED',
          message: '광고 스킵 실패',
          stepId: 'skip_ad',
          recoverable: true,
        },
        timestamp: Date.now(),
      };
      expect(payload.success).toBe(false);
      expect(payload.error!.code).toBe('AD_SKIP_FAILED');
      expect(payload.error!.recoverable).toBe(true);
    });
  });
});
