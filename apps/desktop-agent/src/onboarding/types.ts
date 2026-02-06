/**
 * Onboarding Types
 * 
 * 디바이스 온보딩 관련 타입 정의
 */

/**
 * 온보딩 단계
 */
export type OnboardingStep =
  | 'hardware'      // 하드웨어 검증 (ADB 연결, 모델 확인)
  | 'standardize'   // 표준화 (해상도, DPI, 타임존)
  | 'naming'        // 명명 (PC{XX}-{YY})
  | 'accessibility' // 접근성 서비스 활성화
  | 'security'      // 보안 해제 (잠금화면, USB 디버깅)
  | 'apps'          // 앱 설치 (AutoX.js 등)
  | 'network'       // 네트워크 설정
  | 'account'       // 계정 설정 (수동)
  | 'ready';        // 최종 검증

/**
 * 단계 상태
 */
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 온보딩 단계 결과
 */
export interface StepResult {
  step: OnboardingStep;
  status: StepStatus;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

/**
 * 디바이스 온보딩 상태
 */
export interface DeviceOnboardingState {
  deviceId: string;
  serial: string;
  nodeId: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  currentStep: OnboardingStep | null;
  completedSteps: OnboardingStep[];
  stepResults: StepResult[];
  startedAt?: number;
  completedAt?: number;
  lastError?: string;
  deviceInfo?: {
    model: string;
    androidVersion: string;
    serial: string;
    assignedName: string;
  };
}

/**
 * 온보딩 설정
 */
export interface OnboardingConfig {
  // 표준화 설정
  resolution: { width: number; height: number };
  dpi: number;
  timezone: string;
  language: string;
  
  // 명명 규칙
  nodeId: string;  // PC{XX}
  deviceIndexStart: number;  // 0
  
  // 설치할 APK 목록
  apks: {
    name: string;
    path: string;
    packageName: string;
    required: boolean;
  }[];
  
  // 네트워크 설정
  network?: {
    wifi?: { ssid: string; password: string };
    proxy?: { host: string; port: number };
  };
  
  // 옵션
  skipSteps?: OnboardingStep[];
  timeout?: number;
}

/**
 * 온보딩 진행률
 */
export interface OnboardingProgress {
  deviceId: string;
  totalSteps: number;
  completedSteps: number;
  currentStep: OnboardingStep | null;
  percentComplete: number;
  status: DeviceOnboardingState['status'];
  estimatedTimeRemaining?: number;
}

/**
 * 배치 온보딩 요청
 */
export interface BatchOnboardingRequest {
  deviceSerials: string[];
  config: OnboardingConfig;
  parallel?: number;  // 병렬 처리 수
}

/**
 * 배치 온보딩 결과
 */
export interface BatchOnboardingResult {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  results: DeviceOnboardingState[];
}

/**
 * 온보딩 단계 순서
 */
export const ONBOARDING_STEPS_ORDER: OnboardingStep[] = [
  'hardware',
  'standardize',
  'naming',
  'accessibility',
  'security',
  'apps',
  'network',
  'account',
  'ready',
];

/**
 * 단계별 설명
 */
export const STEP_DESCRIPTIONS: Record<OnboardingStep, string> = {
  hardware: '하드웨어 검증 (ADB 연결, 모델 확인)',
  standardize: '표준화 (해상도 720x1480, DPI 320)',
  naming: '디바이스 명명 (PC{XX}-{YY})',
  accessibility: '접근성 서비스 활성화',
  security: '보안 설정 해제 (잠금화면, USB 디버깅)',
  apps: '필수 앱 설치 (AutoX.js, YouTube)',
  network: '네트워크 설정',
  account: 'YouTube 계정 로그인 (수동)',
  ready: '최종 검증 및 준비 완료',
};

/**
 * 기본 온보딩 설정
 */
export const DEFAULT_ONBOARDING_CONFIG: Omit<OnboardingConfig, 'nodeId'> = {
  resolution: { width: 720, height: 1480 },
  dpi: 320,
  timezone: 'Asia/Seoul',
  language: 'ko-KR',
  deviceIndexStart: 0,
  apks: [
    {
      name: 'AutoX.js',
      path: '/apk/autoxjs.apk',
      packageName: 'org.autojs.autoxjs.v6',
      required: true,
    },
    {
      name: 'YouTube',
      path: '/apk/youtube.apk',
      packageName: 'com.google.android.youtube',
      required: true,
    },
  ],
  timeout: 300000,  // 5분
};
