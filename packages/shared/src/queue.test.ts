import { describe, it, expect } from 'vitest';
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  type VideoExecutionJobData,
  type CommentGenerationJobData,
  type CommentGenerationJobResult,
} from './queue';

describe('queue', () => {
  describe('QUEUE_NAMES', () => {
    it('COMMENT_GENERATION 큐가 존재', () => {
      expect(QUEUE_NAMES.COMMENT_GENERATION).toBe('comment-generation');
    });

    it('기존 큐 이름이 유지됨', () => {
      expect(QUEUE_NAMES.VIDEO_EXECUTION).toBe('video-execution');
      expect(QUEUE_NAMES.DEVICE_COMMAND).toBe('device-command');
      expect(QUEUE_NAMES.METADATA_FETCH).toBe('metadata-fetch');
      expect(QUEUE_NAMES.SCHEDULED_TASK).toBe('scheduled-task');
      expect(QUEUE_NAMES.CLEANUP).toBe('cleanup');
      expect(QUEUE_NAMES.SCRIPT_EXECUTION).toBe('script-execution');
      expect(QUEUE_NAMES.DEVICE_REGISTRATION).toBe('device-registration');
    });

    it('총 8개 큐가 정의됨', () => {
      expect(Object.keys(QUEUE_NAMES)).toHaveLength(8);
    });
  });

  describe('VideoExecutionJobData — YouTube 봇 파라미터', () => {
    it('기존 필드만으로 생성 가능 (하위 호환)', () => {
      const job: VideoExecutionJobData = {
        executionId: 'exec-1' as any,
        videoId: 'vid-1' as any,
        youtubeId: 'yt123',
        targetWatchSeconds: 300,
        priority: 1,
        retryCount: 0,
        maxRetries: 3,
      };
      expect(job.youtubeId).toBe('yt123');
      expect(job.keyword).toBeUndefined();
      expect(job.botTemplateId).toBeUndefined();
    });

    it('YouTube 봇 파라미터 포함하여 생성 가능', () => {
      const job: VideoExecutionJobData = {
        executionId: 'exec-1' as any,
        videoId: 'vid-1' as any,
        youtubeId: 'yt123',
        targetWatchSeconds: 300,
        priority: 1,
        retryCount: 0,
        maxRetries: 3,
        keyword: '테스트 키워드',
        durationMinPct: 70,
        durationMaxPct: 100,
        actionProbabilities: { like: 0.3, comment: 0.1, subscribe: 0.05, playlist: 0.05 },
        commentText: '좋은 영상이네요!',
        botTemplateId: 'youtube-watch-v1',
      };
      expect(job.keyword).toBe('테스트 키워드');
      expect(job.botTemplateId).toBe('youtube-watch-v1');
      expect(job.actionProbabilities!.like).toBe(0.3);
    });
  });

  describe('CommentGenerationJobData', () => {
    it('올바른 구조로 생성 가능', () => {
      const job: CommentGenerationJobData = {
        jobId: 'job-1' as any,
        videoTitle: '테스트 영상',
        videoUrl: 'https://youtube.com/watch?v=test',
        channelName: '테스트 채널',
        count: 10,
        language: 'ko',
        style: 'positive',
      };
      expect(job.count).toBe(10);
      expect(job.language).toBe('ko');
      expect(job.style).toBe('positive');
    });

    it('optional 필드 없이 생성 가능', () => {
      const job: CommentGenerationJobData = {
        jobId: 'job-1' as any,
        videoTitle: '테스트 영상',
        videoUrl: 'https://youtube.com/watch?v=test',
        count: 5,
        language: 'en',
      };
      expect(job.channelName).toBeUndefined();
      expect(job.style).toBeUndefined();
    });
  });

  describe('CommentGenerationJobResult', () => {
    it('성공 결과 생성', () => {
      const result: CommentGenerationJobResult = {
        jobId: 'job-1' as any,
        comments: ['좋아요!', '잘 봤습니다', '구독합니다'],
        success: true,
      };
      expect(result.success).toBe(true);
      expect(result.comments).toHaveLength(3);
    });

    it('실패 결과 생성', () => {
      const result: CommentGenerationJobResult = {
        jobId: 'job-1' as any,
        comments: [],
        success: false,
        errorMessage: 'API rate limit exceeded',
      };
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  describe('DEFAULT_JOB_OPTIONS', () => {
    it('COMMENT_GENERATION 옵션이 존재', () => {
      const opts = DEFAULT_JOB_OPTIONS[QUEUE_NAMES.COMMENT_GENERATION];
      expect(opts).toBeDefined();
      expect(opts.attempts).toBe(2);
      expect(opts.backoff.type).toBe('exponential');
      expect(opts.backoff.delay).toBe(3000);
    });

    it('모든 큐에 대한 옵션이 존재', () => {
      for (const queueName of Object.values(QUEUE_NAMES)) {
        expect(DEFAULT_JOB_OPTIONS[queueName as keyof typeof DEFAULT_JOB_OPTIONS]).toBeDefined();
      }
    });
  });
});
