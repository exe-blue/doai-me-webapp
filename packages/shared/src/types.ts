// =============================================
// DoAi.Me 공통 타입 정의
// Backend와 Frontend가 공유하는 "언어(Type)"
// =============================================

// -----------------------------------------
// Device 관련 타입
// -----------------------------------------

/** 디바이스 상태 */
export type DeviceStatus = 'idle' | 'busy' | 'offline';

/** 디바이스 건강 상태 */
export type DeviceHealthStatus = 'healthy' | 'zombie' | 'offline';

/** 디바이스 정보 (DB: devices 테이블) */
export interface Device {
  id: string;                        // UUID PRIMARY KEY
  serial_number: string;             // UNIQUE
  pc_id: string;                     // PC 식별자
  group_id: string;                  // 그룹 ID
  status: DeviceStatus;              // 현재 상태
  last_seen_at: string;              // 마지막 확인 시각
  created_at: string;                // 생성 시각
  
  // Heartbeat 관련 (optional)
  last_heartbeat_at?: string | null;
  last_job_activity_at?: string | null;
  adb_connected?: boolean;
  consecutive_failures?: number;
  health_status?: DeviceHealthStatus;
  
  // Scrcpy 관련
  scrcpy_running?: boolean;
  scrcpy_pid?: number | null;
  
  // 네트워크 정보
  ip?: string;
  ip_address?: string;
  
  // Fixed Inventory System
  slotNum?: number;
  boardId?: string;
  slotId?: string;
  connection_info?: DeviceConnectionInfo;
}

/** 디바이스 연결 정보 */
export interface DeviceConnectionInfo {
  pcCode?: string;
  slotNum?: number;
  adbConnected?: boolean;
}

// -----------------------------------------
// Job 관련 타입
// -----------------------------------------

/** 작업 스크립트 타입 */
export type JobScriptType = 'youtube_watch' | 'youtube_search' | 'custom';

/** 작업 정보 (DB: jobs 테이블) */
export interface Job {
  id: string;                        // UUID
  title: string;                     // 작업 제목
  keyword?: string | null;           // 검색어 (NULL이면 URL 직접 진입)
  target_url: string;                // 목표 URL
  video_url?: string | null;         // 호환성 alias
  
  // 시청 설정
  duration_sec?: number;             // 시청 시간(초)
  duration_min_pct?: number;         // 최소 시청 비율
  duration_max_pct?: number;         // 최대 시청 비율
  
  // 행동 확률
  prob_like?: number;                // 좋아요 확률
  prob_comment?: number;             // 댓글 확률
  prob_playlist?: number;            // 저장 확률
  like_probability?: number;         // 호환성 alias
  
  // 메타 정보
  script_type?: JobScriptType;
  target_group?: string | null;
  base_reward?: number;
  is_active?: boolean;
  total_assignments?: number;
  created_at: string;
  updated_at?: string;
}

// -----------------------------------------
// Job Assignment 관련 타입
// -----------------------------------------

/** 작업 할당 상태 */
export type JobAssignmentStatus = 
  | 'pending' 
  | 'paused' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

/** 작업 할당 정보 (DB: job_assignments 테이블) */
export interface JobAssignment {
  id: string;                        // UUID
  job_id: string;
  device_id: string;                 // FK to devices.id
  device_serial?: string;            // 정보성
  status: JobAssignmentStatus;
  progress_pct: number;
  
  // 실행 결과
  final_duration_sec?: number;
  did_like?: boolean;
  did_comment?: boolean;
  did_playlist?: boolean;
  error_log?: string;
  
  // 타임스탬프
  assigned_at: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  
  // Join된 정보
  jobs?: Job;
}

// -----------------------------------------
// Salary 관련 타입
// -----------------------------------------

/** 급여 로그 (DB: salary_logs 테이블) */
export interface SalaryLog {
  id: string;
  assignment_id: string;
  job_id: string;
  watch_percentage: number;
  actual_duration_sec: number;
  rank_in_group?: number;
  created_at: string;
}

// -----------------------------------------
// Scrcpy 관련 타입
// -----------------------------------------

/** Scrcpy 명령 타입 */
export type ScrcpyCommandType = 
  | 'start' 
  | 'stop' 
  | 'tap' 
  | 'swipe' 
  | 'text' 
  | 'key' 
  | 'back' 
  | 'home';

/** Scrcpy 명령 */
export interface ScrcpyCommand {
  type: ScrcpyCommandType;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  text?: string;
  keycode?: number;
}

// -----------------------------------------
// Worker 관련 타입
// -----------------------------------------

/** Worker Heartbeat 데이터 */
export interface WorkerHeartbeat {
  pcId: string;
  devices: WorkerDeviceInfo[];
  timestamp?: number;
}

/** Worker에서 보내는 디바이스 정보 */
export interface WorkerDeviceInfo {
  serialNumber: string;
  status: DeviceStatus;
  slotNum?: number;
  boardId?: string;
  ip?: string;
  adbConnected?: boolean;
  currentJob?: string;
}

// -----------------------------------------
// API Response 타입
// -----------------------------------------

/** 기본 API 응답 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** 페이지네이션 응답 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
