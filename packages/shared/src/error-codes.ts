// ============================================
// DoAi.Me Error Code System
// SYSTEM-SPECIFICATION.md 섹션 7 기반
// ============================================

// 에러 코드 상수
export const ERROR_CODES = {
  // E1xxx - Network
  E1001: 'E1001', // Supabase 연결 실패
  E1002: 'E1002', // 요청 타임아웃
  E1003: 'E1003', // Rate limit 초과
  // E2xxx - YouTube
  E2001: 'E2001', // 영상 삭제/비공개
  E2002: 'E2002', // 지역 제한
  E2003: 'E2003', // 연령 제한
  E2004: 'E2004', // 재생 오류
  // E3xxx - Device
  E3001: 'E3001', // 앱 크래시
  E3002: 'E3002', // 메모리 부족
  E3003: 'E3003', // 화면 잠금
  E3004: 'E3004', // 배터리 부족
  // E4xxx - System
  E4001: 'E4001', // 알 수 없는 오류
} as const;

export type ErrorCodeValue = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// 에러 카테고리
export type ErrorCategory = 'network' | 'youtube' | 'device' | 'system';

// 에러 코드 메타데이터
export interface ErrorCodeMeta {
  description: string;
  category: ErrorCategory;
  retryable: boolean;
}

export const ERROR_CODE_META: Record<ErrorCodeValue, ErrorCodeMeta> = {
  E1001: { description: 'Supabase 연결 실패', category: 'network', retryable: true },
  E1002: { description: '요청 타임아웃', category: 'network', retryable: true },
  E1003: { description: 'Rate limit 초과', category: 'network', retryable: true },
  E2001: { description: '영상 삭제/비공개', category: 'youtube', retryable: false },
  E2002: { description: '지역 제한', category: 'youtube', retryable: false },
  E2003: { description: '연령 제한', category: 'youtube', retryable: false },
  E2004: { description: '재생 오류', category: 'youtube', retryable: true },
  E3001: { description: '앱 크래시', category: 'device', retryable: true },
  E3002: { description: '메모리 부족', category: 'device', retryable: true },
  E3003: { description: '화면 잠금', category: 'device', retryable: true },
  E3004: { description: '배터리 부족', category: 'device', retryable: false },
  E4001: { description: '알 수 없는 오류', category: 'system', retryable: false },
};

// 에러 메시지 → 에러 코드 매핑 패턴
const ERROR_PATTERNS: Array<{ pattern: RegExp; code: ErrorCodeValue }> = [
  // Network (E1xxx)
  { pattern: /supabase|connection refused|ECONNREFUSED|database.*connect/i, code: 'E1001' },
  { pattern: /timeout|ETIMEDOUT|ESOCKETTIMEDOUT|timed?\s*out/i, code: 'E1002' },
  { pattern: /rate.?limit|too many requests|429|throttl/i, code: 'E1003' },
  // YouTube (E2xxx)
  { pattern: /video.*(?:unavailable|deleted|private|removed)|not.*available/i, code: 'E2001' },
  { pattern: /geo.?restrict|region|country.*block|not.*your.*country/i, code: 'E2002' },
  { pattern: /age.?restrict|sign.?in.*confirm.*age|age.*verification/i, code: 'E2003' },
  { pattern: /playback|player.*error|buffering.*fail|video.*error/i, code: 'E2004' },
  // Device (E3xxx)
  { pattern: /crash|app.*stop|force.*close|ANR|not.*responding/i, code: 'E3001' },
  { pattern: /memory|OOM|out.*of.*memory|low.*memory/i, code: 'E3002' },
  { pattern: /screen.*lock|lock.*screen|device.*locked/i, code: 'E3003' },
  { pattern: /battery|low.*power|charging.*required/i, code: 'E3004' },
];

/**
 * 에러 메시지 문자열에서 에러 코드를 추론
 * 매칭 패턴이 없으면 E4001 (알 수 없는 오류) 반환
 */
export function classifyError(errorMessage: string): ErrorCodeValue {
  if (!errorMessage) return 'E4001';

  for (const { pattern, code } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return code;
    }
  }

  return 'E4001';
}

/**
 * 에러 코드의 재시도 가능 여부 판단
 */
export function isRetryable(code: ErrorCodeValue): boolean {
  return ERROR_CODE_META[code]?.retryable ?? false;
}

/**
 * 에러 코드의 카테고리 반환
 */
export function getErrorCategory(code: ErrorCodeValue): ErrorCategory {
  return ERROR_CODE_META[code]?.category ?? 'system';
}
