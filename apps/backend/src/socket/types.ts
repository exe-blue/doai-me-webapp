/**
 * Socket 핸들러용 타입 정의
 */

import { StateManager } from '../state/StateManager';

// StateManager 타입 re-export
export type { StateManager };

// 공통 이벤트 타입은 @doai/shared에서 import
export type {
  DeviceState,
  NodeStatus,
  NodeState,
  DeviceStateData,
} from '@doai/shared';
