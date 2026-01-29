/**
 * DoAi.Me Socket.io Server v1.0
 *
 * Real-time communication hub for:
 * - PC Workers (device control, heartbeat, streaming)
 * - Dashboard clients (monitoring, remote control)
 *
 * Namespaces:
 * - /worker: PC Worker connections
 * - /dashboard: Dashboard client connections
 */

require('dotenv').config({ path: '../.env' });
const http = require('http');
const { Server } = require('socket.io');

// Supabase Service for centralized DB operations
const supabaseService = require('./services/supabaseService');
const { supabase } = supabaseService;

// Channel Checker Service (auto-monitoring)
const { startChannelChecker } = require('./services/channelChecker');

// =============================================
// Configuration
// =============================================

const PORT = process.env.SOCKET_PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// =============================================
// State Management
// =============================================

// Connected workers: pcId -> { socketId, devices: Map<serial, deviceInfo> }
const connectedWorkers = new Map();

// Connected dashboard clients: socketId -> { subscribedDevices: Set }
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

// =============================================
// HTTP Server & Socket.io Setup
// =============================================

const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      workers: connectedWorkers.size,
      dashboards: connectedDashboards.size,
      devices: deviceStates.size,
      streams: activeStreams.size,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000
});

// =============================================
// Worker Namespace (/worker)
// =============================================

const workerNs = io.of('/worker');

workerNs.on('connection', (socket) => {
  const { pcId, token } = socket.handshake.auth;

  if (!pcId) {
    console.log('[Worker] Connection rejected: missing pcId');
    socket.disconnect();
    return;
  }

  // STRICT: Reject workers with invalid pcId format (must be P{num}-WORKER or P{num})
  // This blocks ghost workers like "PC-01", "device", "List" etc.
  const validWorkerPattern = /^P\d{1,2}(-WORKER)?$/;
  if (!validWorkerPattern.test(pcId)) {
    console.log(`[Worker] Connection rejected: invalid pcId format "${pcId}" (expected P01, P01-WORKER, etc.)`);
    socket.disconnect();
    return;
  }

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

  // Heartbeat handler
  socket.on('worker:heartbeat', async (data) => {
    const { devices, timestamp } = data;
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
        // Note: pc_id should be the full device slotId (P01-001), not just pcId (P01)
        dashboardNs.emit('device:status:update', {
          device_id: deviceId,
          serial_number: serial,
          pc_id: deviceId, // Full device identifier (P01-001 format)
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

    // UPSERT devices to Supabase (new implementation)
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
      pending_commands: 0 // TODO: Count pending commands
    });
  });

  // Command acknowledgment from worker
  socket.on('command:ack', (data) => {
    const { commandId, deviceId, status, error, result } = data;
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

  // Optimized job:progress - lightweight payload for real-time progress bar
  socket.on('job:progress', (data) => {
    // data: { assignmentId, jobId, deviceId, progressPct, currentStep, totalSteps, status, deviceSerial }
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
    // data: { deviceId, level, message, timestamp }
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

    // Update assignment status in DB
    await supabaseService.updateAssignmentStatus(data.assignmentId, 'completed', {
      progress_pct: 100,
      final_duration_sec: data.finalDurationSec
    });

    // Update job completed_count
    if (data.jobId) {
      const { data: job } = await supabase
        .from('jobs')
        .select('completed_count, assigned_count')
        .eq('id', data.jobId)
        .single();

      if (job) {
        const newCount = (job.completed_count || 0) + 1;
        const updateData = { completed_count: newCount };

        // Check if job is complete
        if (newCount >= (job.assigned_count || 0)) {
          updateData.status = 'completed';
          console.log(`[Worker] Job ${data.jobId} fully completed!`);
        }

        await supabase
          .from('jobs')
          .update(updateData)
          .eq('id', data.jobId);
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
      // 1. Get next pending job (priority DESC, created_at ASC)
      const job = await supabaseService.getNextPendingJob();

      if (!job) {
        socket.emit('job:request:response', {
          deviceId,
          hasJob: false,
          message: 'No pending jobs'
        });
        return;
      }

      // 2. Get pending assignment for this device
      const { data: assignment, error } = await supabase
        .from('job_assignments')
        .select('*')
        .eq('job_id', job.id)
        .eq('device_id', deviceId)
        .eq('status', 'pending')
        .single();

      if (error || !assignment) {
        // No assignment for this device, create one
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

        // Send the new assignment
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

        // Update job assigned_count
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
        // Send existing assignment
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

dashboardNs.on('connection', (socket) => {
  console.log(`[Dashboard] Connected: ${socket.id}`);

  // Register dashboard client
  connectedDashboards.set(socket.id, {
    subscribedDevices: new Set(),
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
  // Log Room Management (On-demand log streaming)
  // =============================================
  
  // Join log room for a specific device/job - enables log streaming
  socket.on('join:log_room', (data) => {
    const { deviceId, jobId } = data;
    const roomName = deviceId ? `logs:${deviceId}` : `logs:job:${jobId}`;
    socket.join(roomName);
    console.log(`[Dashboard] ${socket.id} joined log room: ${roomName}`);
    
    // Acknowledge join
    socket.emit('log_room:joined', { roomName, deviceId, jobId });
  });

  // Leave log room - stops receiving logs
  socket.on('leave:log_room', (data) => {
    const { deviceId, jobId } = data;
    const roomName = deviceId ? `logs:${deviceId}` : `logs:job:${jobId}`;
    socket.leave(roomName);
    console.log(`[Dashboard] ${socket.id} left log room: ${roomName}`);
  });

  // Command from dashboard to device
  socket.on('command:send', (data) => {
    const { deviceId, command, params, commandId } = data;
    console.log(`[Dashboard] Command: ${command} -> ${deviceId}`);

    // Find worker that owns this device
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

    // Forward command to worker
    worker.socket.emit('device:command', {
      commandId: commandId || `cmd_${Date.now()}`,
      deviceId,
      command,
      params
    });
  });

  // Broadcast command to multiple devices
  socket.on('command:broadcast', (data) => {
    const { deviceIds, command, params, commandId } = data;
    console.log(`[Dashboard] Broadcast: ${command} -> ${deviceIds.length} devices`);

    for (const deviceId of deviceIds) {
      const deviceState = deviceStates.get(deviceId);
      if (!deviceState) continue;

      const worker = connectedWorkers.get(deviceState.pcId);
      if (!worker || !worker.socket) continue;

      worker.socket.emit('device:command', {
        commandId: `${commandId || 'bc'}_${deviceId}`,
        deviceId,
        command,
        params
      });
    }
  });

  // Job distribution from dashboard (after API creates job)
  socket.on('job:distribute', (data) => {
    const { assignments, job } = data;
    console.log(`[Dashboard] Job distribute: ${job.id} - ${assignments.length} assignments`);

    const sentCount = sendJobAssignments(assignments, job);

    // Acknowledge
    socket.emit('job:distribute:ack', {
      jobId: job.id,
      totalAssignments: assignments.length,
      sentCount,
      timestamp: new Date().toISOString()
    });

    // Broadcast to all dashboards
    broadcastJobStatusUpdate(job.id, 'active', {
      assigned: assignments.length,
      sent: sentCount,
      completed: 0,
      failed: 0
    });
  });

  // Job pause from dashboard
  socket.on('job:pause', async (data) => {
    const { jobId } = data;
    console.log(`[Dashboard] Job pause: ${jobId}`);

    // Notify all workers about the pause
    workerNs.emit('job:paused', { jobId });

    // Broadcast to dashboards
    broadcastJobStatusUpdate(jobId, 'paused', null);
  });

  // Job resume from dashboard
  socket.on('job:resume', async (data) => {
    const { jobId, assignments, job } = data;
    console.log(`[Dashboard] Job resume: ${jobId} - ${assignments?.length || 0} assignments`);

    // Notify workers
    workerNs.emit('job:resumed', { jobId });

    // Send pending assignments
    if (assignments && assignments.length > 0 && job) {
      const sentCount = sendJobAssignments(assignments, job);
      socket.emit('job:resume:ack', {
        jobId,
        sentCount,
        timestamp: new Date().toISOString()
      });
    }

    // Broadcast to dashboards
    broadcastJobStatusUpdate(jobId, 'active', null);
  });

  // Job cancel from dashboard
  socket.on('job:cancel', (data) => {
    const { jobId } = data;
    console.log(`[Dashboard] Job cancel: ${jobId}`);

    // Notify all workers to stop any running work
    workerNs.emit('job:cancelled', { jobId });

    // Broadcast to dashboards
    broadcastJobStatusUpdate(jobId, 'cancelled', null);
  });

  // Start streaming from device
  socket.on('stream:start', (data) => {
    const { deviceId, fps = 2 } = data;
    console.log(`[Dashboard] Stream start: ${deviceId}`);

    const deviceState = deviceStates.get(deviceId);
    if (!deviceState) {
      socket.emit('stream:error', { deviceId, error: 'Device not found' });
      return;
    }

    // Register stream subscription
    if (!activeStreams.has(deviceId)) {
      activeStreams.set(deviceId, {
        workerSocketId: deviceState.workerSocketId,
        dashboardSocketIds: new Set()
      });

      // Tell worker to start streaming
      const worker = connectedWorkers.get(deviceState.pcId);
      if (worker && worker.socket) {
        worker.socket.emit('stream:start', { deviceId, fps });
      }
    }

    activeStreams.get(deviceId).dashboardSocketIds.add(socket.id);

    // Track subscription
    const dashboard = connectedDashboards.get(socket.id);
    if (dashboard) {
      dashboard.subscribedDevices.add(deviceId);
    }
  });

  // Stop streaming from device
  socket.on('stream:stop', (data) => {
    const { deviceId } = data;
    console.log(`[Dashboard] Stream stop: ${deviceId}`);

    const stream = activeStreams.get(deviceId);
    if (stream) {
      stream.dashboardSocketIds.delete(socket.id);

      // If no more viewers, tell worker to stop
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

    // Remove subscription tracking
    const dashboard = connectedDashboards.get(socket.id);
    if (dashboard) {
      dashboard.subscribedDevices.delete(deviceId);
    }
  });

  // Disconnect handler
  socket.on('disconnect', (reason) => {
    console.log(`[Dashboard] Disconnected: ${socket.id} (${reason})`);

    // Clean up stream subscriptions
    const dashboard = connectedDashboards.get(socket.id);
    if (dashboard) {
      for (const deviceId of dashboard.subscribedDevices) {
        const stream = activeStreams.get(deviceId);
        if (stream) {
          stream.dashboardSocketIds.delete(socket.id);
          if (stream.dashboardSocketIds.size === 0) {
            // Tell worker to stop streaming
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
// Job Distribution Functions
// =============================================

/**
 * Send job assignment to a specific device's worker
 */
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

/**
 * Send multiple job assignments (bulk)
 */
function sendJobAssignments(assignments, job) {
  let sentCount = 0;
  for (const assignment of assignments) {
    if (sendJobAssignment(assignment, job)) {
      sentCount++;
    }
  }
  return sentCount;
}

/**
 * Broadcast job status update to all dashboards
 */
function broadcastJobStatusUpdate(jobId, status, progress) {
  dashboardNs.emit('job:status:update', {
    jobId,
    status,
    progress,
    timestamp: new Date().toISOString()
  });
}

/**
 * Send pending assignments to a reconnecting worker
 */
async function sendPendingAssignmentsToWorker(socket, pcId) {
  try {
    // Get devices for this PC
    const { data: devices } = await supabase
      .from('devices')
      .select('id')
      .eq('pc_id', pcId);

    if (!devices || devices.length === 0) return;

    const deviceIds = devices.map(d => d.id);

    // Get pending assignments for these devices with job info
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

    // Filter for active jobs and send
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
// Helper Functions
// =============================================

// Note: Device UPSERT now handled by supabaseService.upsertDevicesBatch()
// Legacy function kept for compatibility but not used
async function updateDevicesInSupabase(devices, pcId) {
  // Deprecated: Use supabaseService.upsertDevicesBatch() instead
  console.warn('[Deprecated] updateDevicesInSupabase called - use supabaseService instead');
}

// =============================================
// Graceful Shutdown
// =============================================

process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');

  // Notify all clients
  workerNs.emit('server:shutdown', { message: 'Server is restarting' });
  dashboardNs.emit('server:shutdown', { message: 'Server is restarting' });

  // Close connections
  io.close(() => {
    httpServer.close(() => {
      console.log('[Server] Shutdown complete');
      process.exit(0);
    });
  });
});

// =============================================
// Start Server
// =============================================

httpServer.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        DoAi.Me Socket.io Server v1.0 Started              ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  Port: ${PORT}                                                ║`);
  console.log(`║  Worker NS: /worker                                       ║`);
  console.log(`║  Dashboard NS: /dashboard                                 ║`);
  console.log(`║  Health Check: http://localhost:${PORT}/health               ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('[Server] Waiting for connections...');

  // Start Channel Checker (auto-monitoring for CHANNEL_AUTO jobs)
  startChannelChecker();
});

module.exports = { io, workerNs, dashboardNs };
