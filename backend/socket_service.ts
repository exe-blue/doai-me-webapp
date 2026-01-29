/**
 * Screen Mirroring WebSocket Service
 * 목표: 50ms 이하 레이턴시로 스마트폰 화면 프레임 전송
 * 
 * 최적화 전략:
 * 1. JSON 직렬화 제거 - 바이너리 프레임 직접 전송
 * 2. 불필요한 버퍼 복사 제거 - Zero-copy 처리
 * 3. 메타데이터는 고정 크기 바이너리 헤더로 전송
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import { EventEmitter } from 'events';

// =============================================
// 타입 정의
// =============================================

/** 프레임 헤더 구조 (고정 24바이트) */
interface FrameHeader {
  /** 프레임 타입: 0=키프레임, 1=델타프레임 */
  frameType: number;
  /** 타임스탬프 (ms) */
  timestamp: number;
  /** 프레임 시퀀스 번호 */
  sequenceNumber: number;
  /** 페이로드 크기 (bytes) */
  payloadSize: number;
  /** 화면 너비 */
  width: number;
  /** 화면 높이 */
  height: number;
}

/** 클라이언트 세션 정보 */
interface ClientSession {
  id: string;
  ws: WebSocket;
  deviceSerial: string;
  lastFrameTime: number;
  frameCount: number;
  totalLatency: number;
}

/** 레이턴시 측정 결과 */
interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p95: number;
  p99: number;
  samples: number;
}

// =============================================
// 상수 정의
// =============================================

const HEADER_SIZE = 24; // 바이트
const TARGET_LATENCY_MS = 50;
const LATENCY_SAMPLE_SIZE = 1000;

// =============================================
// 바이너리 헤더 파서 (Zero-copy 최적화)
// =============================================

/**
 * 바이너리 버퍼에서 프레임 헤더 파싱
 * DataView를 사용하여 버퍼 복사 없이 직접 읽기
 */
function parseFrameHeader(buffer: Buffer): FrameHeader {
  // 버퍼 크기 검증
  if (buffer.length < HEADER_SIZE) {
    throw new Error(`Invalid header size: ${buffer.length} < ${HEADER_SIZE}`);
  }

  // DataView로 직접 읽기 (Little Endian)
  const view = new DataView(buffer.buffer, buffer.byteOffset, HEADER_SIZE);
  
  return {
    frameType: view.getUint8(0),
    timestamp: view.getFloat64(1, true), // 8바이트
    sequenceNumber: view.getUint32(9, true), // 4바이트
    payloadSize: view.getUint32(13, true), // 4바이트
    width: view.getUint16(17, true), // 2바이트
    height: view.getUint16(19, true), // 2바이트
    // 21-23: 패딩 (4바이트 정렬용)
  };
}

/**
 * 프레임 헤더를 바이너리 버퍼로 직렬화
 * 버퍼를 미리 할당하여 재사용
 */
function serializeFrameHeader(header: FrameHeader, targetBuffer?: Buffer): Buffer {
  const buffer = targetBuffer ?? Buffer.allocUnsafe(HEADER_SIZE);
  const view = new DataView(buffer.buffer, buffer.byteOffset, HEADER_SIZE);
  
  view.setUint8(0, header.frameType);
  view.setFloat64(1, header.timestamp, true);
  view.setUint32(9, header.sequenceNumber, true);
  view.setUint32(13, header.payloadSize, true);
  view.setUint16(17, header.width, true);
  view.setUint16(19, header.height, true);
  // 21-23: 패딩 (0으로 초기화 불필요)
  
  return buffer;
}

// =============================================
// 레이턴시 측정기
// =============================================

class LatencyTracker {
  private samples: number[] = [];
  private maxSamples: number;

  constructor(maxSamples: number = LATENCY_SAMPLE_SIZE) {
    this.maxSamples = maxSamples;
  }

  record(latencyMs: number): void {
    this.samples.push(latencyMs);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getStats(): LatencyStats {
    if (this.samples.length === 0) {
      return { min: 0, max: 0, avg: 0, p95: 0, p99: 0, samples: 0 };
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p95: sorted[p95Index] || sorted[sorted.length - 1],
      p99: sorted[p99Index] || sorted[sorted.length - 1],
      samples: sorted.length,
    };
  }

  clear(): void {
    this.samples = [];
  }
}

// =============================================
// 메인 소켓 서비스 클래스
// =============================================

export class ScreenMirrorSocketService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private sessions: Map<string, ClientSession> = new Map();
  private latencyTracker: LatencyTracker;
  private headerBuffer: Buffer; // 재사용 버퍼

  constructor() {
    super();
    this.latencyTracker = new LatencyTracker(LATENCY_SAMPLE_SIZE);
    this.headerBuffer = Buffer.allocUnsafe(HEADER_SIZE);
  }

  /**
   * WebSocket 서버 시작
   */
  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = createServer();
        this.wss = new WebSocketServer({ 
          server: this.httpServer,
          // 성능 최적화 옵션
          perMessageDeflate: false, // 압축 비활성화 (레이턴시 감소)
          maxPayload: 16 * 1024 * 1024, // 16MB (4K 프레임 허용)
        });

        this.setupWebSocketHandlers();

        this.httpServer.listen(port, () => {
          console.log(`[SocketService] 서버 시작: ws://localhost:${port}`);
          resolve();
        });

        this.httpServer.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * WebSocket 이벤트 핸들러 설정
   */
  private setupWebSocketHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket, req) => {
      const sessionId = this.generateSessionId();
      const deviceSerial = req.url?.split('?device=')[1] || 'unknown';

      const session: ClientSession = {
        id: sessionId,
        ws,
        deviceSerial,
        lastFrameTime: Date.now(),
        frameCount: 0,
        totalLatency: 0,
      };

      this.sessions.set(sessionId, session);
      console.log(`[SocketService] 클라이언트 연결: ${sessionId} (${deviceSerial})`);

      // 바이너리 모드 설정
      ws.binaryType = 'nodebuffer';

      // 메시지 핸들러 (최적화된 바이너리 처리)
      ws.on('message', (data: RawData, isBinary: boolean) => {
        this.handleMessage(session, data, isBinary);
      });

      ws.on('close', () => {
        this.sessions.delete(sessionId);
        console.log(`[SocketService] 클라이언트 연결 해제: ${sessionId}`);
      });

      ws.on('error', (error) => {
        console.error(`[SocketService] 클라이언트 오류 (${sessionId}):`, error.message);
      });

      // Pong 타임스탬프로 RTT 측정
      ws.on('pong', (data: Buffer) => {
        const sentTime = data.readDoubleLE(0);
        const rtt = Date.now() - sentTime;
        this.latencyTracker.record(rtt / 2); // 단방향 레이턴시 추정
      });
    });
  }

  /**
   * 메시지 핸들러 - 바이너리 데이터 최적화 처리
   * 
   * 최적화 포인트:
   * 1. JSON 파싱 제거 - 바이너리 헤더만 사용
   * 2. Buffer.slice() 대신 subarray() 사용 (Zero-copy)
   * 3. 불필요한 검증 최소화
   */
  private handleMessage(session: ClientSession, data: RawData, isBinary: boolean): void {
    const receiveTime = Date.now();

    // 텍스트 메시지는 제어 명령용 (레이턴시 경로 아님)
    if (!isBinary) {
      this.handleControlMessage(session, data.toString());
      return;
    }

    // 바이너리 프레임 처리 (최적화 경로)
    const buffer = data as Buffer;
    
    // 최소 헤더 크기 검증만 수행
    if (buffer.length < HEADER_SIZE) {
      console.warn(`[SocketService] 프레임 크기 부족: ${buffer.length}`);
      return;
    }

    // 헤더 파싱 (Zero-copy)
    const header = parseFrameHeader(buffer);
    
    // 레이턴시 계산 (클라이언트 타임스탬프 기준)
    const latency = receiveTime - header.timestamp;
    this.latencyTracker.record(latency);
    session.frameCount++;
    session.totalLatency += latency;
    session.lastFrameTime = receiveTime;

    // 페이로드 추출 (Zero-copy - subarray 사용)
    const payload = buffer.subarray(HEADER_SIZE, HEADER_SIZE + header.payloadSize);

    // 프레임 이벤트 발행 (브로드캐스트용)
    this.emit('frame', {
      sessionId: session.id,
      deviceSerial: session.deviceSerial,
      header,
      payload,
      latency,
    });

    // 레이턴시 경고 (개발용)
    if (latency > TARGET_LATENCY_MS) {
      console.warn(`[SocketService] 레이턴시 초과: ${latency.toFixed(1)}ms > ${TARGET_LATENCY_MS}ms`);
    }
  }

  /**
   * 제어 메시지 핸들러 (JSON - 비빈도)
   */
  private handleControlMessage(session: ClientSession, message: string): void {
    try {
      const cmd = JSON.parse(message);
      
      switch (cmd.type) {
        case 'ping':
          session.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        case 'stats':
          session.ws.send(JSON.stringify({
            type: 'stats',
            latency: this.latencyTracker.getStats(),
            sessionFrames: session.frameCount,
            avgLatency: session.frameCount > 0 ? session.totalLatency / session.frameCount : 0,
          }));
          break;
        default:
          console.log(`[SocketService] 알 수 없는 명령: ${cmd.type}`);
      }
    } catch {
      console.warn(`[SocketService] 잘못된 제어 메시지: ${message.substring(0, 50)}`);
    }
  }

  /**
   * 프레임 브로드캐스트 (특정 디바이스의 뷰어들에게)
   * 
   * 최적화: 헤더+페이로드를 단일 버퍼로 전송
   */
  broadcastFrame(deviceSerial: string, header: FrameHeader, payload: Buffer): void {
    // 헤더 직렬화 (재사용 버퍼)
    serializeFrameHeader(header, this.headerBuffer);
    
    // 단일 버퍼로 결합 (필요시에만)
    const frameBuffer = Buffer.concat([this.headerBuffer, payload]);

    // 해당 디바이스를 보는 모든 클라이언트에게 전송
    for (const session of this.sessions.values()) {
      if (session.deviceSerial === deviceSerial && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(frameBuffer);
      }
    }
  }

  /**
   * 레이턴시 통계 조회
   */
  getLatencyStats(): LatencyStats {
    return this.latencyTracker.getStats();
  }

  /**
   * 서버 중지
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // 모든 연결 종료
      for (const session of this.sessions.values()) {
        session.ws.close();
      }
      this.sessions.clear();

      if (this.wss) {
        this.wss.close(() => {
          if (this.httpServer) {
            this.httpServer.close(() => {
              console.log('[SocketService] 서버 중지됨');
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// =============================================
// 기본 내보내기
// =============================================

export { FrameHeader, ClientSession, LatencyStats, HEADER_SIZE, TARGET_LATENCY_MS };
export { parseFrameHeader, serializeFrameHeader };
