/**
 * Screen Mirroring Latency Test
 * 목표: 1000회 Mock 데이터 전송으로 레이턴시 < 50ms 검증
 */

import { WebSocket, WebSocketServer } from 'ws';
import { createServer } from 'http';

// =============================================
// 상수 정의
// =============================================

const HEADER_SIZE = 24;
const TEST_COUNT = 1000;
const TARGET_LATENCY_MS = 50;
const TEST_PORT = 9999;

// 테스트 프레임 설정 (실제 압축된 스크린 캡처 시뮬레이션)
// H.264/MJPEG 압축 시 1080p 프레임은 보통 20-100KB
const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const PAYLOAD_SIZE = 200 * 1024; // 200KB (4K 고품질 프레임 시뮬레이션)

// =============================================
// 바이너리 헤더 유틸리티
// =============================================

interface FrameHeader {
  frameType: number;
  timestamp: number;
  sequenceNumber: number;
  payloadSize: number;
  width: number;
  height: number;
}

function serializeFrameHeader(header: FrameHeader): Buffer {
  const buffer = Buffer.allocUnsafe(HEADER_SIZE);
  const view = new DataView(buffer.buffer, buffer.byteOffset, HEADER_SIZE);
  
  view.setUint8(0, header.frameType);
  view.setFloat64(1, header.timestamp, true);
  view.setUint32(9, header.sequenceNumber, true);
  view.setUint32(13, header.payloadSize, true);
  view.setUint16(17, header.width, true);
  view.setUint16(19, header.height, true);
  
  return buffer;
}

function parseFrameHeader(buffer: Buffer): FrameHeader {
  const view = new DataView(buffer.buffer, buffer.byteOffset, HEADER_SIZE);
  
  return {
    frameType: view.getUint8(0),
    timestamp: view.getFloat64(1, true),
    sequenceNumber: view.getUint32(9, true),
    payloadSize: view.getUint32(13, true),
    width: view.getUint16(17, true),
    height: view.getUint16(19, true),
  };
}

// =============================================
// 레이턴시 통계 계산
// =============================================

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p95: number;
  p99: number;
  samples: number;
}

function calculateStats(latencies: number[]): LatencyStats {
  if (latencies.length === 0) {
    return { min: 0, max: 0, avg: 0, p95: 0, p99: 0, samples: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
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

// =============================================
// 테스트 서버 (Echo 방식으로 RTT 측정)
// =============================================

class TestServer {
  private wss: WebSocketServer | null = null;
  private httpServer: ReturnType<typeof createServer> | null = null;

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer = createServer();
      this.wss = new WebSocketServer({
        server: this.httpServer,
        perMessageDeflate: false, // 압축 비활성화 (레이턴시 최적화)
        maxPayload: 16 * 1024 * 1024, // 16MB
      });

      this.wss.on('connection', (ws) => {
        ws.binaryType = 'nodebuffer';

        ws.on('message', (data: Buffer) => {
          // 수신 즉시 Echo (최소 처리로 순수 네트워크 레이턴시 측정)
          // 헤더의 timestamp를 서버 수신 시간으로 업데이트
          if (data.length >= HEADER_SIZE) {
            const view = new DataView(data.buffer, data.byteOffset, HEADER_SIZE);
            // 서버 수신 시간을 새로운 timestamp로 기록 (원본 유지하면서 처리 시간 측정)
            // 대신 바로 Echo하여 RTT 측정
            ws.send(data);
          }
        });
      });

      this.httpServer.listen(TEST_PORT, () => {
        console.log(`[Server] 테스트 서버 시작: ws://localhost:${TEST_PORT}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.httpServer) {
            this.httpServer.close(() => resolve());
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

// =============================================
// 테스트 클라이언트 (RTT 측정 방식)
// =============================================

class TestClient {
  private ws: WebSocket | null = null;
  private mockPayload: Buffer;
  private latencies: number[] = [];
  private pendingFrames: Map<number, number> = new Map(); // seqNum -> sendTime
  private receivedCount = 0;
  private onAllReceived: (() => void) | null = null;

  constructor() {
    // Mock 페이로드 생성 (한 번만)
    this.mockPayload = Buffer.alloc(PAYLOAD_SIZE);
    // 랜덤 데이터로 채움 (압축 효과 방지)
    for (let i = 0; i < PAYLOAD_SIZE; i++) {
      this.mockPayload[i] = Math.floor(Math.random() * 256);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      this.ws.binaryType = 'nodebuffer';

      this.ws.on('open', () => {
        console.log('[Client] 연결됨');
        resolve();
      });

      // Echo 응답 수신 핸들러
      this.ws.on('message', (data: Buffer) => {
        const receiveTime = Date.now();
        
        if (data.length >= HEADER_SIZE) {
          const header = parseFrameHeader(data);
          const sendTime = this.pendingFrames.get(header.sequenceNumber);
          
          if (sendTime !== undefined) {
            const rtt = receiveTime - sendTime;
            const oneWayLatency = rtt / 2; // 단방향 레이턴시 추정
            this.latencies.push(oneWayLatency);
            this.pendingFrames.delete(header.sequenceNumber);
            this.receivedCount++;

            if (this.receivedCount >= TEST_COUNT && this.onAllReceived) {
              this.onAllReceived();
            }
          }
        }
      });

      this.ws.on('error', reject);
    });
  }

  /**
   * 프레임 전송 및 레이턴시 측정
   * 백프레셔 관리: bufferedAmount 모니터링으로 버퍼 오버플로우 방지
   */
  async sendFrames(count: number): Promise<LatencyStats> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    console.log(`[Client] ${count}회 프레임 전송 시작 (페이로드: ${(PAYLOAD_SIZE / 1024).toFixed(0)}KB)`);

    // 헤더 버퍼 재사용
    const headerBuffer = Buffer.allocUnsafe(HEADER_SIZE);
    
    // 백프레셔 임계값 (1MB 이상이면 대기)
    const BACKPRESSURE_THRESHOLD = 1024 * 1024;

    for (let i = 0; i < count; i++) {
      // 백프레셔 관리: 버퍼가 너무 차면 드레인 대기
      while (this.ws.bufferedAmount > BACKPRESSURE_THRESHOLD) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      // hrtime 대신 performance.now() 또는 Date.now() 사용 (크로스플랫폼)
      const sendTime = Date.now();
      
      const header: FrameHeader = {
        frameType: i % 30 === 0 ? 0 : 1,
        timestamp: sendTime,
        sequenceNumber: i,
        payloadSize: PAYLOAD_SIZE,
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
      };

      // 헤더 직렬화 (버퍼 재사용)
      const view = new DataView(headerBuffer.buffer, headerBuffer.byteOffset, HEADER_SIZE);
      view.setUint8(0, header.frameType);
      view.setFloat64(1, header.timestamp, true);
      view.setUint32(9, header.sequenceNumber, true);
      view.setUint32(13, header.payloadSize, true);
      view.setUint16(17, header.width, true);
      view.setUint16(19, header.height, true);

      // 전송 시간 기록
      this.pendingFrames.set(i, sendTime);

      // 프레임 전송 (Buffer.concat 대신 직접 버퍼 생성으로 최적화)
      const frame = Buffer.allocUnsafe(HEADER_SIZE + PAYLOAD_SIZE);
      headerBuffer.copy(frame, 0);
      this.mockPayload.copy(frame, HEADER_SIZE);
      
      this.ws.send(frame);

      // 진행 상황 출력 (100개마다)
      if ((i + 1) % 100 === 0) {
        console.log(`[Client] 전송 진행: ${i + 1}/${count}, 버퍼: ${(this.ws.bufferedAmount / 1024).toFixed(0)}KB`);
      }
    }

    console.log('[Client] 전송 완료, Echo 응답 대기 중...');

    // 모든 응답 수신 대기
    return new Promise((resolve) => {
      this.onAllReceived = () => {
        resolve(calculateStats(this.latencies));
      };

      // 타임아웃 (30초)
      setTimeout(() => {
        console.warn(`[Client] 타임아웃 - 수신된 응답: ${this.receivedCount}/${count}`);
        resolve(calculateStats(this.latencies));
      }, 30000);
    });
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// =============================================
// 메인 테스트 실행
// =============================================

async function runLatencyTest(): Promise<void> {
  console.log('='.repeat(60));
  console.log('[Test] 스크린 미러링 레이턴시 벤치마크 (RTT/2 방식)');
  console.log('='.repeat(60));
  console.log(`[Test] 테스트 설정:`);
  console.log(`  - 전송 횟수: ${TEST_COUNT}`);
  console.log(`  - 프레임 크기: ${FRAME_WIDTH}x${FRAME_HEIGHT}`);
  console.log(`  - 페이로드 크기: ${(PAYLOAD_SIZE / 1024).toFixed(0)}KB`);
  console.log(`  - 목표 레이턴시: < ${TARGET_LATENCY_MS}ms (P95, 단방향)`);
  console.log('='.repeat(60));

  const server = new TestServer();
  const client = new TestClient();

  try {
    // 서버 시작
    await server.start();

    // 클라이언트 연결
    await client.connect();

    // 프레임 전송 및 RTT 측정
    const stats = await client.sendFrames(TEST_COUNT);

    // 결과 출력
    console.log('\n' + '='.repeat(60));
    console.log('[Result] 테스트 결과 (단방향 레이턴시 = RTT/2)');
    console.log('='.repeat(60));
    console.log(`  - 측정 횟수: ${stats.samples}`);
    console.log(`  - 최소 레이턴시: ${stats.min.toFixed(2)}ms`);
    console.log(`  - 평균 레이턴시: ${stats.avg.toFixed(2)}ms`);
    console.log(`  - P95 레이턴시: ${stats.p95.toFixed(2)}ms`);
    console.log(`  - P99 레이턴시: ${stats.p99.toFixed(2)}ms`);
    console.log(`  - 최대 레이턴시: ${stats.max.toFixed(2)}ms`);
    
    const passed = stats.p95 < TARGET_LATENCY_MS;
    console.log(`\n  - 목표 달성: ${passed ? '✅ 성공' : '❌ 실패'} (P95 ${passed ? '<' : '>='} ${TARGET_LATENCY_MS}ms)`);
    console.log('='.repeat(60));

    // 종료 코드 설정
    if (!passed) {
      process.exitCode = 1;
    }

  } catch (error) {
    console.error('[Test] 오류 발생:', error);
    process.exitCode = 1;
  } finally {
    client.close();
    await server.stop();
    console.log('[Test] 테스트 종료');
  }
}

// 실행
runLatencyTest();
