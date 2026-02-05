/**
 * WorkerServer - Socket.IO server for Worker connections
 * 
 * Following the Command & Control pattern:
 * - Accepts connections from Workers
 * - Handles evt:* events from Workers
 * - Sends cmd:* commands to Workers via registry
 */

import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import type {
  EvtWorkerRegister,
  EvtHeartbeat,
  EvtJobProgress,
  EvtJobComplete,
  EvtPong,
  ManagerToWorkerEvents,
  WorkerToManagerEvents,
} from '@doai/worker-types';
import type { WorkerRegistry } from './WorkerRegistry';
import type { TaskDispatcher } from './TaskDispatcher';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for WorkerServer
 */
export interface WorkerServerConfig {
  /** Port to listen on (default: 3001) */
  port: number;
  /** Host to bind to (default: '0.0.0.0') */
  host: string;
  /** Ping interval in milliseconds (default: 10000) */
  pingIntervalMs: number;
  /** Ping timeout in milliseconds (default: 5000) */
  pingTimeoutMs: number;
}

/**
 * Events emitted by WorkerServer
 */
export interface WorkerServerEvents {
  'server:started': (port: number) => void;
  'server:stopped': () => void;
  'server:error': (error: Error) => void;
  'connection:new': (socket: Socket) => void;
  'connection:closed': (socketId: string, reason: string) => void;
}

// Default configuration
const DEFAULT_CONFIG: WorkerServerConfig = {
  port: 3001,
  host: '0.0.0.0',
  pingIntervalMs: 10000,
  pingTimeoutMs: 5000,
};

// ============================================================================
// WorkerServer Class
// ============================================================================

export class WorkerServer extends EventEmitter {
  /** HTTP server instance */
  private httpServer: HttpServer | null = null;
  
  /** Socket.IO server instance */
  private io: SocketIOServer<WorkerToManagerEvents, ManagerToWorkerEvents> | null = null;
  
  /** Worker registry reference */
  private registry: WorkerRegistry;
  
  /** Task dispatcher reference */
  private dispatcher: TaskDispatcher;
  
  /** Configuration */
  private config: WorkerServerConfig;
  
  /** Map of socket ID to worker ID */
  private socketToWorker: Map<string, string> = new Map();
  
  /** Server running state */
  private running = false;

  constructor(
    registry: WorkerRegistry,
    dispatcher: TaskDispatcher,
    config: Partial<WorkerServerConfig> = {}
  ) {
    super();
    this.registry = registry;
    this.dispatcher = dispatcher;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[WorkerServer] Server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server
        this.httpServer = createServer();

        // Create Socket.IO server
        this.io = new SocketIOServer(this.httpServer, {
          cors: {
            origin: '*',
            methods: ['GET', 'POST'],
          },
          pingInterval: this.config.pingIntervalMs,
          pingTimeout: this.config.pingTimeoutMs,
          transports: ['websocket', 'polling'],
        });

        // Setup connection handler
        this.io.on('connection', (socket) => {
          this.handleConnection(socket);
        });

        // Start listening
        this.httpServer.listen(this.config.port, this.config.host, () => {
          this.running = true;
          logger.info('[WorkerServer] Server started', {
            port: this.config.port,
            host: this.config.host,
          });
          this.emit('server:started', this.config.port);
          resolve();
        });

        this.httpServer.on('error', (error) => {
          logger.error('[WorkerServer] Server error', { error: error.message });
          this.emit('server:error', error);
          reject(error);
        });
      } catch (error) {
        logger.error('[WorkerServer] Failed to start server', { error });
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info('[WorkerServer] Stopping server...');

    // Close all socket connections
    if (this.io) {
      this.io.disconnectSockets(true);
      this.io.close();
      this.io = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    this.socketToWorker.clear();
    this.running = false;

    logger.info('[WorkerServer] Server stopped');
    this.emit('server:stopped');
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the port the server is listening on
   */
  getPort(): number {
    return this.config.port;
  }

  // ==========================================================================
  // Connection Handling
  // ==========================================================================

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: Socket): void {
    logger.info('[WorkerServer] New connection', {
      socketId: socket.id,
      remoteAddress: socket.handshake.address,
    });

    this.emit('connection:new', socket);

    // Setup event handlers
    this.setupSocketEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });
  }

  /**
   * Setup event handlers for a socket
   */
  private setupSocketEventHandlers(socket: Socket): void {
    // Worker registration
    socket.on('evt:register', (data: EvtWorkerRegister) => {
      this.handleWorkerRegister(socket, data);
    });

    // Heartbeat
    socket.on('evt:heartbeat', (data: EvtHeartbeat) => {
      this.handleWorkerHeartbeat(socket, data);
    });

    // Job progress
    socket.on('evt:job_progress', (data: EvtJobProgress) => {
      this.handleJobProgress(socket, data);
    });

    // Job complete
    socket.on('evt:job_complete', (data: EvtJobComplete) => {
      this.handleJobComplete(socket, data);
    });

    // Pong (response to ping)
    socket.on('evt:pong', (data: EvtPong) => {
      this.handlePong(socket, data);
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: Socket, reason: string): void {
    const workerId = this.socketToWorker.get(socket.id);

    logger.info('[WorkerServer] Connection closed', {
      socketId: socket.id,
      workerId,
      reason,
    });

    if (workerId) {
      this.registry.unregisterWorker(workerId, reason);
      this.socketToWorker.delete(socket.id);
    }

    this.emit('connection:closed', socket.id, reason);
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle worker registration event
   */
  private handleWorkerRegister(socket: Socket, data: EvtWorkerRegister): void {
    logger.info('[WorkerServer] Worker registration request', {
      workerId: data.workerId,
      workerType: data.workerType,
      deviceCount: data.connectedDevices.length,
    });

    try {
      // Register with registry
      const worker = this.registry.registerWorker(data, socket);

      // Map socket to worker
      this.socketToWorker.set(socket.id, data.workerId);

      // Send acknowledgment
      socket.emit('cmd:register_ack' as keyof ManagerToWorkerEvents, {
        success: true,
        managerId: 'manager-1',
        serverTime: Date.now(),
      } as never);

      logger.info('[WorkerServer] Worker registered successfully', {
        workerId: worker.worker_id,
      });
    } catch (error) {
      logger.error('[WorkerServer] Worker registration failed', {
        workerId: data.workerId,
        error: error instanceof Error ? error.message : String(error),
      });

      socket.emit('cmd:register_ack' as keyof ManagerToWorkerEvents, {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      } as never);
    }
  }

  /**
   * Handle worker heartbeat event
   */
  private handleWorkerHeartbeat(socket: Socket, data: EvtHeartbeat): void {
    const workerId = this.socketToWorker.get(socket.id);

    if (!workerId || workerId !== data.workerId) {
      logger.warn('[WorkerServer] Heartbeat from unregistered worker', {
        socketId: socket.id,
        workerId: data.workerId,
      });
      return;
    }

    this.registry.updateHeartbeat(data);
  }

  /**
   * Handle job progress event
   */
  private handleJobProgress(socket: Socket, data: EvtJobProgress): void {
    const workerId = this.socketToWorker.get(socket.id);

    if (!workerId) {
      logger.warn('[WorkerServer] Job progress from unregistered worker', {
        socketId: socket.id,
        jobId: data.jobId,
      });
      return;
    }

    this.dispatcher.handleJobProgress(data, workerId);
  }

  /**
   * Handle job complete event
   */
  private handleJobComplete(socket: Socket, data: EvtJobComplete): void {
    const workerId = this.socketToWorker.get(socket.id);

    if (!workerId) {
      logger.warn('[WorkerServer] Job complete from unregistered worker', {
        socketId: socket.id,
        jobId: data.jobId,
      });
      return;
    }

    this.dispatcher.handleJobComplete(data, workerId);
  }

  /**
   * Handle pong event (response to ping)
   */
  private handlePong(socket: Socket, data: EvtPong): void {
    const workerId = this.socketToWorker.get(socket.id);
    const rtt = data.timestamp - data.pingTimestamp;

    logger.debug('[WorkerServer] Pong received', {
      workerId,
      rtt,
      correlationId: data.correlationId,
    });
  }

  // ==========================================================================
  // Commands
  // ==========================================================================

  /**
   * Send ping to all connected workers
   */
  pingAllWorkers(): void {
    const timestamp = Date.now();
    
    for (const [socketId] of this.socketToWorker) {
      const socket = this.io?.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('cmd:ping', { timestamp });
      }
    }
  }

  /**
   * Get number of connected workers
   */
  getConnectedWorkerCount(): number {
    return this.socketToWorker.size;
  }

  /**
   * Get all connected socket IDs
   */
  getConnectedSocketIds(): string[] {
    return Array.from(this.socketToWorker.keys());
  }
}

// Type augmentation for EventEmitter
export interface WorkerServer {
  on<E extends keyof WorkerServerEvents>(
    event: E,
    listener: WorkerServerEvents[E]
  ): this;
  
  off<E extends keyof WorkerServerEvents>(
    event: E,
    listener: WorkerServerEvents[E]
  ): this;
  
  emit<E extends keyof WorkerServerEvents>(
    event: E,
    ...args: Parameters<WorkerServerEvents[E]>
  ): boolean;
  
  once<E extends keyof WorkerServerEvents>(
    event: E,
    listener: WorkerServerEvents[E]
  ): this;
}

export default WorkerServer;
