/**
 * DoAi.Me Socket.io Server v2.0
 *
 * Real-time communication hub for:
 * - PC Workers (device control, heartbeat, streaming)
 * - Dashboard clients (monitoring, remote control)
 *
 * Security Features (v2.0):
 * - JWT Authentication (Supabase)
 * - Redis Adapter (horizontal scaling)
 * - Graceful Shutdown
 *
 * Namespaces:
 * - /worker: PC Worker connections (server token auth)
 * - /dashboard: Dashboard client connections (Supabase JWT auth)
 */

require('dotenv').config({ path: '../.env' });
const http = require('node:http');
const { Server } = require('socket.io');

// Redis Adapter (horizontal scaling)
let createAdapter;
let Redis;
try {
  createAdapter = require('@socket.io/redis-adapter').createAdapter;
  Redis = require('ioredis');
} catch (err) {
  console.warn('[Server] Redis adapter not installed. Running in standalone mode.');
  console.warn('[Server] To enable horizontal scaling: npm install @socket.io/redis-adapter ioredis');
}

// Authentication Middleware
const { dashboardAuthMiddleware, workerAuthMiddleware, isTokenValid } = require('./middleware/auth');

// Supabase Service for centralized DB operations
const supabaseService = require('./services/supabaseService');
const { supabase } = supabaseService;

// State Machine Service for device state management
const stateService = require('./services/stateService');
const { DeviceStates, StateTransitionTriggers } = stateService;

// Channel Checker Service (auto-monitoring)
const { startChannelChecker } = require('./services/channelChecker');

// C2 Protocol Handlers (새 프로토콜)
const { registerWorkerProtocolHandlers } = require('./handlers/protocolHandlers');

// =============================================
// Configuration
// =============================================

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const PORT = process.env.SOCKET_PORT || 3001;
const HOST = process.env.HOST || (IS_PRODUCTION ? '0.0.0.0' : 'localhost');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ENABLE_REDIS = process.env.ENABLE_REDIS === 'true' && Redis && createAdapter;

// Token expiration check interval (5 minutes)
const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000;

// =============================================
// CORS Configuration (Environment-based)
// =============================================

/**
 * 프로덕션 허용 Origin 목록 (Vercel Frontend)
 * @description 이 목록에 없는 origin은 차단됩니다.
 */
const PRODUCTION_ALLOWED_ORIGINS = [
  'https://doai.me',
  'https://www.doai.me',
];

/**
 * 개발 환경 허용 Origin 목록
 */
const DEVELOPMENT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:4000',
];

/**
 * CORS Origin 설정을 환경에 따라 반환합니다.
 * - Production: doai.me, www.doai.me만 허용 (Strict)
 * - Development: localhost 허용
 */
function getCorsOrigin() {
  // 환경변수로 명시된 경우 우선 (추가 도메인 허용)
  if (process.env.CORS_ORIGIN) {
    const envOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
    
    if (IS_PRODUCTION) {
      // 프로덕션: 기본 허용 목록 + 환경변수 추가 도메인
      return [...new Set([...PRODUCTION_ALLOWED_ORIGINS, ...envOrigins])];
    }
    
    return envOrigins;
  }

  // 환경변수 없으면 기본 허용 목록 사용
  return IS_PRODUCTION ? PRODUCTION_ALLOWED_ORIGINS : DEVELOPMENT_ALLOWED_ORIGINS;
}

/**
 * CORS 옵션을 환경에 따라 반환합니다.
 * @description Production에서는 화이트리스트 기반 검증을 수행합니다.
 */
function getCorsOptions() {
  const allowedOrigins = getCorsOrigin();

  console.log(`[CORS] Mode: ${IS_PRODUCTION ? 'PRODUCTION (Strict)' : 'DEVELOPMENT'}`);
  console.log(`[CORS] Allowed Origins: ${allowedOrigins.join(', ')}`);

  return {
    origin: (requestOrigin, callback) => {
      // 서버-서버 요청 (origin 없음) - 내부 health check 및 server-to-server 요청 허용
      // 브라우저에서 오는 요청은 항상 origin 헤더를 포함하므로, origin이 없는 요청은
      // 서버 간 통신(internal health checks, load balancer probes) 또는 직접 curl 요청입니다.
      // 이러한 요청은 프로덕션에서도 허용합니다.
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      // 화이트리스트 검증
      if (allowedOrigins.includes(requestOrigin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] ❌ Blocked request from unauthorized origin: ${requestOrigin}`);
        console.warn(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
        callback(new Error(`CORS policy: Origin ${requestOrigin} not allowed`), false);
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,  // 쿠키 및 인증 헤더 허용
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,  // Preflight 캐시: 24시간
  };
}

// =============================================
// Cookie Security Configuration
// =============================================

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,                    // HTTPS only in production
  sameSite: IS_PRODUCTION ? 'strict' : 'lax', // Strict in production
  maxAge: 7 * 24 * 60 * 60 * 1000,           // 7 days
  path: '/',
  domain: IS_PRODUCTION ? process.env.COOKIE_DOMAIN : undefined,
};

// =============================================
// State Management
// =============================================

// Connected workers: pcId -> { socketId, devices: Map<serial, deviceInfo> }
const connectedWorkers = new Map();

// Connected dashboard clients: socketId -> { subscribedDevices: Set, user: Object }
const connectedDashboards = new Map();

// Device states: deviceId -> { serial, pcId, status, lastHeartbeat, streamingTo: Set }
const deviceStates = new Map();

// Active streams: deviceId -> { workerSocketId, dashboardSocketIds: Set }
const activeStreams = new Map();

// Initialized devices: deviceId -> { initializedAt, resolution, density }
const initializedDevices = new Map();

// Device initialization config
const DEVICE_INIT_CONFIG = {
  resolution: '1080x1920',
  density: 420
};

// Shutdown flag
let isShuttingDown = false;

// =============================================
// HTTP Server & Socket.io Setup
// =============================================

/**
 * CORS 헤더를 응답에 추가합니다.
 * @param {http.IncomingMessage} req - HTTP 요청
 * @param {http.ServerResponse} res - HTTP 응답
 */
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = getCorsOrigin();

  // Origin 검증: 화이트리스트에 있거나 개발 환경이면 허용
  const isAllowed = origin && (allowedOrigins.includes(origin) || !IS_PRODUCTION);
  
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const httpServer = http.createServer((req, res) => {
  // CORS 헤더 설정
  setCorsHeaders(req, res);

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isShuttingDown ? 'shutting_down' : 'ok',
      env: NODE_ENV,
      workers: connectedWorkers.size,
      dashboards: connectedDashboards.size,
      devices: deviceStates.size,
      streams: activeStreams.size,
      redis: ENABLE_REDIS ? 'connected' : 'disabled',
      corsMode: IS_PRODUCTION ? 'strict' : 'development',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Ready check for load balancer
  if (req.url === '/ready') {
    if (isShuttingDown) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'shutting_down' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ready' }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const io = new Server(httpServer, {
  cors: getCorsOptions(),
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
  // Production: Cookie 설정
  cookie: IS_PRODUCTION ? {
    name: 'doai_io',
    httpOnly: COOKIE_OPTIONS.httpOnly,
    secure: COOKIE_OPTIONS.secure,
    sameSite: COOKIE_OPTIONS.sameSite,
    maxAge: COOKIE_OPTIONS.maxAge,
  } : false,
});

// =============================================
// Redis Adapter Setup (Horizontal Scaling)
// =============================================

async function setupRedisAdapter() {
  if (!ENABLE_REDIS) {
    console.log('[Redis] Adapter disabled. Running in standalone mode.');
    return;
  }

  try {
    console.log('[Redis] Connecting to:', REDIS_URL);

    const pubClient = new Redis(REDIS_URL, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    const subClient = pubClient.duplicate();

    // 연결 이벤트 핸들러
    pubClient.on('connect', () => console.log('[Redis] Pub client connected'));
    pubClient.on('error', (err) => console.error('[Redis] Pub client error:', err.message));
    subClient.on('connect', () => console.log('[Redis] Sub client connected'));
    subClient.on('error', (err) => console.error('[Redis] Sub client error:', err.message));

    // 연결 시도
    await Promise.all([pubClient.connect(), subClient.connect()]);

    // Adapter 설정
    io.adapter(createAdapter(pubClient, subClient));

    console.log('[Redis] Adapter successfully configured');

    // 저장 (graceful shutdown 시 사용)
    io.redisClients = { pubClient, subClient };
  } catch (err) {
    console.error('[Redis] Failed to connect:', err.message);
    console.log('[Redis] Falling back to standalone mode');
  }
}

// =============================================
// Worker Namespace (/worker)
// =============================================

const workerNs = io.of('/worker');

// Authentication middleware
workerNs.use(workerAuthMiddleware);

workerNs.on('connection', (socket) => {
  const { pcId } = socket.worker;

  console.log(`[Worker] Connected: ${pcId} (${socket.id})`);

  // Register worker
  connectedWorkers.set(pcId, {
    socketId: socket.id,
    socket,
    devices: new Map(),
    connectedAt: new Date()
  });

  // Send pending assignments to reconnecting worker
  sendPendingAssignmentsToWorker(socket, pcId);

  // =============================================
  // 새 C2 프로토콜 핸들러 등록 (evt:* 이벤트)
  // =============================================
  registerWorkerProtocolHandlers(socket, pcId, dashboardNs, connectedWorkers);

  // =============================================
  // 레거시 핸들러 (기존 호환성 유지)
  // =============================================

  // Heartbeat handler (레거시 - worker:heartbeat도 지원)
  socket.on('worker:heartbeat', async (data) => {
    const { devices } = data;
    const worker = connectedWorkers.get(pcId);

    if (!worker) return;

    // Track devices that need initialization
    const devicesToInit = [];

    // Update device states
    for (const device of devices || []) {
      const deviceId = device.deviceId;
      const serial = device.serial;

      if (deviceId) {
        // Check if device needs initialization
        const needsInit = !initializedDevices.has(deviceId) && device.status === 'idle';
        if (needsInit) {
          devicesToInit.push({ deviceId, serial });
        }

        // 상태 머신 업데이트 (새 프로토콜)
        stateService.updateDeviceState(
          deviceId,
          serial,
          StateTransitionTriggers.HEARTBEAT_RECEIVED,
          { metadata: { pcId, adbConnected: device.adbConnected !== false } }
        );

        deviceStates.set(deviceId, {
          serial,
          pcId,
          status: device.status || 'idle',
          adbConnected: device.adbConnected !== false,
          lastHeartbeat: new Date(),
          workerSocketId: socket.id,
          initialized: initializedDevices.has(deviceId)
        });

        // Broadcast to dashboards
        dashboardNs.emit('device:status:update', {
          device_id: deviceId,
          serial_number: serial,
          pc_id: deviceId,
          status: device.status || 'idle',
          health_status: 'healthy',
          last_seen_at: new Date().toISOString(),
          initialized: initializedDevices.has(deviceId)
        });
      }
    }

    // Send init commands for uninitialized devices
    for (const { deviceId, serial } of devicesToInit) {
      console.log(`[Server] Sending device:init to ${serial} (${deviceId})`);
      socket.emit('device:init', {
        deviceId,
        serial,
        config: DEVICE_INIT_CONFIG
      });
    }

    // UPSERT devices to Supabase (using SERVICE_ROLE_KEY)
    supabaseService.upsertDevicesBatch(devices, pcId).then(result => {
      if (result.upserted > 0) {
        console.log(`[Worker] Devices UPSERT: ${result.upserted} updated, ${result.skipped} skipped`);
      }
    }).catch(err => {
      console.error('[Worker] Supabase UPSERT error:', err.message);
    });

    // Mark offline devices
    const onlineSerials = (devices || [])
      .filter(d => d.status !== 'offline' && d.serial && d.serial !== 'Empty')
      .map(d => d.serial);
    supabaseService.markOfflineDevices(pcId, onlineSerials).catch(err => {
      console.error('[Worker] Mark offline error:', err.message);
    });

    // Send acknowledgment
    socket.emit('worker:heartbeat:ack', {
      received_at: new Date().toISOString(),
      pending_commands: 0
    });
  });

  // Command acknowledgment from worker
  socket.on('command:ack', (data) => {
    const { commandId, deviceId, status, error } = data;
    console.log(`[Worker] Command ack: ${commandId} - ${status}`);

    // Forward to dashboards watching this device
    dashboardNs.emit('command:result', {
      commandId,
      deviceId,
      success: status === 'completed',
      error
    });
  });

  // Device initialization complete
  socket.on('device:init:complete', (data) => {
    const { deviceId, serial, success, error } = data;

    if (success) {
      console.log(`[Server] Device initialized: ${serial} (${deviceId})`);
      initializedDevices.set(deviceId, {
        initializedAt: new Date(),
        resolution: DEVICE_INIT_CONFIG.resolution,
        density: DEVICE_INIT_CONFIG.density
      });

      // Update device state
      const state = deviceStates.get(deviceId);
      if (state) {
        state.initialized = true;
      }

      // Notify dashboards
      dashboardNs.emit('device:initialized', {
        deviceId,
        serial,
        config: DEVICE_INIT_CONFIG
      });
    } else {
      console.error(`[Server] Device init failed: ${serial} - ${error}`);
      dashboardNs.emit('device:init:failed', { deviceId, serial, error });
    }
  });

  // Stream frame from worker
  socket.on('stream:frame', (data) => {
    const { deviceId, timestamp, frame } = data;

    // Forward to dashboards subscribed to this device's stream
    const stream = activeStreams.get(deviceId);
    if (stream) {
      for (const dashboardSocketId of stream.dashboardSocketIds) {
        const dashboardSocket = dashboardNs.sockets.get(dashboardSocketId);
        if (dashboardSocket) {
          dashboardSocket.emit('stream:frame', { deviceId, timestamp, frame });
        }
      }
    }
  });

  // Job events from worker
  socket.on('job:started', (data) => {
    console.log(`[Worker] Job started: ${data.assignmentId}`);
    dashboardNs.emit('job:started', data);
  });

  // Optimized job:progress
  socket.on('job:progress', (data) => {
    const progressPayload = {
      jobId: data.jobId,
      assignmentId: data.assignmentId,
      deviceId: data.deviceId,
      deviceSerial: data.deviceSerial || data.deviceId,
      progressPercent: data.progressPct || Math.round((data.currentStep / (data.totalSteps || 12)) * 100),
      currentStep: data.currentStep || 0,
      totalSteps: data.totalSteps || 12,
      status: data.status || 'running',
      timestamp: Date.now(),
    };
    dashboardNs.emit('job:progress', progressPayload);
  });

  // Device log from worker - room-based broadcasting
  socket.on('device:log', (data) => {
    const { deviceId, level, message, timestamp } = data;
    const roomName = `logs:${deviceId}`;

    // Only broadcast to clients who joined this specific log room
    dashboardNs.to(roomName).emit('device:log', {
      deviceId,
      level: level || 'info',
      message,
      timestamp: timestamp || Date.now(),
    });
  });

  socket.on('job:completed', async (data) => {
    console.log(`[Worker] Job completed: ${data.assignmentId}`);
    dashboardNs.emit('job:completed', data);

    // Update assignment status in DB (using SERVICE_ROLE_KEY)
    await supabaseService.updateAssignmentStatus(data.assignmentId, 'completed', {
      progress_pct: 100,
      final_duration_sec: data.finalDurationSec
    });

    // Update job completed_count atomically using RPC or fallback
    // RPC 함수: increment_job_completed_count (원자적 업데이트)
    if (data.jobId) {
      try {
        // 원자적 업데이트: completed_count를 1 증가시키고 결과를 반환
        const { data: rpcResult, error } = await supabase
          .rpc('increment_job_completed_count', { job_id: data.jobId });
        
        if (error) {
          // RPC가 없는 경우 fallback: 2단계 업데이트 (race condition 가능성 있음)
          console.warn('[Worker] RPC not available, using fallback:', error.message);
          
          // 1단계: 현재 값 조회
          const { data: currentJob, error: fetchError } = await supabase
            .from('jobs')
            .select('completed_count, assigned_count')
            .eq('id', data.jobId)
            .single();
          
          if (fetchError || !currentJob) {
            console.error('[Worker] Failed to fetch job:', fetchError?.message);
          } else {
            // 2단계: completed_count 증가
            const newCompletedCount = (currentJob.completed_count || 0) + 1;
            const updateData = { completed_count: newCompletedCount };
            
            // Job 완료 여부 확인
            if (newCompletedCount >= (currentJob.assigned_count || 0)) {
              updateData.status = 'completed';
              console.log(`[Worker] Job ${data.jobId} fully completed!`);
            }
            
            await supabase
              .from('jobs')
              .update(updateData)
              .eq('id', data.jobId);
          }
        } else if (rpcResult && rpcResult.length > 0) {
          // RPC가 성공한 경우 (RETURNS TABLE이므로 배열 반환)
          const updatedJob = rpcResult[0];
          console.log(`[Worker] Job ${data.jobId} completed_count: ${updatedJob.completed_count}/${updatedJob.assigned_count}`);
          
          if (updatedJob.status === 'completed') {
            console.log(`[Worker] Job ${data.jobId} fully completed!`);
          }
        }
      } catch (err) {
        console.error('[Worker] Error updating job completed_count:', err.message);
      }
    }
  });

  socket.on('job:failed', (data) => {
    console.error(`[Worker] Job failed: ${data.assignmentId} - ${data.error}`);
    dashboardNs.emit('job:failed', data);

    // Update assignment status in DB
    supabaseService.updateAssignmentStatus(data.assignmentId, 'failed', {
      error_log: data.error
    });
  });

  // Worker requests next job for a device
  socket.on('job:request', async (data) => {
    const { deviceId, deviceSerial } = data;
    console.log(`[Worker] Job request from device: ${deviceSerial || deviceId}`);

    try {
      const job = await supabaseService.getNextPendingJob();

      if (!job) {
        socket.emit('job:request:response', {
          deviceId,
          hasJob: false,
          message: 'No pending jobs'
        });
        return;
      }

      const { data: assignment, error } = await supabase
        .from('job_assignments')
        .select('*')
        .eq('job_id', job.id)
        .eq('device_id', deviceId)
        .eq('status', 'pending')
        .single();

      if (error || !assignment) {
        const { data: newAssignment, error: createError } = await supabase
          .from('job_assignments')
          .insert({
            job_id: job.id,
            device_id: deviceId,
            device_serial: deviceSerial,
            status: 'pending',
            progress_pct: 0,
            assigned_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error('[Worker] Create assignment error:', createError.message);
          socket.emit('job:request:response', {
            deviceId,
            hasJob: false,
            error: 'Failed to create assignment'
          });
          return;
        }

        socket.emit('job:assign', {
          assignmentId: newAssignment.id,
          deviceId,
          deviceSerial,
          job: {
            id: job.id,
            title: job.title,
            target_url: job.target_url,
            duration_sec: job.duration_sec,
            duration_min_pct: job.duration_min_pct,
            duration_max_pct: job.duration_max_pct,
            prob_like: job.prob_like,
            prob_comment: job.prob_comment,
            prob_playlist: job.prob_playlist,
            script_type: job.script_type
          }
        });

        await supabase
          .from('jobs')
          .update({ assigned_count: job.assigned_count + 1 })
          .eq('id', job.id);

        socket.emit('job:request:response', {
          deviceId,
          hasJob: true,
          assignmentId: newAssignment.id,
          jobId: job.id
        });
      } else {
        socket.emit('job:assign', {
          assignmentId: assignment.id,
          deviceId,
          deviceSerial,
          job: {
            id: job.id,
            title: job.title,
            target_url: job.target_url,
            duration_sec: job.duration_sec,
            duration_min_pct: job.duration_min_pct,
            duration_max_pct: job.duration_max_pct,
            prob_like: job.prob_like,
            prob_comment: job.prob_comment,
            prob_playlist: job.prob_playlist,
            script_type: job.script_type
          }
        });

        socket.emit('job:request:response', {
          deviceId,
          hasJob: true,
          assignmentId: assignment.id,
          jobId: job.id
        });
      }
    } catch (err) {
      console.error('[Worker] Job request error:', err.message);
      socket.emit('job:request:response', {
        deviceId,
        hasJob: false,
        error: err.message
      });
    }
  });

  // Get comment from pool for a job
  socket.on('comment:request', async (data) => {
    const { jobId, deviceId } = data;
    console.log(`[Worker] Comment request for job: ${jobId}`);

    try {
      const comment = await supabaseService.getAndUseComment(jobId, deviceId);

      socket.emit('comment:response', {
        jobId,
        deviceId,
        hasComment: !!comment,
        comment: comment ? comment.content : null
      });
    } catch (err) {
      console.error('[Worker] Comment request error:', err.message);
      socket.emit('comment:response', {
        jobId,
        deviceId,
        hasComment: false,
        error: err.message
      });
    }
  });

  // Disconnect handler
  socket.on('disconnect', (reason) => {
    console.log(`[Worker] Disconnected: ${pcId} (${reason})`);

    // Mark devices as offline
    for (const [deviceId, state] of deviceStates.entries()) {
      if (state.pcId === pcId) {
        state.status = 'offline';
        dashboardNs.emit('device:status:update', {
          device_id: deviceId,
          status: 'offline',
          health_status: 'offline'
        });
      }
    }

    connectedWorkers.delete(pcId);
  });
});

// =============================================
// Dashboard Namespace (/dashboard)
// =============================================

const dashboardNs = io.of('/dashboard');

// Authentication middleware (Supabase JWT)
dashboardNs.use(dashboardAuthMiddleware);

dashboardNs.on('connection', (socket) => {
  const user = socket.user;
  console.log(`[Dashboard] Connected: ${user.email || user.id} (${socket.id})`);

  // Register dashboard client with user info
  connectedDashboards.set(socket.id, {
    subscribedDevices: new Set(),
    user: user,
    connectedAt: new Date()
  });

  // Send initial device list
  const initialDevices = [];
  for (const [deviceId, state] of deviceStates.entries()) {
    initialDevices.push({
      id: deviceId,
      serial_number: state.serial,
      pc_id: state.pcId,
      status: state.status,
      health_status: state.status === 'offline' ? 'offline' : 'healthy',
      last_seen_at: state.lastHeartbeat?.toISOString()
    });
  }
  socket.emit('devices:initial', initialDevices);

  // =============================================
  // Log Room Management
  // =============================================

  socket.on('join:log_room', (data) => {
    const { deviceId, jobId } = data;
    const roomName = deviceId ? `logs:${deviceId}` : `logs:job:${jobId}`;
    socket.join(roomName);
    console.log(`[Dashboard] ${socket.user.email || socket.id} joined log room: ${roomName}`);
    socket.emit('log_room:joined', { roomName, deviceId, jobId });
  });

  socket.on('leave:log_room', (data) => {
    const { deviceId, jobId } = data;
    const roomName = deviceId ? `logs:${deviceId}` : `logs:job:${jobId}`;
    socket.leave(roomName);
    console.log(`[Dashboard] ${socket.user.email || socket.id} left log room: ${roomName}`);
  });

  // Command from dashboard to device
  socket.on('command:send', (data) => {
    const { deviceId, command, params, commandId } = data;
    console.log(`[Dashboard] ${socket.user.email}: ${command} -> ${deviceId}`);

    const deviceState = deviceStates.get(deviceId);
    if (!deviceState) {
      socket.emit('command:error', { deviceId, error: 'Device not found' });
      return;
    }

    const worker = connectedWorkers.get(deviceState.pcId);
    if (!worker || !worker.socket) {
      socket.emit('command:error', { deviceId, error: 'Worker not connected' });
      return;
    }

    worker.socket.emit('device:command', {
      commandId: commandId || `cmd_${Date.now()}`,
      deviceId,
      command,
      params,
      requestedBy: socket.user.id
    });
  });

  // Broadcast command to multiple devices
  socket.on('command:broadcast', (data) => {
    const { deviceIds, command, params, commandId } = data;
    console.log(`[Dashboard] ${socket.user.email}: Broadcast ${command} -> ${deviceIds.length} devices`);

    for (const deviceId of deviceIds) {
      const deviceState = deviceStates.get(deviceId);
      if (!deviceState) continue;

      const worker = connectedWorkers.get(deviceState.pcId);
      if (!worker || !worker.socket) continue;

      worker.socket.emit('device:command', {
        commandId: `${commandId || 'bc'}_${deviceId}`,
        deviceId,
        command,
        params,
        requestedBy: socket.user.id
      });
    }
  });

  // Job distribution from dashboard
  socket.on('job:distribute', (data) => {
    const { assignments, job } = data;
    console.log(`[Dashboard] ${socket.user.email}: Job distribute ${job.id} - ${assignments.length} assignments`);

    const sentCount = sendJobAssignments(assignments, job);

    socket.emit('job:distribute:ack', {
      jobId: job.id,
      totalAssignments: assignments.length,
      sentCount,
      timestamp: new Date().toISOString()
    });

    broadcastJobStatusUpdate(job.id, 'active', {
      assigned: assignments.length,
      sent: sentCount,
      completed: 0,
      failed: 0
    });
  });

  // Job pause
  socket.on('job:pause', async (data) => {
    const { jobId } = data;
    console.log(`[Dashboard] ${socket.user.email}: Job pause ${jobId}`);
    workerNs.emit('job:paused', { jobId });
    broadcastJobStatusUpdate(jobId, 'paused', null);
  });

  // Job resume
  socket.on('job:resume', async (data) => {
    const { jobId, assignments, job } = data;
    console.log(`[Dashboard] ${socket.user.email}: Job resume ${jobId}`);
    workerNs.emit('job:resumed', { jobId });

    if (assignments && assignments.length > 0 && job) {
      const sentCount = sendJobAssignments(assignments, job);
      socket.emit('job:resume:ack', {
        jobId,
        sentCount,
        timestamp: new Date().toISOString()
      });
    }

    broadcastJobStatusUpdate(jobId, 'active', null);
  });

  // Job cancel
  socket.on('job:cancel', (data) => {
    const { jobId } = data;
    console.log(`[Dashboard] ${socket.user.email}: Job cancel ${jobId}`);
    workerNs.emit('job:cancelled', { jobId });
    broadcastJobStatusUpdate(jobId, 'cancelled', null);
  });

  // Start streaming
  socket.on('stream:start', (data) => {
    const { deviceId, fps = 2 } = data;
    console.log(`[Dashboard] ${socket.user.email}: Stream start ${deviceId}`);

    const deviceState = deviceStates.get(deviceId);
    if (!deviceState) {
      socket.emit('stream:error', { deviceId, error: 'Device not found' });
      return;
    }

    if (!activeStreams.has(deviceId)) {
      activeStreams.set(deviceId, {
        workerSocketId: deviceState.workerSocketId,
        dashboardSocketIds: new Set()
      });

      const worker = connectedWorkers.get(deviceState.pcId);
      if (worker && worker.socket) {
        worker.socket.emit('stream:start', { deviceId, fps });
      }
    }

    activeStreams.get(deviceId).dashboardSocketIds.add(socket.id);

    const dashboard = connectedDashboards.get(socket.id);
    if (dashboard) {
      dashboard.subscribedDevices.add(deviceId);
    }
  });

  // Stop streaming
  socket.on('stream:stop', (data) => {
    const { deviceId } = data;
    console.log(`[Dashboard] ${socket.user.email}: Stream stop ${deviceId}`);

    const stream = activeStreams.get(deviceId);
    if (stream) {
      stream.dashboardSocketIds.delete(socket.id);

      if (stream.dashboardSocketIds.size === 0) {
        const deviceState = deviceStates.get(deviceId);
        if (deviceState) {
          const worker = connectedWorkers.get(deviceState.pcId);
          if (worker && worker.socket) {
            worker.socket.emit('stream:stop', { deviceId });
          }
        }
        activeStreams.delete(deviceId);
      }
    }

    const dashboard = connectedDashboards.get(socket.id);
    if (dashboard) {
      dashboard.subscribedDevices.delete(deviceId);
    }
  });

  // Disconnect handler
  socket.on('disconnect', (reason) => {
    console.log(`[Dashboard] Disconnected: ${socket.user.email || socket.id} (${reason})`);

    const dashboard = connectedDashboards.get(socket.id);
    if (dashboard) {
      for (const deviceId of dashboard.subscribedDevices) {
        const stream = activeStreams.get(deviceId);
        if (stream) {
          stream.dashboardSocketIds.delete(socket.id);
          if (stream.dashboardSocketIds.size === 0) {
            const deviceState = deviceStates.get(deviceId);
            if (deviceState) {
              const worker = connectedWorkers.get(deviceState.pcId);
              if (worker && worker.socket) {
                worker.socket.emit('stream:stop', { deviceId });
              }
            }
            activeStreams.delete(deviceId);
          }
        }
      }
    }

    connectedDashboards.delete(socket.id);
  });
});

// =============================================
// Token Expiration Check (Periodic)
// =============================================

setInterval(() => {
  for (const [socketId, dashboard] of connectedDashboards.entries()) {
    const socket = dashboardNs.sockets.get(socketId);
    if (socket && !isTokenValid(socket)) {
      console.log(`[Auth] Token expired for ${dashboard.user?.email || socketId}, disconnecting`);
      socket.emit('auth:token_expired', { message: 'Your session has expired. Please re-authenticate.' });
      socket.disconnect(true);
    }
  }
}, TOKEN_CHECK_INTERVAL);

// =============================================
// Job Distribution Functions
// =============================================

function sendJobAssignment(assignment, job) {
  const deviceState = deviceStates.get(assignment.device_id);
  if (!deviceState) {
    console.warn(`[Job] Device not found: ${assignment.device_id}`);
    return false;
  }

  const worker = connectedWorkers.get(deviceState.pcId);
  if (!worker || !worker.socket) {
    console.warn(`[Job] Worker not connected for device: ${assignment.device_id}`);
    return false;
  }

  worker.socket.emit('job:assign', {
    assignmentId: assignment.id,
    deviceId: assignment.device_id,
    deviceSerial: assignment.device_serial || deviceState.serial,
    job: {
      id: job.id,
      title: job.title,
      target_url: job.target_url,
      duration_sec: job.duration_sec,
      duration_min_pct: job.duration_min_pct,
      duration_max_pct: job.duration_max_pct,
      prob_like: job.prob_like,
      prob_comment: job.prob_comment,
      prob_playlist: job.prob_playlist,
      script_type: job.script_type
    }
  });

  console.log(`[Job] Sent assignment ${assignment.id} to device ${deviceState.serial}`);
  return true;
}

function sendJobAssignments(assignments, job) {
  let sentCount = 0;
  for (const assignment of assignments) {
    if (sendJobAssignment(assignment, job)) {
      sentCount++;
    }
  }
  return sentCount;
}

function broadcastJobStatusUpdate(jobId, status, progress) {
  dashboardNs.emit('job:status:update', {
    jobId,
    status,
    progress,
    timestamp: new Date().toISOString()
  });
}

async function sendPendingAssignmentsToWorker(socket, pcId) {
  try {
    const { data: devices } = await supabase
      .from('devices')
      .select('id')
      .eq('pc_id', pcId);

    if (!devices || devices.length === 0) return;

    const deviceIds = devices.map(d => d.id);

    const { data: assignments } = await supabase
      .from('job_assignments')
      .select(`
        id,
        job_id,
        device_id,
        device_serial,
        status,
        jobs (
          id,
          title,
          target_url,
          duration_sec,
          duration_min_pct,
          duration_max_pct,
          prob_like,
          prob_comment,
          prob_playlist,
          script_type,
          status
        )
      `)
      .in('device_id', deviceIds)
      .eq('status', 'pending');

    if (!assignments || assignments.length === 0) return;

    for (const assignment of assignments) {
      if (assignment.jobs && assignment.jobs.status === 'active') {
        socket.emit('job:assign', {
          assignmentId: assignment.id,
          deviceId: assignment.device_id,
          deviceSerial: assignment.device_serial,
          job: assignment.jobs
        });
      }
    }

    console.log(`[Job] Sent ${assignments.length} pending assignments to worker ${pcId}`);
  } catch (error) {
    console.error('[Job] Failed to send pending assignments:', error.message);
  }
}

// =============================================
// Graceful Shutdown
// =============================================

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new connections (health check returns 503)
  console.log('[Server] Stopping new connections...');

  // 2. Notify all clients
  console.log('[Server] Notifying connected clients...');
  workerNs.emit('server:shutdown', {
    message: 'Server is shutting down',
    reconnectDelay: 5000
  });
  dashboardNs.emit('server:shutdown', {
    message: 'Server is shutting down',
    reconnectDelay: 5000
  });

  // 3. Wait for pending operations (max 10 seconds)
  console.log('[Server] Waiting for pending operations...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 4. Close Redis connections
  if (io.redisClients) {
    console.log('[Server] Closing Redis connections...');
    try {
      await Promise.all([
        io.redisClients.pubClient.quit(),
        io.redisClients.subClient.quit()
      ]);
      console.log('[Server] Redis connections closed');
    } catch (err) {
      console.error('[Server] Redis close error:', err.message);
    }
  }

  // 5. Close Socket.io
  console.log('[Server] Closing Socket.io...');
  await new Promise((resolve) => {
    io.close(() => {
      console.log('[Server] Socket.io closed');
      resolve();
    });
  });

  // 6. Close HTTP server
  console.log('[Server] Closing HTTP server...');
  await new Promise((resolve) => {
    httpServer.close(() => {
      console.log('[Server] HTTP server closed');
      resolve();
    });
  });

  console.log('[Server] Graceful shutdown complete');
  process.exit(0);
}

// Signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
});

// =============================================
// Start Server
// =============================================

async function startServer() {
  // Setup Redis adapter first
  await setupRedisAdapter();

  // Initialize state service (load states from DB, start heartbeat checker)
  await stateService.loadInitialStates();
  stateService.startHeartbeatChecker();

  // Log CORS configuration
  const corsOrigin = getCorsOrigin();
  console.log('[Server] CORS Configuration:');
  console.log(`  Environment: ${NODE_ENV}`);
  console.log(`  Allowed Origins: ${Array.isArray(corsOrigin) ? corsOrigin.join(', ') : corsOrigin}`);

  // Start HTTP server with HOST binding
  httpServer.listen(PORT, HOST, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║        DoAi.Me Socket.io Server v2.0 (Secure Edition)              ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Environment: ${NODE_ENV.toUpperCase().padEnd(52)}║`);
    console.log(`║  Host: ${HOST.padEnd(59)}║`);
    console.log(`║  Port: ${String(PORT).padEnd(59)}║`);
    console.log(`║  Worker NS: /worker (Token Auth)                                   ║`);
    console.log(`║  Dashboard NS: /dashboard (Supabase JWT Auth)                      ║`);
    console.log(`║  Redis Adapter: ${(ENABLE_REDIS ? 'Enabled' : 'Disabled').padEnd(50)}║`);
    console.log(`║  Cookie Secure: ${(IS_PRODUCTION ? 'Yes (HTTPS)' : 'No (HTTP)').padEnd(50)}║`);
    console.log(`║  Health Check: http://${HOST}:${PORT}/health`.padEnd(69) + '║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('[Server] Security Features:');
    console.log('  ✓ JWT Authentication (Supabase)');
    console.log('  ✓ Worker Token Verification');
    console.log('  ✓ Token Expiration Monitoring');
    console.log(`  ${ENABLE_REDIS ? '✓' : '○'} Redis Adapter (Horizontal Scaling)`);
    console.log('  ✓ Graceful Shutdown');
    if (IS_PRODUCTION) {
      console.log('  ✓ Secure Cookies (SameSite: strict)');
      console.log('  ✓ CORS Whitelist Enforcement');
    }
    console.log('');
    
    // 환경변수 검증 로그
    console.log('[Server] Environment Validation:');
    console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Loaded' : '✗ MISSING'}`);
    console.log(`  SUPABASE_JWT_SECRET: ${process.env.SUPABASE_JWT_SECRET ? '✓ Loaded' : '✗ MISSING'}`);
    console.log(`  WORKER_SECRET_TOKEN: ${process.env.WORKER_SECRET_TOKEN ? '✓ Loaded' : '○ Using default'}`);
    console.log('');
    
    // CORS 설정 요약
    console.log('[Server] CORS Policy:');
    console.log(`  Mode: ${IS_PRODUCTION ? 'STRICT (Production)' : 'Permissive (Development)'}`);
    console.log(`  Allowed Origins:`);
    const origins = getCorsOrigin();
    (Array.isArray(origins) ? origins : [origins]).forEach(o => {
      console.log(`    - ${o}`);
    });
    console.log(`  Credentials: true`);
    console.log(`  Transports: websocket, polling`);
    console.log('');
    console.log('[Server] Waiting for connections...');

    // Start Channel Checker
    startChannelChecker();
  });
}

startServer();

module.exports = { io, workerNs, dashboardNs };
