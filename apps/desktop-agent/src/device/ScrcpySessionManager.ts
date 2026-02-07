/**
 * ScrcpySessionManager — 멀티 디바이스 scrcpy 세션 관리
 *
 * 최대 100대 디바이스의 ScrcpySession을 동시에 관리.
 * - 세션 생성/삭제/조회
 * - 포트 풀 자동 할당
 * - 배치 제어 (batchTap, batchSwipe, batchText)
 * - 프레임 이벤트 집약 → 외부 구독자에게 전달
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { ScrcpySession, type ScrcpySessionOptions, type ScrcpySessionState } from './ScrcpySession';
import type { VideoMeta, FrameHeader } from './ScrcpyProtocol';

// ============================================
// Types
// ============================================

export interface SessionManagerConfig {
  /** scrcpy-server JAR 경로 */
  serverJarPath: string;
  /** ADB 바이너리 경로 */
  adbPath?: string;
  /** 포트 풀 시작 (default 27183) */
  portStart?: number;
  /** 포트 풀 끝 (default 27283) */
  portEnd?: number;
  /** 기본 최대 해상도 */
  defaultMaxSize?: number;
  /** 기본 최대 FPS */
  defaultMaxFps?: number;
  /** 기본 비트레이트 */
  defaultBitRate?: number;
  /** 동시 세션 상한 */
  maxSessions?: number;
  /** scrcpy server 버전 */
  serverVersion?: string;
}

export interface SessionInfo {
  deviceId: string;
  adbSerial: string;
  state: ScrcpySessionState;
  screenWidth: number;
  screenHeight: number;
  tunnelPort: number;
}

export interface SessionManagerEvents {
  /** 프레임 수신 (deviceId 포함) */
  frame: (deviceId: string, data: Buffer, header: FrameHeader) => void;
  /** 비디오 메타 수신 */
  videoMeta: (deviceId: string, meta: VideoMeta) => void;
  /** 세션 상태 변경 */
  sessionStateChanged: (deviceId: string, state: ScrcpySessionState) => void;
  /** 세션 에러 */
  sessionError: (deviceId: string, error: Error) => void;
}

const DEFAULT_PORT_START = 27183;
const DEFAULT_PORT_END = 27283;
const DEFAULT_MAX_SESSIONS = 100;

// ============================================
// ScrcpySessionManager
// ============================================

export class ScrcpySessionManager extends EventEmitter {
  private config: Required<SessionManagerConfig>;
  private sessions: Map<string, ScrcpySession> = new Map();
  private portPool: Set<number> = new Set();
  private usedPorts: Map<string, number> = new Map(); // deviceId → port

  constructor(config: SessionManagerConfig) {
    super();
    this.setMaxListeners(200); // 100 devices × 2 event types

    this.config = {
      serverJarPath: config.serverJarPath,
      adbPath: config.adbPath ?? 'adb',
      portStart: config.portStart ?? DEFAULT_PORT_START,
      portEnd: config.portEnd ?? DEFAULT_PORT_END,
      defaultMaxSize: config.defaultMaxSize ?? 720,
      defaultMaxFps: config.defaultMaxFps ?? 30,
      defaultBitRate: config.defaultBitRate ?? 2_000_000,
      maxSessions: config.maxSessions ?? DEFAULT_MAX_SESSIONS,
      serverVersion: config.serverVersion ?? '2.7',
    };

    // 포트 풀 초기화
    for (let p = this.config.portStart; p <= this.config.portEnd; p++) {
      this.portPool.add(p);
    }

    logger.info('[ScrcpySessionManager] Initialized', {
      portRange: `${this.config.portStart}-${this.config.portEnd}`,
      maxSessions: this.config.maxSessions,
    });
  }

  // ------------------------------------
  // Session Lifecycle
  // ------------------------------------

  /**
   * 새 세션 생성 및 시작
   */
  async startSession(
    deviceId: string,
    adbSerial: string,
    overrides?: Partial<ScrcpySessionOptions>
  ): Promise<ScrcpySession> {
    // 이미 존재하면 기존 반환
    if (this.sessions.has(deviceId)) {
      const existing = this.sessions.get(deviceId)!;
      if (existing.state === 'streaming' || existing.state === 'connected') {
        logger.debug('[ScrcpySessionManager] Session already active', { deviceId });
        return existing;
      }
      // 에러/stopped 상태면 정리 후 재생성
      await this.stopSession(deviceId);
    }

    // 세션 상한 체크
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error(`Maximum sessions reached (${this.config.maxSessions})`);
    }

    // 포트 할당
    const port = this.allocatePort();
    if (port === null) {
      throw new Error('No available ports in pool');
    }
    this.usedPorts.set(deviceId, port);

    // 세션 생성
    const session = new ScrcpySession(deviceId, adbSerial, {
      serverJarPath: this.config.serverJarPath,
      adbPath: this.config.adbPath,
      tunnelPort: port,
      maxSize: overrides?.maxSize ?? this.config.defaultMaxSize,
      maxFps: overrides?.maxFps ?? this.config.defaultMaxFps,
      videoBitRate: overrides?.videoBitRate ?? this.config.defaultBitRate,
      audio: overrides?.audio ?? false,
      serverVersion: overrides?.serverVersion ?? this.config.serverVersion,
    });

    // 이벤트 포워딩
    session.on('frame', (data: Buffer, header: FrameHeader) => {
      this.emit('frame', deviceId, data, header);
    });

    session.on('videoMeta', (meta: VideoMeta) => {
      this.emit('videoMeta', deviceId, meta);
    });

    session.on('stateChanged', (state: ScrcpySessionState) => {
      this.emit('sessionStateChanged', deviceId, state);
    });

    session.on('error', (err: Error) => {
      this.emit('sessionError', deviceId, err);
      logger.error('[ScrcpySessionManager] Session error', {
        deviceId,
        error: err.message,
      });
    });

    this.sessions.set(deviceId, session);

    // 시작
    try {
      await session.start();
      logger.info('[ScrcpySessionManager] Session started', {
        deviceId,
        adbSerial,
        port,
      });
      return session;
    } catch (err) {
      // 실패 시 정리
      this.sessions.delete(deviceId);
      this.releasePort(deviceId);
      throw err;
    }
  }

  /**
   * 세션 종료
   */
  async stopSession(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    try {
      await session.stop();
    } catch (err) {
      logger.warn('[ScrcpySessionManager] Error stopping session', {
        deviceId,
        error: (err as Error).message,
      });
    }

    session.removeAllListeners();
    this.sessions.delete(deviceId);
    this.releasePort(deviceId);

    logger.info('[ScrcpySessionManager] Session stopped', { deviceId });
  }

  /**
   * 전체 세션 종료
   */
  async stopAll(): Promise<void> {
    const deviceIds = [...this.sessions.keys()];
    await Promise.allSettled(deviceIds.map(id => this.stopSession(id)));
    logger.info('[ScrcpySessionManager] All sessions stopped');
  }

  // ------------------------------------
  // Session Access
  // ------------------------------------

  getSession(deviceId: string): ScrcpySession | undefined {
    return this.sessions.get(deviceId);
  }

  hasSession(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  getActiveSessions(): string[] {
    return [...this.sessions.entries()]
      .filter(([_, s]) => s.state === 'streaming' || s.state === 'connected')
      .map(([id]) => id);
  }

  getAllSessionInfo(): SessionInfo[] {
    return [...this.sessions.entries()].map(([id, s]) => ({
      deviceId: id,
      adbSerial: s.adbSerial,
      state: s.state,
      screenWidth: s.screenWidth,
      screenHeight: s.screenHeight,
      tunnelPort: this.usedPorts.get(id) ?? 0,
    }));
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  // ------------------------------------
  // Batch Control
  // ------------------------------------

  /**
   * 여러 디바이스에 동시 탭
   */
  async batchTap(
    deviceIds: string[],
    x: number,
    y: number
  ): Promise<Map<string, Error | null>> {
    return this.batchAction(deviceIds, async (session) => {
      await session.tap(x, y);
    });
  }

  /**
   * 여러 디바이스에 동시 스와이프
   */
  async batchSwipe(
    deviceIds: string[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs = 300
  ): Promise<Map<string, Error | null>> {
    return this.batchAction(deviceIds, async (session) => {
      await session.swipe(x1, y1, x2, y2, durationMs);
    });
  }

  /**
   * 여러 디바이스에 동시 텍스트 입력
   */
  async batchText(
    deviceIds: string[],
    text: string
  ): Promise<Map<string, Error | null>> {
    return this.batchAction(deviceIds, async (session) => {
      session.injectText(text);
    });
  }

  /**
   * 여러 디바이스에 동시 키 입력
   */
  async batchKey(
    deviceIds: string[],
    keycode: number,
    metaState = 0
  ): Promise<Map<string, Error | null>> {
    return this.batchAction(deviceIds, async (session) => {
      await session.injectKey(keycode, metaState);
    });
  }

  /**
   * 여러 디바이스에 동시 뒤로가기
   */
  async batchBack(deviceIds: string[]): Promise<Map<string, Error | null>> {
    return this.batchAction(deviceIds, async (session) => {
      session.pressBack();
    });
  }

  /**
   * 범용 배치 액션
   */
  private async batchAction(
    deviceIds: string[],
    action: (session: ScrcpySession) => Promise<void>
  ): Promise<Map<string, Error | null>> {
    const results = new Map<string, Error | null>();

    const promises = deviceIds.map(async (deviceId) => {
      const session = this.sessions.get(deviceId);
      if (!session) {
        results.set(deviceId, new Error('No active session'));
        return;
      }
      if (session.state !== 'streaming' && session.state !== 'connected') {
        results.set(deviceId, new Error(`Session not ready (state: ${session.state})`));
        return;
      }
      try {
        await action(session);
        results.set(deviceId, null);
      } catch (err) {
        results.set(deviceId, err as Error);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  // ------------------------------------
  // Port Management
  // ------------------------------------

  private allocatePort(): number | null {
    const it = this.portPool.values().next();
    if (it.done) return null;
    const port = it.value;
    this.portPool.delete(port);
    return port;
  }

  private releasePort(deviceId: string): void {
    const port = this.usedPorts.get(deviceId);
    if (port != null) {
      this.portPool.add(port);
      this.usedPorts.delete(deviceId);
    }
  }

  get availablePorts(): number {
    return this.portPool.size;
  }
}

// ============================================
// Singleton
// ============================================

let managerInstance: ScrcpySessionManager | null = null;

export function getScrcpySessionManager(config?: SessionManagerConfig): ScrcpySessionManager {
  if (!managerInstance) {
    if (!config) {
      throw new Error('ScrcpySessionManager not initialized — provide config on first call');
    }
    managerInstance = new ScrcpySessionManager(config);
  }
  return managerInstance;
}

export default ScrcpySessionManager;
