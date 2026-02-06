/**
 * Socket.IO 서버 설정
 * 
 * Backend의 메인 Socket.IO 설정
 * - 노드 연결 관리
 * - 이벤트 핸들러 등록
 * - WorkflowWorker 통합
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { StateManager } from '../state/StateManager';
import { WorkflowWorker } from '../queue/WorkflowWorker';
import { registerDeviceHandlers } from './handlers/device';
import { registerWorkflowHandlers } from './handlers/workflow';

// ============================================
// 타입 정의
// ============================================

export interface SocketServerConfig {
  corsOrigin: string | string[];
}

// ============================================
// SocketServer 클래스
// ============================================

export class SocketServer {
  private io: SocketIOServer;
  private stateManager: StateManager;
  private workflowWorker: WorkflowWorker;
  
  // 노드별 소켓 매핑
  private nodeSocketMap: Map<string, Socket> = new Map();

  constructor(
    httpServer: HTTPServer,
    stateManager: StateManager,
    workflowWorker: WorkflowWorker,
    config: SocketServerConfig
  ) {
    this.stateManager = stateManager;
    this.workflowWorker = workflowWorker;

    // Socket.IO 서버 생성
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingInterval: 10000,
      pingTimeout: 30000,
    });

    // WorkflowWorker에 Socket.IO 서버 연결
    this.workflowWorker.setSocketIO(this.io);

    // 연결 핸들러 설정
    this.setupConnectionHandler();

    console.log('[SocketServer] Initialized');
  }

  /**
   * 연결 핸들러 설정
   */
  private setupConnectionHandler(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[SocketServer] Client connected: ${socket.id}`);

      // 디바이스 핸들러 등록
      registerDeviceHandlers(socket, this.stateManager, {
        onRegister: (nodeId, sock) => {
          this.nodeSocketMap.set(nodeId, sock);
          
          // 해당 노드의 Worker 생성
          this.workflowWorker.createWorkerForNode(nodeId);
          
          console.log(`[SocketServer] Node ${nodeId} ready, total nodes: ${this.nodeSocketMap.size}`);
        },
        onDisconnect: (nodeId) => {
          this.nodeSocketMap.delete(nodeId);
          console.log(`[SocketServer] Node ${nodeId} removed, total nodes: ${this.nodeSocketMap.size}`);
        },
      });

      // 워크플로우 핸들러 등록 (노드 등록 후)
      socket.on('REGISTER', () => {
        // REGISTER 이벤트 후에 워크플로우 핸들러 등록
        setTimeout(() => {
          if (socket.data.nodeId) {
            registerWorkflowHandlers(socket, this.stateManager);
          }
        }, 100);
      });
    });
  }

  /**
   * 특정 노드에 이벤트 전송
   */
  emitToNode(nodeId: string, event: string, data: unknown): boolean {
    const socket = this.nodeSocketMap.get(nodeId);
    if (!socket?.connected) {
      console.warn(`[SocketServer] Node ${nodeId} not connected`);
      return false;
    }
    socket.emit(event, data);
    return true;
  }

  /**
   * 모든 노드에 이벤트 브로드캐스트
   */
  broadcast(event: string, data: unknown): void {
    this.io.emit(event, data);
  }

  /**
   * 연결된 노드 목록
   */
  getConnectedNodes(): string[] {
    return Array.from(this.nodeSocketMap.keys());
  }

  /**
   * 노드 연결 상태 확인
   */
  isNodeConnected(nodeId: string): boolean {
    const socket = this.nodeSocketMap.get(nodeId);
    return socket?.connected ?? false;
  }

  /**
   * Socket.IO 서버 인스턴스
   */
  getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * 서버 종료
   */
  async close(): Promise<void> {
    await this.workflowWorker.stop();
    
    return new Promise((resolve) => {
      this.io.close(() => {
        console.log('[SocketServer] Closed');
        resolve();
      });
    });
  }
}

export default SocketServer;
