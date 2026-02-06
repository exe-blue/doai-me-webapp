/**
 * Device Management Types
 * 관리번호 체계: PC01~PC99, 디바이스 001~999
 * 최종 형식: PC**-*** (예: PC01-001)
 */

// ============================================
// PC (미니PC) 타입
// ============================================

export type PCStatus = 'online' | 'offline' | 'error';

export interface PC {
  id: string;
  pc_number: string;        // 'PC01' ~ 'PC99' (서버 자동할당)
  ip_address: string | null;
  hostname: string | null;
  label: string | null;     // 사용자 지정 별명
  location: string | null;  // 물리적 위치
  max_devices: number;      // 최대 연결 가능 디바이스 수 (기본: 20)
  status: PCStatus;
  last_heartbeat: string | null;
  created_at: string;
  updated_at: string;
  
  // 관계 (조회 시 포함)
  devices?: Device[];
  device_count?: number;
  online_count?: number;
  error_count?: number;
  avg_battery?: number;
}

// ============================================
// Device (Galaxy S9) 타입
// ============================================

export type DeviceStatus = 'online' | 'offline' | 'busy' | 'error';
export type ConnectionType = 'usb' | 'wifi' | 'both';

export interface Device {
  id: string;
  pc_id: string | null;     // FK → pcs.id (NULL = 미배정)
  device_number: number;    // 1 ~ 999 (PC 내 순번)
  management_code?: string; // 'PC01-001' (computed)
  
  // 식별자 (둘 중 하나 이상 필수)
  serial_number: string | null; // ADB serial (예: 'R58M41XXXXX')
  ip_address: string | null;    // WiFi ADB IP (예: '192.168.1.100')
  
  // 디바이스 정보
  model: string;
  android_version: string | null;
  connection_type: ConnectionType;
  usb_port: number | null;  // USB 허브 포트 번호
  
  // 상태
  status: DeviceStatus;
  battery_level: number | null;
  last_heartbeat: string | null;
  last_task_at: string | null;
  
  // 에러 추적
  error_count: number;
  last_error: string | null;
  last_error_at: string | null;
  
  created_at: string;
  updated_at: string;
  
  // 관계 (조회 시 포함)
  pc?: PC;
}

// ============================================
// API 요청/응답 타입
// ============================================

// PC 생성 요청
export interface CreatePCRequest {
  ip_address?: string;
  hostname?: string;
  label?: string;
  location?: string;
  max_devices?: number;
}

// PC 업데이트 요청
export interface UpdatePCRequest {
  ip_address?: string | null;
  hostname?: string | null;
  label?: string | null;
  location?: string | null;
  max_devices?: number;
  status?: PCStatus;
}

// 디바이스 생성 요청
export interface CreateDeviceRequest {
  pc_id?: string;           // null이면 미배정
  serial_number?: string;   // 둘 중 하나 필수
  ip_address?: string;      // 둘 중 하나 필수
  model?: string;
  android_version?: string;
  connection_type?: ConnectionType;
  usb_port?: number;
}

// 디바이스 업데이트 요청
export interface UpdateDeviceRequest {
  pc_id?: string | null;
  serial_number?: string | null;
  ip_address?: string | null;
  model?: string;
  android_version?: string | null;
  connection_type?: ConnectionType;
  usb_port?: number | null;
  status?: DeviceStatus;
  battery_level?: number | null;
  error_count?: number;
  last_error?: string | null;
}

// PC에 디바이스 배정 요청
export interface AssignDeviceRequest {
  device_id: string;
  pc_id: string;
  usb_port?: number;
}

// ADB 스캔 결과로 일괄 등록 요청
export interface BulkRegisterDeviceRequest {
  pc_id: string;
  devices: Array<{
    serial_number?: string;
    ip_address?: string;
    model?: string;
    android_version?: string;
    connection_type?: ConnectionType;
  }>;
}

// ============================================
// 뷰 타입 (조회용)
// ============================================

export interface DeviceOverview {
  id: string;
  management_code: string;
  pc_number: string | null;
  device_number: number;
  serial_number: string;
  ip_address: string;
  model: string;
  connection_type: ConnectionType;
  usb_port: number | null;
  device_status: DeviceStatus;
  pc_status: PCStatus | 'unassigned';
  battery_level: number | null;
  last_heartbeat: string | null;
  last_task_at: string | null;
  error_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PCSummary {
  id: string;
  pc_number: string;
  ip_address: string | null;
  hostname: string | null;
  label: string | null;
  location: string | null;
  max_devices: number;
  status: PCStatus;
  last_heartbeat: string | null;
  device_count: number;
  online_count: number;
  error_count: number;
  avg_battery: number | null;
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 관리번호 파싱
 * @param code 관리번호 (예: 'PC01-001')
 * @returns { pcNumber: 'PC01', deviceNumber: 1 } 또는 null
 */
export function parseManagementCode(code: string): { pcNumber: string; deviceNumber: number } | null {
  const match = code.match(/^(PC\d{2})-(\d{3})$/);
  if (!match) return null;
  return {
    pcNumber: match[1],
    deviceNumber: parseInt(match[2], 10)
  };
}

/**
 * 관리번호 포맷팅
 * @param pcNumber PC 번호 (예: 'PC01')
 * @param deviceNumber 디바이스 번호 (예: 1)
 * @returns 관리번호 (예: 'PC01-001')
 */
export function formatManagementCode(pcNumber: string, deviceNumber: number): string {
  return `${pcNumber}-${deviceNumber.toString().padStart(3, '0')}`;
}

/**
 * PC 번호 유효성 검사
 * @param pcNumber PC 번호 (예: 'PC01')
 * @returns 유효 여부
 */
export function isValidPCNumber(pcNumber: string): boolean {
  return /^PC\d{2}$/.test(pcNumber);
}

/**
 * 디바이스 번호 유효성 검사
 * @param deviceNumber 디바이스 번호 (1~999)
 * @returns 유효 여부
 */
export function isValidDeviceNumber(deviceNumber: number): boolean {
  return Number.isInteger(deviceNumber) && deviceNumber >= 1 && deviceNumber <= 999;
}

/**
 * 관리번호 유효성 검사
 * @param code 관리번호 (예: 'PC01-001')
 * @returns 유효 여부
 */
export function isValidManagementCode(code: string): boolean {
  return parseManagementCode(code) !== null;
}

// ============================================
// 상수
// ============================================

export const DEVICE_CONSTANTS = {
  MAX_PC_COUNT: 99,
  MAX_DEVICE_PER_PC: 999,
  DEFAULT_MAX_DEVICES: 20,
  DEFAULT_MODEL: 'Galaxy S9',
  PC_NUMBER_PATTERN: /^PC\d{2}$/,
  MANAGEMENT_CODE_PATTERN: /^PC\d{2}-\d{3}$/,
} as const;
