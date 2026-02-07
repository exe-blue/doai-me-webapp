// ============================================
// DoAi.Me 공유 패키지 - 메인 Export
// ============================================

// 타입 정의 (types.ts 가 기본)
export * from "./types";

// device.types.ts는 관리번호 체계 관련 타입만 export (중복 제외)
export {
  type PC,
  type PCStatus,
  type ConnectionType,
  type CreatePCRequest,
  type UpdatePCRequest,
  type CreateDeviceRequest,
  type UpdateDeviceRequest,
  type AssignDeviceRequest,
  type BulkRegisterDeviceRequest,
  type DeviceOverview,
  type PCSummary,
  parseManagementCode,
  formatManagementCode,
  isValidPCNumber,
  isValidDeviceNumber,
  isValidManagementCode,
  DEVICE_CONSTANTS,
} from "./device.types";
// NOTE: Device, DeviceStatus types are exported from types.ts to avoid conflicts

// API 스펙
export * from "./api";

// Socket.IO 이벤트
export * from "./socket";

// BullMQ Queue 타입
export * from "./queue";

// 에러 코드
export * from "./error-codes";

// 상수
export * from "./constants";

// 봇 카탈로그
export * from "./bot-catalog";

// 정규 이벤트 맵 (Canonical Event Map)
export * from "./events";

// 기존 호환성 유지 (deprecated — 새 코드는 events.ts 사용)
export * from "./socket-events";
