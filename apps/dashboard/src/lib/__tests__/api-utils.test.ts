import { describe, it, expect } from 'vitest';
import {
  extractYouTubeVideoId,
  extractYouTubeChannelId,
  getQueryParams,
} from '../api-utils';

// ─── extractYouTubeVideoId ──────────────────────────────────────

describe('extractYouTubeVideoId()', () => {
  it('should extract from standard watch URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('dQw4w9WgXcQ');
  });

  it('should extract from short URL', () => {
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'))
      .toBe('dQw4w9WgXcQ');
  });

  it('should extract from embed URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'))
      .toBe('dQw4w9WgXcQ');
  });

  it('should extract from /v/ URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/v/dQw4w9WgXcQ'))
      .toBe('dQw4w9WgXcQ');
  });

  it('should accept raw 11-char video ID', () => {
    expect(extractYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should return null for invalid URL', () => {
    expect(extractYouTubeVideoId('https://example.com')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractYouTubeVideoId('')).toBeNull();
  });

  it('should handle URL with extra params', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120'))
      .toBe('dQw4w9WgXcQ');
  });
});

// ─── extractYouTubeChannelId ────────────────────────────────────

describe('extractYouTubeChannelId()', () => {
  it('should extract from /channel/ URL', () => {
    expect(extractYouTubeChannelId('https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx'))
      .toBe('UCxxxxxxxxxxxxxxxxxxxxxx');
  });

  it('should extract from /@ URL', () => {
    expect(extractYouTubeChannelId('https://www.youtube.com/@some_channel'))
      .toBe('some_channel');
  });

  it('should extract from /c/ URL', () => {
    expect(extractYouTubeChannelId('https://www.youtube.com/c/some-channel'))
      .toBe('some-channel');
  });

  it('should accept raw UC channel ID', () => {
    expect(extractYouTubeChannelId('UC1234567890123456789012'))
      .toBe('UC1234567890123456789012');
  });

  it('should return null for invalid URL', () => {
    expect(extractYouTubeChannelId('https://example.com')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractYouTubeChannelId('')).toBeNull();
  });
});

// ─── getQueryParams ─────────────────────────────────────────────

describe('getQueryParams()', () => {
  function makeRequest(queryString: string): Request {
    return { url: `http://localhost/api/test${queryString}` } as Request;
  }

  it('should parse default values', () => {
    const params = getQueryParams(makeRequest(''));

    expect(params.page).toBe(1);
    expect(params.pageSize).toBe(20);
    expect(params.sortOrder).toBe('desc');
    expect(params.search).toBeUndefined();
    expect(params.status).toBeUndefined();
  });

  it('should parse page and pageSize', () => {
    const params = getQueryParams(makeRequest('?page=3&pageSize=50'));

    expect(params.page).toBe(3);
    expect(params.pageSize).toBe(50);
  });

  it('should clamp pageSize to max 100', () => {
    const params = getQueryParams(makeRequest('?pageSize=500'));

    expect(params.pageSize).toBe(100);
  });

  it('should clamp pageSize minimum to 1', () => {
    const params = getQueryParams(makeRequest('?pageSize=0'));

    expect(params.pageSize).toBe(20); // 0 is falsy → defaults to 20, then clamped
  });

  it('should parse sortOrder asc/desc', () => {
    expect(getQueryParams(makeRequest('?sortOrder=asc')).sortOrder).toBe('asc');
    expect(getQueryParams(makeRequest('?sortOrder=desc')).sortOrder).toBe('desc');
  });

  it('should default sortOrder to desc for invalid values', () => {
    expect(getQueryParams(makeRequest('?sortOrder=invalid')).sortOrder).toBe('desc');
  });

  it('should parse page minimum to 1', () => {
    expect(getQueryParams(makeRequest('?page=-5')).page).toBe(1);
    expect(getQueryParams(makeRequest('?page=0')).page).toBe(1);
  });

  it('should parse search, status, and filter params', () => {
    const params = getQueryParams(
      makeRequest('?search=test&status=active&nodeId=n1&deviceId=d1&category=youtube')
    );

    expect(params.search).toBe('test');
    expect(params.status).toBe('active');
    expect(params.nodeId).toBe('n1');
    expect(params.deviceId).toBe('d1');
    expect(params.category).toBe('youtube');
  });

  it('should parse date range params', () => {
    const params = getQueryParams(
      makeRequest('?dateFrom=2026-01-01&dateTo=2026-02-01&date=2026-01-15')
    );

    expect(params.dateFrom).toBe('2026-01-01');
    expect(params.dateTo).toBe('2026-02-01');
    expect(params.date).toBe('2026-01-15');
  });

  it('should parse all optional filter params', () => {
    const params = getQueryParams(
      makeRequest('?videoId=v1&channelId=c1&level=error&source=system&type=alert&severity=high&sortBy=name')
    );

    expect(params.videoId).toBe('v1');
    expect(params.channelId).toBe('c1');
    expect(params.level).toBe('error');
    expect(params.source).toBe('system');
    expect(params.type).toBe('alert');
    expect(params.severity).toBe('high');
    expect(params.sortBy).toBe('name');
  });
});
