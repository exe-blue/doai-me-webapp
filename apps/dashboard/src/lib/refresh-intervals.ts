export const REFRESH_INTERVALS = {
  /** 실시간 — 실행중 태스크, 라이브 로그 (3s) */
  REALTIME: 3_000,
  /** 운영 — 디바이스, 작업, 노드, 통계 (5s) */
  OPERATIONAL: 5_000,
  /** 콘텐츠 — 채널, 키워드, 영상, 스케줄, 시청 (30s) */
  CONTENT: 30_000,
  /** 분석 — 애널리틱스, 리포트 (60s) */
  ANALYTICS: 60_000,
} as const;
