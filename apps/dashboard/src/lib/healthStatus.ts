import type { Device } from './supabase';

export type HealthStatus = 'healthy' | 'zombie' | 'offline';

// 상수 정의 (Acceptance Criteria 기준)
const HEALTHY_THRESHOLD_MS = 60_000;   // 60초 이내 활동 → healthy
const ZOMBIE_THRESHOLD_MS = 180_000;   // 180초 초과 무활동 → zombie

/**
 * 기기의 건강 상태를 계산합니다.
 *
 * @param device - 기기 정보
 * @returns 'healthy' | 'zombie' | 'offline'
 *
 * 로직:
 * - ADB 연결 끊김 → 'offline' (Gray)
 * - 활동 기록 없음 → 'offline' (Gray)
 * - 60초 이내 활동 → 'healthy' (Green)
 * - 60초~180초 사이 → 'healthy' (Green, 중간 상태는 healthy로 유지)
 * - 180초 초과 무활동 → 'zombie' (Red)
 */
export function computeHealthStatus(device: Device): HealthStatus {
  // 기기 상태가 offline이면 바로 반환
  if (device.status === 'offline') {
    return 'offline';
  }

  // ADB 연결이 명시적으로 false인 경우 오프라인 (undefined는 무시)
  if (device.adb_connected === false) {
    return 'offline';
  }

  // 마지막 활동 시간 계산 (heartbeat와 job activity 중 최신 값)
  const lastHeartbeat = device.last_heartbeat_at
    ? new Date(device.last_heartbeat_at).getTime()
    : 0;
  const lastJobActivity = device.last_job_activity_at
    ? new Date(device.last_job_activity_at).getTime()
    : 0;
  const lastActivity = Math.max(lastHeartbeat, lastJobActivity);

  // 활동 기록이 없으면 오프라인
  if (lastActivity === 0) {
    return 'offline';
  }

  const elapsedMs = Date.now() - lastActivity;

  // 60초 이내 활동 → healthy
  if (elapsedMs <= HEALTHY_THRESHOLD_MS) {
    return 'healthy';
  }
  
  // 180초 초과 무활동 → zombie
  if (elapsedMs > ZOMBIE_THRESHOLD_MS) {
    return 'zombie';
  }
  
  // 60초~180초 중간 상태 → healthy 유지 (경계 구간)
  return 'healthy';
}

/**
 * 건강 상태에 따른 UI 스타일을 반환합니다.
 */
export function getHealthIndicator(status: HealthStatus): {
  color: string;
  bgColor: string;
  animation: string;
  label: string;
} {
  switch (status) {
    case 'healthy':
      return {
        color: 'text-green-500',
        bgColor: 'bg-green-500',
        animation: 'animate-pulse',
        label: '정상'
      };
    case 'zombie':
      return {
        color: 'text-red-500',
        bgColor: 'bg-red-500',
        animation: 'animate-ping',
        label: '무응답'
      };
    case 'offline':
    default:
      return {
        color: 'text-gray-400',
        bgColor: 'bg-gray-400',
        animation: '',
        label: '오프라인'
      };
  }
}
