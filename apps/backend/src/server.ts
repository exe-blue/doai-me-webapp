/**
 * Backend Server (TypeScript)
 * 
 * BullMQ WorkflowWorker + Socket.IO 통합 서버
 * 
 * 기존 socketio-server.js와 별도로 실행하거나,
 * 해당 서버에서 이 모듈을 import해서 사용할 수 있음
 */

import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import { StateManager } from './state/StateManager';
import { QueueManager } from './queue/QueueManager';
import { WorkflowWorker } from './queue/WorkflowWorker';
import { SocketServer } from './socket/index';

// 환경 변수 로드
dotenv.config({ path: '../../.env' });

// ============================================
// 환경 설정
// ============================================

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const PORT = parseInt(process.env.WORKFLOW_PORT || '3002', 10);
const HOST = process.env.HOST || (IS_PRODUCTION ? '0.0.0.0' : 'localhost');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const CORS_ORIGINS = IS_PRODUCTION
  ? ['https://doai.me', 'https://www.doai.me']
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:4000'];

// ============================================
// Express App
// ============================================

const app = express();

app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'workflow-server',
    env: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Ready check
app.get('/ready', (req, res) => {
  res.json({ status: 'ready' });
});

// ============================================
// 서버 초기화
// ============================================

const httpServer = http.createServer(app);

// State Manager (Redis)
const stateManager = new StateManager({ redisUrl: REDIS_URL });

// Queue Manager (BullMQ)
const queueManager = new QueueManager({ redisUrl: REDIS_URL });

// Workflow Worker
const workflowWorker = new WorkflowWorker({ redisUrl: REDIS_URL });

// Socket Server
const socketServer = new SocketServer(
  httpServer,
  stateManager,
  workflowWorker,
  { corsOrigin: CORS_ORIGINS }
);

// ============================================
// API 엔드포인트
// ============================================

/**
 * POST /api/workflow/enqueue
 * 워크플로우 Job 추가
 */
app.post('/api/workflow/enqueue', async (req, res) => {
  const { node_id, workflow_id, workflow, device_ids, params } = req.body;

  if (!node_id || !workflow_id || !device_ids?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const job = await queueManager.addWorkflowJob({
      node_id,
      workflow_id,
      workflow,
      device_ids,
      params: params || {},
    });

    res.json({
      success: true,
      job_id: job.id,
      message: `Workflow ${workflow_id} enqueued for ${device_ids.length} devices`,
    });
  } catch (error) {
    console.error('[API] Enqueue error:', (error as Error).message);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/workflow/:jobId/status
 * Job 상태 조회
 */
app.get('/api/workflow/:jobId/status', async (req, res) => {
  const { jobId } = req.params;

  try {
    const status = await queueManager.getJobStatus(jobId);
    res.json(status || { error: 'Job not found' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/nodes
 * 연결된 노드 목록
 */
app.get('/api/nodes', async (req, res) => {
  const connectedNodes = socketServer.getConnectedNodes();
  const nodeStates = await Promise.all(
    connectedNodes.map(async (nodeId) => ({
      node_id: nodeId,
      connected: true,
      ...(await stateManager.getNodeState(nodeId)),
    }))
  );
  res.json({ nodes: nodeStates });
});

/**
 * GET /api/devices
 * 전체 디바이스 상태
 */
app.get('/api/devices', async (req, res) => {
  const devices = await stateManager.getAllDeviceStates();
  res.json({ devices });
});

// ============================================
// 서버 시작
// ============================================

async function startServer(): Promise<void> {
  console.log('[Server] Starting Workflow Server...');

  // Redis 연결 확인
  try {
    await stateManager.ping();
    console.log('[Server] Redis connection OK');
  } catch (error) {
    console.error('[Server] Redis connection failed:', (error as Error).message);
    console.warn('[Server] Starting without Redis...');
  }

  // WorkflowWorker 이벤트 핸들러
  workflowWorker.on('node:registered', (nodeId: string) => {
    console.log(`[Server] Node registered: ${nodeId}`);
  });

  workflowWorker.on('workflow:complete', (result) => {
    console.log(`[Server] Workflow complete: ${result.job_id}`);
  });

  // HTTP 서버 시작
  httpServer.listen(PORT, HOST, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║        DoAi.Me Workflow Server (BullMQ + Socket.IO)           ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║  Environment: ${NODE_ENV.padEnd(47)}║`);
    console.log(`║  Host: ${HOST.padEnd(54)}║`);
    console.log(`║  Port: ${String(PORT).padEnd(54)}║`);
    console.log(`║  Redis: ${REDIS_URL.substring(0, 50).padEnd(53)}║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('[Server] Endpoints:');
    console.log(`  POST /api/workflow/enqueue - 워크플로우 Job 추가`);
    console.log(`  GET  /api/workflow/:jobId/status - Job 상태 조회`);
    console.log(`  GET  /api/nodes - 연결된 노드 목록`);
    console.log(`  GET  /api/devices - 디바이스 상태`);
    console.log(`  GET  /health - 헬스체크`);
    console.log('');
    console.log('[Server] Waiting for Agent connections...');
  });
}

// ============================================
// Graceful Shutdown
// ============================================

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

  try {
    // Socket 서버 종료
    await socketServer.close();

    // Queue Manager 종료
    await queueManager.close();

    // State Manager 종료
    await stateManager.disconnect();

    console.log('[Server] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Server] Shutdown error:', (error as Error).message);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

// 서버 시작
startServer();

export { app, httpServer, stateManager, queueManager, workflowWorker, socketServer };
