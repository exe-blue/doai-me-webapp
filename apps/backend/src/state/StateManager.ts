/**
 * State Manager (Backend)
 *
 * Redis 기반 상태 관리
 * - 노드 상태 (온라인/오프라인)
 * - 디바이스 상태 (idle/busy/error)
 * - 워크플로우 실행 상태
 */

import Redis from 'ioredis';
import { EventEmitter } from 'node:events';

// ============================================
// 타입 정의
// ============================================

export interface StateManagerConfig {
  redisUrl: string;
}

/**
 * 노드 상태 (snake_case - socket handler 호환)
 */
export interface NodeState {
  node_id: string;
  status: 'online' | 'offline';
  device_count: number;
  active_jobs?: number;
  cpu?: number;
  memory?: number;
  last_seen: number;
  connected_at?: number;
  meta?: Record<string, unknown>;
}

/**
 * 디바이스 상태 (snake_case - @doai/shared DeviceStateData 호환)
 */
export interface DeviceState {
  device_id: string;
  state: 'DISCONNECTED' | 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'QUARANTINE';
  node_id: string;
  workflow_id?: string;
  current_step?: string;
  progress?: number;
  error_message?: string;
  error_count?: number;
  last_heartbeat?: number;
  meta?: Record<string, unknown>;
}

export interface WorkflowExecutionState {
  execution_id: string;
  workflow_id: string;
  node_id: string;
  device_ids: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step?: string;
  started_at?: number;
  completed_at?: number;
  error?: string;
}

// ============================================
// Redis Key Prefixes
// ============================================

const KEYS = {
  NODE: (nodeId: string) => `state:node:${nodeId}`,
  DEVICE: (deviceId: string) => `state:device:${deviceId}`,
  NODE_DEVICES: (nodeId: string) => `state:node:${nodeId}:devices`,
  EXECUTION: (execId: string) => `state:execution:${execId}`,
  ALL_NODES: 'state:nodes',
  ALL_DEVICES: 'state:devices',
  HEARTBEAT_SORTED: 'state:heartbeat:sorted',
} as const;

// ============================================
// StateManager Class
// ============================================

export class StateManager extends EventEmitter {
  private redis: Redis;
  private subscriber: Redis;
  private isShuttingDown = false;
  private heartbeatChecker?: NodeJS.Timeout;

  // 노드 타임아웃 (60초 heartbeat 없으면 오프라인)
  private readonly NODE_TIMEOUT_MS = 60_000;

  constructor(config: StateManagerConfig) {
    super();

    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    this.subscriber = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    this.setupEventHandlers();
  }

  /**
   * 연결 초기화
   */
  async connect(): Promise<void> {
    await Promise.all([
      this.redis.connect(),
      this.subscriber.connect(),
    ]);

    // Pub/Sub 구독
    await this.subscriber.subscribe('channel:state');

    this.subscriber.on('message', (channel, message) => {
      if (channel === 'channel:state') {
        try {
          const event = JSON.parse(message);
          this.emit('state:change', event);
        } catch (err) {
          console.error('[StateManager] Failed to parse state event:', err);
        }
      }
    });

    // Heartbeat 체커 시작
    this.startHeartbeatChecker();

    console.log('[StateManager] Connected');
  }

  /**
   * Redis 연결 확인 (health check)
   */
  async ping(): Promise<void> {
    const result = await this.redis.ping();
    if (result !== 'PONG') {
      throw new Error(`Redis ping failed: ${result}`);
    }
  }

  /**
   * 이벤트 핸들러 설정
   */
  private setupEventHandlers(): void {
    this.redis.on('error', (err) => {
      console.error('[StateManager] Redis error:', err.message);
      this.emit('error', err);
    });

    this.redis.on('connect', () => {
      console.log('[StateManager] Redis connected');
    });
  }

  // ============================================
  // 노드 상태 관리
  // ============================================

  /**
   * 노드 등록 (초기 연결 시)
   */
  async registerNode(nodeId: string, deviceIds: string[] = []): Promise<void> {
    const now = Date.now();

    const state: NodeState = {
      node_id: nodeId,
      status: 'online',
      device_count: deviceIds.length,
      active_jobs: 0,
      last_seen: now,
      connected_at: now,
    };

    const pipeline = this.redis.pipeline();

    // 노드 상태 저장
    pipeline.hset(KEYS.NODE(nodeId), this.flattenForRedis(state));

    // 노드 목록에 추가
    pipeline.sadd(KEYS.ALL_NODES, nodeId);

    // Heartbeat 정렬 셋 업데이트
    pipeline.zadd(KEYS.HEARTBEAT_SORTED, now, nodeId);

    // 디바이스 등록
    for (const deviceId of deviceIds) {
      const deviceState: DeviceState = {
        device_id: deviceId,
        state: 'IDLE',
        node_id: nodeId,
        last_heartbeat: now,
      };
      pipeline.hset(KEYS.DEVICE(deviceId), this.flattenForRedis(deviceState));
      pipeline.sadd(KEYS.ALL_DEVICES, deviceId);
      pipeline.sadd(KEYS.NODE_DEVICES(nodeId), deviceId);
    }

    await pipeline.exec();

    // 상태 변경 알림
    await this.publishStateChange('node:registered', { node_id: nodeId, device_ids: deviceIds });

    console.log(`[StateManager] Node registered: ${nodeId} with ${deviceIds.length} devices`);
  }

  /**
   * 노드 상태 업데이트 (socket handler에서 호출)
   */
  async updateNodeState(nodeId: string, updates: Partial<NodeState>): Promise<void> {
    const pipeline = this.redis.pipeline();

    // 기존 노드가 없으면 자동 생성
    const exists = await this.redis.exists(KEYS.NODE(nodeId));
    if (!exists) {
      const now = Date.now();
      const initialState: NodeState = {
        node_id: nodeId,
        status: 'online',
        device_count: 0,
        last_seen: now,
        connected_at: now,
        ...updates,
      };
      pipeline.hset(KEYS.NODE(nodeId), this.flattenForRedis(initialState));
      pipeline.sadd(KEYS.ALL_NODES, nodeId);
    } else {
      pipeline.hset(KEYS.NODE(nodeId), this.flattenForRedis(updates));
    }

    // Heartbeat 정렬 셋 업데이트
    const lastSeen = updates.last_seen ?? Date.now();
    pipeline.zadd(KEYS.HEARTBEAT_SORTED, lastSeen, nodeId);

    await pipeline.exec();
  }

  /**
   * 노드 Heartbeat 업데이트
   */
  async updateHeartbeat(nodeId: string): Promise<void> {
    const now = Date.now();

    const pipeline = this.redis.pipeline();

    pipeline.hset(KEYS.NODE(nodeId), 'last_seen', now.toString(), 'status', 'online');
    pipeline.zadd(KEYS.HEARTBEAT_SORTED, now, nodeId);

    await pipeline.exec();
  }

  /**
   * 노드 연결 해제
   */
  async disconnectNode(nodeId: string): Promise<void> {
    const pipeline = this.redis.pipeline();

    pipeline.hset(KEYS.NODE(nodeId), 'status', 'offline');
    pipeline.zrem(KEYS.HEARTBEAT_SORTED, nodeId);

    // 해당 노드의 디바이스들 DISCONNECTED 처리
    const deviceIds = await this.redis.smembers(KEYS.NODE_DEVICES(nodeId));
    for (const deviceId of deviceIds) {
      pipeline.hset(KEYS.DEVICE(deviceId), 'state', 'DISCONNECTED');
    }

    await pipeline.exec();

    await this.publishStateChange('node:disconnected', { node_id: nodeId });

    console.log(`[StateManager] Node disconnected: ${nodeId}`);
  }

  /**
   * 노드 상태 조회
   */
  async getNodeState(nodeId: string): Promise<NodeState | null> {
    const data = await this.redis.hgetall(KEYS.NODE(nodeId));
    if (!data || Object.keys(data).length === 0) return null;

    return this.parseNodeState(data);
  }

  /**
   * 모든 온라인 노드 조회
   */
  async getOnlineNodes(): Promise<NodeState[]> {
    const nodeIds = await this.redis.smembers(KEYS.ALL_NODES);
    const nodes: NodeState[] = [];

    for (const nodeId of nodeIds) {
      const state = await this.getNodeState(nodeId);
      if (state && state.status === 'online') {
        nodes.push(state);
      }
    }

    return nodes;
  }

  // ============================================
  // 디바이스 상태 관리
  // ============================================

  /**
   * 디바이스 상태 업데이트
   */
  async updateDeviceState(
    deviceId: string,
    updates: Partial<DeviceState>
  ): Promise<void> {
    const exists = await this.redis.exists(KEYS.DEVICE(deviceId));

    if (!exists) {
      // 디바이스가 없으면 자동 생성
      const now = Date.now();
      const initialState: DeviceState = {
        device_id: deviceId,
        state: 'IDLE',
        node_id: updates.node_id ?? 'unknown',
        last_heartbeat: now,
        ...updates,
      };
      await this.redis.hset(KEYS.DEVICE(deviceId), this.flattenForRedis(initialState));
      await this.redis.sadd(KEYS.ALL_DEVICES, deviceId);
      if (updates.node_id) {
        await this.redis.sadd(KEYS.NODE_DEVICES(updates.node_id), deviceId);
      }
    } else {
      const updatedFields = this.flattenForRedis(updates);
      await this.redis.hset(KEYS.DEVICE(deviceId), updatedFields);
    }

    await this.publishStateChange('device:updated', { device_id: deviceId, updates });
  }

  /**
   * 디바이스 상태 조회
   */
  async getDeviceState(deviceId: string): Promise<DeviceState | null> {
    const data = await this.redis.hgetall(KEYS.DEVICE(deviceId));
    if (!data || Object.keys(data).length === 0) return null;

    return this.parseDeviceState(data);
  }

  /**
   * 전체 디바이스 상태 조회
   */
  async getAllDeviceStates(): Promise<DeviceState[]> {
    const deviceIds = await this.redis.smembers(KEYS.ALL_DEVICES);
    const devices: DeviceState[] = [];

    for (const deviceId of deviceIds) {
      const state = await this.getDeviceState(deviceId);
      if (state) {
        devices.push(state);
      }
    }

    return devices;
  }

  /**
   * 노드의 모든 디바이스 조회
   */
  async getNodeDevices(nodeId: string): Promise<DeviceState[]> {
    const deviceIds = await this.redis.smembers(KEYS.NODE_DEVICES(nodeId));
    const devices: DeviceState[] = [];

    for (const deviceId of deviceIds) {
      const state = await this.getDeviceState(deviceId);
      if (state) {
        devices.push(state);
      }
    }

    return devices;
  }

  /**
   * IDLE 상태 디바이스 조회
   */
  async getIdleDevices(nodeId?: string): Promise<DeviceState[]> {
    let deviceIds: string[];

    if (nodeId) {
      deviceIds = await this.redis.smembers(KEYS.NODE_DEVICES(nodeId));
    } else {
      deviceIds = await this.redis.smembers(KEYS.ALL_DEVICES);
    }

    const devices: DeviceState[] = [];

    for (const deviceId of deviceIds) {
      const state = await this.getDeviceState(deviceId);
      if (state && state.state === 'IDLE') {
        devices.push(state);
      }
    }

    return devices;
  }

  // ============================================
  // 워크플로우 실행 상태 관리
  // ============================================

  /**
   * 워크플로우 실행 상태 저장
   */
  async setExecutionState(state: WorkflowExecutionState): Promise<void> {
    await this.redis.hset(
      KEYS.EXECUTION(state.execution_id),
      this.flattenForRedis(state)
    );

    // 30분 후 자동 만료 (완료/실패된 실행)
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
      await this.redis.expire(KEYS.EXECUTION(state.execution_id), 30 * 60);
    }

    await this.publishStateChange('execution:updated', state);
  }

  /**
   * 워크플로우 실행 상태 조회
   */
  async getExecutionState(executionId: string): Promise<WorkflowExecutionState | null> {
    const data = await this.redis.hgetall(KEYS.EXECUTION(executionId));
    if (!data || Object.keys(data).length === 0) return null;

    return this.parseExecutionState(data);
  }

  // ============================================
  // Heartbeat 체커
  // ============================================

  /**
   * Heartbeat 체커 시작
   */
  private startHeartbeatChecker(): void {
    // 30초마다 체크
    this.heartbeatChecker = setInterval(async () => {
      await this.checkStaleNodes();
    }, 30_000);
  }

  /**
   * 오래된 노드 체크
   */
  private async checkStaleNodes(): Promise<void> {
    const threshold = Date.now() - this.NODE_TIMEOUT_MS;

    // 타임아웃된 노드 조회
    const staleNodes = await this.redis.zrangebyscore(
      KEYS.HEARTBEAT_SORTED,
      '-inf',
      threshold
    );

    for (const nodeId of staleNodes) {
      console.log(`[StateManager] Node ${nodeId} heartbeat timeout, marking offline`);
      await this.disconnectNode(nodeId);
    }
  }

  // ============================================
  // 유틸리티
  // ============================================

  /**
   * 상태 변경 이벤트 발행
   */
  private async publishStateChange(event: string, data: unknown): Promise<void> {
    await this.redis.publish('channel:state', JSON.stringify({ event, data, timestamp: Date.now() }));
  }

  /**
   * 객체를 Redis Hash용으로 평탄화
   */
  private flattenForRedis<T extends object>(obj: T): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;

      if (typeof value === 'object' && value !== null) {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = String(value);
      }
    }

    return result;
  }

  /**
   * Redis Hash에서 NodeState 파싱
   */
  private parseNodeState(data: Record<string, string>): NodeState {
    return {
      node_id: data.node_id,
      status: data.status as 'online' | 'offline',
      device_count: parseInt(data.device_count, 10) || 0,
      active_jobs: data.active_jobs ? parseInt(data.active_jobs, 10) : undefined,
      cpu: data.cpu ? parseFloat(data.cpu) : undefined,
      memory: data.memory ? parseFloat(data.memory) : undefined,
      last_seen: parseInt(data.last_seen, 10),
      connected_at: data.connected_at ? parseInt(data.connected_at, 10) : undefined,
      meta: data.meta ? JSON.parse(data.meta) : undefined,
    };
  }

  /**
   * Redis Hash에서 DeviceState 파싱
   */
  private parseDeviceState(data: Record<string, string>): DeviceState {
    return {
      device_id: data.device_id,
      state: data.state as DeviceState['state'],
      node_id: data.node_id,
      workflow_id: data.workflow_id || undefined,
      current_step: data.current_step || undefined,
      progress: data.progress ? parseInt(data.progress, 10) : undefined,
      error_message: data.error_message || undefined,
      error_count: data.error_count ? parseInt(data.error_count, 10) : undefined,
      last_heartbeat: data.last_heartbeat ? parseInt(data.last_heartbeat, 10) : undefined,
      meta: data.meta ? JSON.parse(data.meta) : undefined,
    };
  }

  /**
   * Redis Hash에서 ExecutionState 파싱
   */
  private parseExecutionState(data: Record<string, string>): WorkflowExecutionState {
    return {
      execution_id: data.execution_id,
      workflow_id: data.workflow_id,
      node_id: data.node_id,
      device_ids: JSON.parse(data.device_ids || '[]'),
      status: data.status as WorkflowExecutionState['status'],
      progress: parseInt(data.progress, 10) || 0,
      current_step: data.current_step || undefined,
      started_at: data.started_at ? parseInt(data.started_at, 10) : undefined,
      completed_at: data.completed_at ? parseInt(data.completed_at, 10) : undefined,
      error: data.error || undefined,
    };
  }

  /**
   * 종료
   */
  async close(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[StateManager] Shutting down...');

    if (this.heartbeatChecker) {
      clearInterval(this.heartbeatChecker);
    }

    await Promise.all([
      this.redis.quit(),
      this.subscriber.quit(),
    ]);

    console.log('[StateManager] Closed');
  }

  /**
   * 종료 (disconnect 별칭 - server.ts 호환)
   */
  async disconnect(): Promise<void> {
    return this.close();
  }
}

// ============================================
// Export
// ============================================

export default StateManager;
