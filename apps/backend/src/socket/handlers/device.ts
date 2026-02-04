/**
 * Device Socket.IO 이벤트 핸들러
 * 
 * 에이전트 → 서버 이벤트 처리:
 * - REGISTER: 노드 등록
 * - DEVICE_STATUS: 디바이스 상태 보고 (10초마다)
 * - PONG: 연결 응답
 */

import { Socket } from 'socket.io';
import type { StateManager } from '../types';

// ============================================
// 타입 정의
// ============================================

export interface RegisterEvent {
  node_id: string;
  version?: string;
  device_count?: number;
}

export interface DeviceStatusEvent {
  node_id: string;
  devices: DeviceStatus[];
  system?: {
    cpu?: number;
    memory?: number;
  };
}

export interface DeviceStatus {
  id: string;
  state: 'DISCONNECTED' | 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'QUARANTINE';
  battery?: number;
  screen_on?: boolean;
  current_workflow?: string;
  current_step?: string;
  progress?: number;
}

// ============================================
// 핸들러 등록
// ============================================

export function registerDeviceHandlers(
  socket: Socket,
  stateManager: StateManager,
  callbacks: {
    onRegister?: (nodeId: string, socket: Socket) => void;
    onDeviceStatus?: (data: DeviceStatusEvent) => void;
    onDisconnect?: (nodeId: string) => void;
  } = {}
): void {
  /**
   * 노드 등록
   */
  socket.on('REGISTER', async (data: RegisterEvent, ack?: (response: { success: boolean }) => void) => {
    const { node_id, version, device_count } = data;

    console.log(`[DeviceHandler] Node registering: ${node_id} (v${version || 'unknown'})`);

    // 소켓에 노드 ID 저장
    socket.data.nodeId = node_id;

    try {
      // Redis에 노드 상태 저장
      await stateManager.updateNodeState(node_id, {
        status: 'online',
        device_count: device_count || 0,
        last_seen: Date.now(),
      });

      // 콜백 호출
      callbacks.onRegister?.(node_id, socket);

      // 응답
      ack?.({ success: true });

      console.log(`[DeviceHandler] Node registered: ${node_id}`);
    } catch (error) {
      console.error('[DeviceHandler] Failed to register node:', error);
      ack?.({ success: false });
    }
  });

  /**
   * 디바이스 상태 보고 (10초마다)
   */
  socket.on('DEVICE_STATUS', async (data: DeviceStatusEvent) => {
    const { node_id, devices, system } = data;

    // console.log(`[DeviceHandler] Status from ${node_id}: ${devices.length} devices`);

    try {
      // 노드 상태 업데이트
      await stateManager.updateNodeState(node_id, {
        status: 'online',
        device_count: devices.length,
        active_jobs: devices.filter(d => d.state === 'RUNNING').length,
        cpu: system?.cpu,
        memory: system?.memory,
        last_seen: Date.now(),
      });

      // 각 디바이스 상태 업데이트
      for (const device of devices) {
        await stateManager.updateDeviceState(device.id, {
          state: device.state,
          node_id,
          workflow_id: device.current_workflow,
          current_step: device.current_step,
          progress: device.progress,
          last_heartbeat: Date.now(),
        });
      }

      // 콜백 호출
      callbacks.onDeviceStatus?.(data);
    } catch (error) {
      console.error('[DeviceHandler] Failed to update device status:', error);
    }
  });

  /**
   * Ping/Pong (연결 확인)
   */
  socket.on('PONG', () => {
    const nodeId = socket.data.nodeId;
    if (nodeId) {
      stateManager.updateNodeState(nodeId, {
        last_seen: Date.now(),
      }).catch(console.error);
    }
  });

  /**
   * 연결 해제
   */
  socket.on('disconnect', async (reason) => {
    const nodeId = socket.data.nodeId;

    if (nodeId) {
      console.log(`[DeviceHandler] Node disconnected: ${nodeId} (${reason})`);

      try {
        // 노드 상태를 offline으로 변경
        await stateManager.updateNodeState(nodeId, {
          status: 'offline',
          last_seen: Date.now(),
        });

        // 콜백 호출
        callbacks.onDisconnect?.(nodeId);
      } catch (error) {
        console.error('[DeviceHandler] Failed to update disconnect status:', error);
      }
    }
  });

  console.log(`[DeviceHandler] Registered handlers for socket: ${socket.id}`);
}

export default registerDeviceHandlers;
