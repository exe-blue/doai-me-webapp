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
import { createClient } from '@supabase/supabase-js';

import Redis from 'ioredis';
import { StateManager } from './state/StateManager';
import { QueueManager } from './queue/QueueManager';
import { WorkflowWorker } from './queue/WorkflowWorker';
import { SocketServer } from './socket/index';
import { MetricsCollector, AlertManager } from './monitor';
import { SupabaseSyncService } from './queue/SupabaseSync';
import { logger } from './utils/logger';

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
const CELERY_API_URL = process.env.CELERY_API_URL || 'http://localhost:8000';

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
const workflowWorker = new WorkflowWorker({ redisUrl: REDIS_URL, celeryApiUrl: CELERY_API_URL });

// Socket Server
const socketServer = new SocketServer(
  httpServer,
  stateManager,
  workflowWorker,
  { corsOrigin: CORS_ORIGINS }
);

// Supabase Sync Service
const supabaseSync = new SupabaseSyncService();
supabaseSync.attach(workflowWorker, queueManager);
supabaseSync.attachCeleryBridge(workflowWorker.getCeleryBridge());
workflowWorker.setSupabaseSync(supabaseSync);

// ============================================
// 모니터링 시스템 초기화
// ============================================

// Process logger for Redis events — delegates to structured logger
const processLogger = {
  error: (message: string, context?: Record<string, unknown>) => {
    logger.error(message, context);
  },
  info: (message: string, context?: Record<string, unknown>) => {
    logger.info(message, context);
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    logger.warn(message, context);
  },
};

// Redis 인스턴스 (메트릭 수집/알림용)
const monitorRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
monitorRedis.on('error', (err) => {
  processLogger.error('[Redis Monitor] Error:', { error: err.message });
});
monitorRedis.on('reconnecting', () => {
  processLogger.info('[Redis Monitor] Reconnecting...');
});

// Redis Subscriber (Pub/Sub용 별도 연결)
const subscriberRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
subscriberRedis.on('error', (err) => {
  processLogger.error('[Redis Subscriber] Error:', { error: err.message });
});
subscriberRedis.on('reconnecting', () => {
  processLogger.info('[Redis Subscriber] Reconnecting...');
});

// 메트릭 수집기 (1분마다 수집)
const metricsCollector = new MetricsCollector(monitorRedis);

// 알림 매니저 (환경변수에서 채널 자동 로드)
const alertManager = new AlertManager(monitorRedis);

// Redis Pub/Sub으로 메트릭 수신하여 알림 체크
// Wrap subscription in async IIFE with error handling
(async () => {
  try {
    await subscriberRedis.subscribe('channel:metrics');
    processLogger.info('[Monitor] Subscribed to channel:metrics');
  } catch (subscribeError) {
    processLogger.error('[Monitor] Failed to subscribe to channel:metrics:', { error: (subscribeError as Error).message });
    // Don't crash the process, but log the failure
  }
})();

subscriberRedis.on('message', async (channel, message) => {
  if (channel === 'channel:metrics') {
    try {
      const metrics = JSON.parse(message);
      // Validate that parsed payload has expected metrics structure
      if (!metrics || typeof metrics !== 'object') {
        processLogger.warn('[Monitor] Invalid metrics payload: not an object');
        return;
      }
      await alertManager.checkConditions(metrics);
    } catch (error) {
      if (error instanceof SyntaxError) {
        processLogger.error('[Monitor] Failed to parse metrics JSON:', { error: error.message });
      } else {
        processLogger.error('[Monitor] Failed to process metrics:', { error: (error as Error).message });
      }
    }
  }
});

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
    logger.error('[API] Enqueue error', { error: (error as Error).message });
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
// 모니터링 API 엔드포인트
// ============================================

/**
 * GET /api/metrics
 * 메트릭 히스토리 (쿼리: minutes - 최근 N분, 기본 60)
 */
app.get('/api/metrics', async (req, res) => {
  const minutes = parseInt(req.query.minutes as string, 10) || 60;

  try {
    const history = await metricsCollector.getHistory(minutes);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/metrics/current
 * 현재 메트릭 즉시 수집
 */
app.get('/api/metrics/current', async (req, res) => {
  try {
    const metrics = await metricsCollector.collect();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/metrics/prometheus
 * Prometheus 형식 메트릭
 */
app.get('/api/metrics/prometheus', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metricsCollector.exportPrometheus());
});

/**
 * GET /api/alerts
 * 활성 알림 목록
 */
app.get('/api/alerts', async (req, res) => {
  const alerts = await alertManager.getActiveAlerts();
  res.json({ alerts });
});

/**
 * GET /api/alerts/history
 * 알림 히스토리 (쿼리: from, to - Unix timestamp)
 */
app.get('/api/alerts/history', async (req, res) => {
  const from = parseInt(req.query.from as string, 10) || Date.now() - 86400000; // 기본 24시간
  const to = parseInt(req.query.to as string, 10) || Date.now();

  try {
    const history = await alertManager.getAlertHistory(from, to);
    res.json({ alerts: history });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/alerts/acknowledge
 * 알림 확인 처리 (suppress 해제)
 */
app.post('/api/alerts/acknowledge', async (req, res) => {
  const { level, message } = req.body;

  // Validate level is a non-empty string and one of the allowed values
  const allowedLevels = ['info', 'warning', 'error', 'critical'];
  if (!level || typeof level !== 'string' || !allowedLevels.includes(level)) {
    return res.status(400).json({ error: `level must be one of: ${allowedLevels.join(', ')}` });
  }

  // Validate message is a non-empty string
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message must be a non-empty string' });
  }

  const success = await alertManager.acknowledgeAlert(level, message.trim());
  res.json({ success });
});

/**
 * POST /api/alerts/send
 * 수동 알림 발송
 */
app.post('/api/alerts/send', async (req, res) => {
  const { level, message } = req.body;

  if (!level || !message) {
    return res.status(400).json({ error: 'level and message required' });
  }

  await alertManager.sendManual(level, message);
  res.json({ success: true });
});

// ============================================
// 콘텐츠 관리 API 엔드포인트
// ============================================

// Supabase Client - Require service role key for backend operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  logger.error('[Server] SUPABASE_URL is required but not set');
  process.exit(1);
}

if (!supabaseKey) {
  logger.error('[Server] SUPABASE_SERVICE_ROLE_KEY is required but not set. Backend cannot run with SUPABASE_ANON_KEY due to permission restrictions.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ========== Videos API ==========

/**
 * GET /api/videos
 * 영상 목록 조회
 */
app.get('/api/videos', async (req, res) => {
  const { status, priority, limit: limitStr = '50', offset: offsetStr = '0' } = req.query;

  // Validate and parse limit and offset
  const parsedLimit = parseInt(limitStr as string, 10);
  const parsedOffset = parseInt(offsetStr as string, 10);
  
  // Validate numeric values
  const limit = (Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 1000) ? parsedLimit : 50;
  const offset = (Number.isInteger(parsedOffset) && parsedOffset >= 0) ? parsedOffset : 0;

  try {
    let query = supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ videos: data || [], count });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/videos/active
 * 활성 영상 목록 (우선순위 순)
 */
app.get('/api/videos/active', async (req, res) => {
  const { limit = '100' } = req.query;

  try {
    const { data, error } = await supabase.rpc('get_active_videos', { p_limit: parseInt(limit as string, 10) });
    if (error) throw error;
    res.json({ videos: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/videos/:id
 * 영상 상세 조회
 */
app.get('/api/videos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: 'Video not found' });
  }
});

/**
 * POST /api/videos
 * 영상 추가
 */
app.post('/api/videos', async (req, res) => {
  const { id, title, channel_id, channel_name, thumbnail_url, video_duration_sec, target_views, watch_duration_sec, priority, prob_like, prob_comment, prob_subscribe, tags } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  try {
    const { data, error } = await supabase
      .from('videos')
      .upsert({
        id,
        title,
        channel_id,
        channel_name,
        thumbnail_url,
        video_duration_sec,
        target_views: target_views || 100,
        watch_duration_sec: watch_duration_sec || 60,
        priority: priority || 'normal',
        prob_like: prob_like || 0,
        prob_comment: prob_comment || 0,
        prob_subscribe: prob_subscribe || 0,
        tags: tags || [],
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PATCH /api/videos/:id
 * 영상 수정
 */
app.patch('/api/videos/:id', async (req, res) => {
  try {
    // Allowlist of updatable fields to prevent modification of protected columns
    const allowedFields = ['title', 'description', 'status', 'thumbnail_url', 'priority', 'target_views', 'watch_duration_sec', 'prob_like', 'prob_comment', 'prob_subscribe', 'tags'];
    const updates: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('videos')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/videos/:id
 * 영상 삭제
 */
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/videos/:id/increment
 * 영상 시청 완료 카운트 증가
 */
app.post('/api/videos/:id/increment', async (req, res) => {
  const { success = true } = req.body;

  try {
    const { error } = await supabase.rpc('increment_video_views', { 
      p_video_id: req.params.id,
      p_success: success 
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========== Channels API ==========

/**
 * GET /api/channels
 * 채널 목록 조회
 */
app.get('/api/channels', async (req, res) => {
  const { status, auto_collect, limit = '50', offset = '0' } = req.query;

  try {
    let query = supabase
      .from('channels')
      .select('*')
      .order('created_at', { ascending: false })
      .range(parseInt(offset as string, 10), parseInt(offset as string, 10) + parseInt(limit as string, 10) - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (auto_collect === 'true') {
      query = query.eq('auto_collect', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ channels: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/channels
 * 채널 추가
 */
app.post('/api/channels', async (req, res) => {
  const { id, name, handle, profile_url, subscriber_count, auto_collect, default_watch_duration_sec } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'Channel ID and name are required' });
  }

  try {
    const { data, error } = await supabase
      .from('channels')
      .upsert({ id, name, handle, profile_url, subscriber_count, auto_collect, default_watch_duration_sec })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PATCH /api/channels/:id
 * 채널 수정
 */
app.patch('/api/channels/:id', async (req, res) => {
  try {
    // Allowlist of updatable fields
    const allowedFields = ['name', 'handle', 'profile_url', 'subscriber_count', 'auto_collect', 'default_watch_duration_sec', 'status'];
    const updates: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('channels')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/channels/:id
 * 채널 삭제
 */
app.delete('/api/channels/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========== Keywords API ==========

/**
 * GET /api/keywords
 * 키워드 목록 조회
 */
app.get('/api/keywords', async (req, res) => {
  const { is_active, category, limit = '100', offset = '0' } = req.query;

  try {
    let query = supabase
      .from('keywords')
      .select('*')
      .order('created_at', { ascending: false })
      .range(parseInt(offset as string, 10), parseInt(offset as string, 10) + parseInt(limit as string, 10) - 1);

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }
    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ keywords: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/keywords/random
 * 랜덤 활성 키워드 조회
 */
app.get('/api/keywords/random', async (req, res) => {
  const { count = '5' } = req.query;

  try {
    const { data, error } = await supabase.rpc('get_random_keywords', { p_count: parseInt(count as string, 10) });
    if (error) throw error;
    res.json({ keywords: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/keywords
 * 키워드 추가
 */
app.post('/api/keywords', async (req, res) => {
  const { keyword, category, is_active = true, max_results, min_views, min_duration_sec, max_duration_sec, exclude_keywords } = req.body;

  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' });
  }

  try {
    const { data, error } = await supabase
      .from('keywords')
      .upsert({ keyword, category, is_active, max_results, min_views, min_duration_sec, max_duration_sec, exclude_keywords })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PATCH /api/keywords/:id
 * 키워드 수정
 */
app.patch('/api/keywords/:id', async (req, res) => {
  try {
    // Allowlist of updatable fields
    const allowedFields = ['keyword', 'category', 'is_active', 'max_results', 'min_views', 'min_duration_sec', 'max_duration_sec', 'exclude_keywords'];
    const updates: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('keywords')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/keywords/:id
 * 키워드 삭제
 */
app.delete('/api/keywords/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('keywords')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/keywords/:id/used
 * 키워드 사용 기록
 */
app.post('/api/keywords/:id/used', async (req, res) => {
  try {
    const { data: keyword } = await supabase.from('keywords').select('keyword').eq('id', req.params.id).single();
    if (keyword) {
      await supabase.rpc('mark_keyword_used', { p_keyword: keyword.keyword });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========== Schedules API ==========

/**
 * GET /api/schedules
 * 스케줄 목록 조회
 */
app.get('/api/schedules', async (req, res) => {
  const { is_active, schedule_type } = req.query;

  try {
    let query = supabase
      .from('schedules')
      .select('*')
      .order('created_at', { ascending: false });

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }
    if (schedule_type) {
      query = query.eq('schedule_type', schedule_type);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ schedules: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/schedules
 * 스케줄 추가
 */
app.post('/api/schedules', async (req, res) => {
  const { name, description, cron_expression, schedule_type, workflow_id, video_filter, batch_size, params, max_concurrent, is_active = true } = req.body;

  if (!name || !cron_expression || !schedule_type) {
    return res.status(400).json({ error: 'name, cron_expression, and schedule_type are required' });
  }

  try {
    const { data, error } = await supabase
      .from('schedules')
      .insert({ name, description, cron_expression, schedule_type, workflow_id, video_filter, batch_size, params, max_concurrent, is_active })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PATCH /api/schedules/:id
 * 스케줄 수정
 */
app.patch('/api/schedules/:id', async (req, res) => {
  try {
    // Allowlist of updatable fields
    const allowedFields = ['name', 'description', 'cron_expression', 'schedule_type', 'workflow_id', 'video_filter', 'batch_size', 'params', 'max_concurrent', 'is_active'];
    const updates: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('schedules')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/schedules/:id
 * 스케줄 삭제
 */
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========== Daily Stats API ==========

/**
 * GET /api/stats/daily
 * 일일 통계 조회
 */
app.get('/api/stats/daily', async (req, res) => {
  const { date, days = '7' } = req.query;

  try {
    if (date) {
      // 특정 날짜 조회
      const { data, error } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('date', date)
        .single();

      if (error) throw error;
      res.json(data);
    } else {
      // 최근 N일 조회
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days as string, 10));

      const { data, error } = await supabase
        .from('daily_stats')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (error) throw error;
      res.json({ stats: data || [] });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/stats/today
 * 오늘 통계 조회
 */
app.get('/api/stats/today', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('today_stats')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || { completed: 0, failed: 0, total: 0, success_rate: 0, watch_time_sec: 0, by_hour: {} });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/stats/overview
 * 콘텐츠 전체 현황 조회
 */
app.get('/api/stats/overview', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('content_overview')
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/stats/dashboard
 * 대시보드 요약 조회
 */
app.get('/api/stats/dashboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dashboard_summary')
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========== Video Executions API ==========

/**
 * GET /api/executions
 * 실행 기록 조회
 */
app.get('/api/executions', async (req, res) => {
  const { video_id, device_id, status, date, limit = '100', offset = '0' } = req.query;

  try {
    let query = supabase
      .from('video_executions')
      .select('*')
      .order('created_at', { ascending: false })
      .range(parseInt(offset as string, 10), parseInt(offset as string, 10) + parseInt(limit as string, 10) - 1);

    if (video_id) query = query.eq('video_id', video_id);
    if (device_id) query = query.eq('device_id', device_id);
    if (status) query = query.eq('status', status);
    if (date) query = query.eq('execution_date', date);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ executions: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/executions
 * 실행 기록 생성
 */
app.post('/api/executions', async (req, res) => {
  const { video_id, device_id, node_id, status = 'pending' } = req.body;

  if (!video_id || !device_id) {
    return res.status(400).json({ error: 'video_id and device_id are required' });
  }

  try {
    const { data, error } = await supabase
      .from('video_executions')
      .insert({ video_id, device_id, node_id, status })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PATCH /api/executions/:id
 * 실행 기록 업데이트
 */
app.patch('/api/executions/:id', async (req, res) => {
  try {
    // 허용된 필드만 업데이트 (allowlist)
    const ALLOWED_FIELDS = ['status', 'actual_watch_duration_sec', 'progress', 'last_viewed_at'] as const;
    const updateData: Record<string, unknown> = {};
    
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }
    
    // 허용된 필드가 없으면 요청 거부
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ 
        error: 'No valid fields to update. Allowed fields: ' + ALLOWED_FIELDS.join(', ') 
      });
      return;
    }

    const { data, error } = await supabase
      .from('video_executions')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // 완료/실패 시 daily_stats 업데이트
    if (updateData.status === 'completed' || updateData.status === 'failed') {
      const today = new Date().toISOString().split('T')[0];
      
      try {
        // Update daily stats
        const { error: statsError } = await supabase.rpc('update_daily_stats', {
          p_date: today,
          p_completed: updateData.status === 'completed' ? 1 : 0,
          p_failed: updateData.status === 'failed' ? 1 : 0,
          p_watch_time: (updateData.actual_watch_duration_sec as number) || 0,
          p_video_id: data.video_id,
        });

        if (statsError) {
          processLogger.error('[Stats] Failed to update daily stats:', { error: statsError.message, date: today });
        }

        // 영상 카운트 업데이트
        if (data.video_id) {
          const { error: viewsError } = await supabase.rpc('increment_video_views', {
            p_video_id: data.video_id,
            p_success: updateData.status === 'completed',
          });

          if (viewsError) {
            processLogger.error('[Stats] Failed to increment video views:', { error: viewsError.message, videoId: data.video_id });
          }
        }
      } catch (statsException) {
        // Log but don't fail the main update
        processLogger.error('[Stats] Exception during stats update:', { error: (statsException as Error).message });
      }
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========== PCs (노드 PC) API ==========

/**
 * GET /api/pcs
 * PC 목록 조회
 */
app.get('/api/pcs', async (req, res) => {
  const { status } = req.query;

  try {
    let query = supabase
      .from('pcs')
      .select('*')
      .order('pc_number', { ascending: true });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ pcs: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/pcs/summary
 * PC별 디바이스 현황 요약
 */
app.get('/api/pcs/summary', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pc_device_summary')
      .select('*');

    if (error) throw error;
    res.json({ summary: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/pcs/:id
 * PC 상세 조회
 */
app.get('/api/pcs/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pcs')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: 'PC not found' });
  }
});

/**
 * POST /api/pcs
 * PC 추가 (pc_number 자동 생성)
 */
app.post('/api/pcs', async (req, res) => {
  const { id, label, location, hostname, ip_address, max_devices = 20, metadata = {} } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'PC ID is required' });
  }

  try {
    // PC 번호 자동 생성
    const { data: pcNumberResult, error: pcNumberError } = await supabase.rpc('generate_pc_number');
    if (pcNumberError) throw pcNumberError;

    const { data, error } = await supabase
      .from('pcs')
      .insert({
        id,
        pc_number: pcNumberResult,
        label: label || pcNumberResult,
        location,
        hostname,
        ip_address,
        max_devices,
        device_capacity: max_devices,
        status: 'offline',
        metadata,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PATCH /api/pcs/:id
 * PC 수정
 */
app.patch('/api/pcs/:id', async (req, res) => {
  try {
    const allowedFields = ['label', 'location', 'hostname', 'ip_address', 'max_devices', 'status', 'metadata'];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('pcs')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/pcs/:id
 * PC 삭제
 */
app.delete('/api/pcs/:id', async (req, res) => {
  try {
    // 먼저 해당 PC에 연결된 디바이스 확인
    const { data: devices } = await supabase
      .from('devices')
      .select('id')
      .eq('pc_id', req.params.id);

    if (devices && devices.length > 0) {
      return res.status(400).json({ 
        error: `Cannot delete PC with assigned devices. ${devices.length} device(s) are currently assigned.` 
      });
    }

    const { error } = await supabase
      .from('pcs')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========== Devices (디바이스) 관리 API ==========

/**
 * GET /api/devices/by-code/:code
 * 관리번호로 디바이스 조회 (PC01-001)
 */
app.get('/api/devices/by-code/:code', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('get_device_by_management_code', {
      p_code: req.params.code.toUpperCase(),
    });

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/devices/by-serial/:serial
 * 시리얼 번호로 디바이스 조회
 */
app.get('/api/devices/by-serial/:serial', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devices')
      .select(`
        *,
        pcs:pc_id (
          id,
          pc_number,
          label
        )
      `)
      .or(`id.eq.${req.params.serial},serial_number.eq.${req.params.serial}`)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: 'Device not found' });
  }
});

/**
 * GET /api/devices/by-ip/:ip
 * IP 주소로 디바이스 조회
 */
app.get('/api/devices/by-ip/:ip', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devices')
      .select(`
        *,
        pcs:pc_id (
          id,
          pc_number,
          label
        )
      `)
      .eq('ip_address', req.params.ip)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: 'Device not found' });
  }
});

/**
 * GET /api/devices/unassigned
 * PC에 배정되지 않은 디바이스 목록
 */
app.get('/api/devices/unassigned', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .is('pc_id', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ devices: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/devices/register
 * 새 디바이스 등록 (device_number 자동 할당)
 */
app.post('/api/devices/register', async (req, res) => {
  const {
    serial_number,
    model,
    android_version,
    ip_address,
    pc_id,
    connection_type = 'usb',
    usb_port,
  } = req.body;

  if (!serial_number) {
    return res.status(400).json({ error: 'serial_number is required' });
  }

  try {
    // 디바이스 번호 자동 생성
    const { data: deviceNumber, error: numError } = await supabase.rpc('generate_device_number', {
      target_pc_id: pc_id || null,
    });
    if (numError) throw numError;

    const { data, error } = await supabase
      .from('devices')
      .upsert({
        id: serial_number,
        serial_number,
        model,
        android_version,
        ip_address,
        pc_id,
        device_number: deviceNumber,
        connection_type,
        usb_port,
        status: 'offline',
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/devices/bulk-register
 * 여러 디바이스 일괄 등록
 */
app.post('/api/devices/bulk-register', async (req, res) => {
  const { devices: deviceList, pc_id } = req.body;

  if (!Array.isArray(deviceList) || deviceList.length === 0) {
    return res.status(400).json({ error: 'devices array is required' });
  }

  try {
    const results = [];
    const errors = [];

    for (const device of deviceList) {
      try {
        // 디바이스 번호 자동 생성
        const { data: deviceNumber, error: numError } = await supabase.rpc('generate_device_number', {
          target_pc_id: pc_id || device.pc_id || null,
        });
        if (numError) throw numError;

        const { data, error } = await supabase
          .from('devices')
          .upsert({
            id: device.serial_number,
            serial_number: device.serial_number,
            model: device.model,
            android_version: device.android_version,
            ip_address: device.ip_address,
            pc_id: pc_id || device.pc_id,
            device_number: deviceNumber,
            connection_type: device.connection_type || 'usb',
            usb_port: device.usb_port,
            status: 'offline',
          })
          .select()
          .single();

        if (error) throw error;
        results.push(data);
      } catch (err) {
        errors.push({ serial_number: device.serial_number, error: (err as Error).message });
      }
    }

    res.json({
      success: errors.length === 0,
      registered: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/devices/:id/assign
 * 디바이스를 PC에 배정
 */
app.post('/api/devices/:id/assign', async (req, res) => {
  const { pc_id, usb_port } = req.body;

  if (!pc_id) {
    return res.status(400).json({ error: 'pc_id is required' });
  }

  try {
    // PC가 존재하는지 확인
    const { data: pc, error: pcError } = await supabase
      .from('pcs')
      .select('id, pc_number, max_devices')
      .eq('id', pc_id)
      .single();

    if (pcError || !pc) {
      return res.status(404).json({ error: 'PC not found' });
    }

    // 해당 PC에 이미 배정된 디바이스 수 확인
    const { count } = await supabase
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('pc_id', pc_id);

    if (count && count >= pc.max_devices) {
      return res.status(400).json({ 
        error: `PC ${pc.pc_number} has reached max device capacity (${pc.max_devices})` 
      });
    }

    // 새 디바이스 번호 생성
    const { data: deviceNumber, error: numError } = await supabase.rpc('generate_device_number', {
      target_pc_id: pc_id,
    });
    if (numError) throw numError;

    // 디바이스 업데이트
    const { data, error } = await supabase
      .from('devices')
      .update({
        pc_id,
        device_number: deviceNumber,
        usb_port: usb_port || null,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/devices/:id/unassign
 * 디바이스를 PC에서 해제
 */
app.post('/api/devices/:id/unassign', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devices')
      .update({
        pc_id: null,
        device_number: null,
        usb_port: null,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/devices/stats
 * 디바이스 통계
 */
app.get('/api/devices/stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devices')
      .select('status, pc_id');

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      assigned: data?.filter(d => d.pc_id).length || 0,
      unassigned: data?.filter(d => !d.pc_id).length || 0,
      by_status: {
        online: data?.filter(d => d.status === 'online').length || 0,
        offline: data?.filter(d => d.status === 'offline').length || 0,
        busy: data?.filter(d => d.status === 'busy').length || 0,
        error: data?.filter(d => d.status === 'error').length || 0,
      },
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================
// 서버 시작
// ============================================

async function startServer(): Promise<void> {
  logger.info('[Server] Starting Workflow Server...');

  // Redis 연결 확인 - fail fast if Redis is unavailable
  try {
    await stateManager.ping();
    logger.info('[Server] Redis connection OK');
  } catch (error) {
    logger.error('[Server] Redis connection failed', { error: (error as Error).message });
    logger.error('[Server] Redis is required for stateManager, queueManager, and workflowWorker.');
    logger.error('[Server] Cannot start server without Redis. Exiting...');
    process.exit(1);
  }

  // WorkflowWorker 이벤트 핸들러
  workflowWorker.on('node:registered', (nodeId: string) => {
    logger.info(`[Server] Node registered: ${nodeId}`);
  });

  workflowWorker.on('workflow:complete', (result) => {
    logger.info(`[Server] Workflow complete: ${result.job_id}`);
  });

  // 모니터링 시스템 시작
  metricsCollector.start();
  alertManager.start();

  // 알림 이벤트 핸들러
  alertManager.on('alert:fired', ({ level, message }) => {
    logger.warn(`[Alert] ${level.toUpperCase()}: ${message}`);
  });

  // HTTP 서버 시작
  httpServer.listen(PORT, HOST, () => {
    logger.info('[Server] DoAi.Me Workflow Server (BullMQ + Socket.IO) started', {
      environment: NODE_ENV,
      host: HOST,
      port: PORT,
      redis: REDIS_URL.substring(0, 50),
    });
    logger.info('[Server] Endpoints: POST /api/workflow/enqueue, GET /api/workflow/:jobId/status, GET /api/nodes, GET /api/devices, GET /api/metrics, GET /api/alerts, GET /health');
    logger.info('[Server] Monitoring: Metrics (1min) + Alerts enabled');
    logger.info('[Server] Waiting for Agent connections...');
  });
}

// ============================================
// Graceful Shutdown
// ============================================

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[Server] Received ${signal}. Starting graceful shutdown...`);

  try {
    // 모니터링 시스템 종료
    alertManager.stop();
    metricsCollector.stop();
    await subscriberRedis.quit();
    await monitorRedis.quit();

    // Socket 서버 종료
    await socketServer.close();

    // Queue Manager 종료
    await queueManager.close();

    // State Manager 종료
    await stateManager.disconnect();

    logger.info('[Server] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('[Server] Shutdown error', { error: (error as Error).message });
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.error('[Server] Uncaught exception', { error: error.message || String(error) });
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Server] Unhandled rejection', { error: reason instanceof Error ? reason.message : String(reason) });
});

// 서버 시작
startServer();

export {
  app,
  httpServer,
  stateManager,
  queueManager,
  workflowWorker,
  socketServer,
  metricsCollector,
  alertManager,
};
