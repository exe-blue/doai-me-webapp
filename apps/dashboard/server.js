/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Custom Next.js server with Socket.io
 *
 * Namespaces:
 * - /worker: For PC Worker connections (heartbeat, stream frames)
 * - /dashboard: For Dashboard connections (status updates, commands)
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// In-memory state for devices (supplement to Supabase)
const deviceStates = new Map();
const streamingSessions = new Map(); // deviceId -> { workerSocket, dashboardSockets }

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  // ============================================
  // Worker Namespace (/worker)
  // ============================================
  const workerNsp = io.of('/worker');

  workerNsp.on('connection', (socket) => {
    console.log(`[Worker] Connected: ${socket.id}`);
    let workerId = null;
    let managedDevices = [];

    // Worker registration
    socket.on('worker:register', (data) => {
      workerId = data.workerId;
      managedDevices = data.deviceIds || [];
      socket.join(`worker:${workerId}`);
      console.log(`[Worker] Registered: ${workerId} managing ${managedDevices.length} devices`);

      // Track worker-device mapping
      managedDevices.forEach(deviceId => {
        const session = streamingSessions.get(deviceId) || { workerSocket: null, dashboardSockets: new Set() };
        session.workerSocket = socket;
        streamingSessions.set(deviceId, session);
      });
    });

    // Heartbeat from worker (includes device statuses)
    socket.on('heartbeat', (data) => {
      const { devices } = data;
      if (devices && Array.isArray(devices)) {
        devices.forEach(device => {
          deviceStates.set(device.id, {
            ...device,
            lastSeen: Date.now()
          });
          // Broadcast to dashboard namespace
          dashboardNsp.emit('device:status:update', device);
        });
      }
    });

    // Stream frame from worker
    socket.on('stream:frame', (data) => {
      const { deviceId, frame, timestamp } = data;
      const session = streamingSessions.get(deviceId);
      if (session && session.dashboardSockets.size > 0) {
        // Forward frame to all dashboard clients watching this device
        session.dashboardSockets.forEach(dashSocket => {
          dashSocket.emit('stream:frame', { deviceId, frame, timestamp });
        });
      }
    });

    // Command result from worker
    socket.on('command:result', (data) => {
      const { deviceId, commandId, success, error } = data;
      dashboardNsp.emit('command:result', { deviceId, commandId, success, error });
    });

    socket.on('disconnect', () => {
      console.log(`❌ [Worker] Disconnected: ${socket.id} (${workerId})`);

      // Mark all managed devices as OFFLINE and broadcast to dashboard
      managedDevices.forEach(deviceId => {
        const session = streamingSessions.get(deviceId);
        if (session && session.workerSocket === socket) {
          session.workerSocket = null;
        }

        // Update device state to offline
        const deviceState = deviceStates.get(deviceId);
        if (deviceState) {
          const offlineDevice = {
            ...deviceState,
            status: 'offline',
            lastSeen: Date.now()
          };
          deviceStates.set(deviceId, offlineDevice);

          // Broadcast offline status to all dashboard clients
          dashboardNsp.emit('device:status:update', offlineDevice);
          console.log(`[Worker] Device ${deviceId} marked offline`);
        }
      });

      // Also broadcast PC-level offline status if workerId exists
      if (workerId) {
        dashboardNsp.emit('worker:offline', {
          workerId: workerId,
          timestamp: Date.now()
        });
        console.log(`[Worker] Worker ${workerId} marked offline, ${managedDevices.length} devices affected`);
      }
    });
  });

  // ============================================
  // Dashboard Namespace (/dashboard)
  // ============================================
  const dashboardNsp = io.of('/dashboard');

  dashboardNsp.on('connection', (socket) => {
    console.log(`[Dashboard] Connected: ${socket.id}`);
    let watchingDevices = new Set();

    // Send current device states on connect
    socket.emit('devices:initial', Array.from(deviceStates.values()));

    // Start watching a device's stream
    socket.on('stream:start', (data) => {
      const { deviceId } = data;
      console.log(`[Dashboard] Stream start request for device: ${deviceId}`);

      const session = streamingSessions.get(deviceId) || { workerSocket: null, dashboardSockets: new Set() };
      session.dashboardSockets.add(socket);
      streamingSessions.set(deviceId, session);
      watchingDevices.add(deviceId);

      // Tell worker to start streaming
      if (session.workerSocket) {
        session.workerSocket.emit('device:stream:start', { deviceId });
      }
    });

    // Stop watching a device's stream
    socket.on('stream:stop', (data) => {
      const { deviceId } = data;
      console.log(`[Dashboard] Stream stop request for device: ${deviceId}`);

      const session = streamingSessions.get(deviceId);
      if (session) {
        session.dashboardSockets.delete(socket);
        watchingDevices.delete(deviceId);

        // If no one is watching, tell worker to stop streaming
        if (session.dashboardSockets.size === 0 && session.workerSocket) {
          session.workerSocket.emit('device:stream:stop', { deviceId });
        }
      }
    });

    // Send command to device
    socket.on('command:send', (data) => {
      const { deviceId, command, params } = data;
      console.log(`[Dashboard] Command for ${deviceId}: ${command}`, params);

      const session = streamingSessions.get(deviceId);
      if (session && session.workerSocket) {
        session.workerSocket.emit('device:command', {
          deviceId,
          command,
          params,
          commandId: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
      } else {
        socket.emit('command:error', { deviceId, error: 'Worker not connected' });
      }
    });

    // Broadcast command to multiple devices
    socket.on('command:broadcast', (data) => {
      const { deviceIds, command, params } = data;
      console.log(`[Dashboard] Broadcast command to ${deviceIds.length} devices: ${command}`);

      const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      deviceIds.forEach(deviceId => {
        const session = streamingSessions.get(deviceId);
        if (session && session.workerSocket) {
          session.workerSocket.emit('device:command', {
            deviceId,
            command,
            params,
            commandId: `${commandId}_${deviceId}`
          });
        }
      });
    });

    socket.on('disconnect', () => {
      console.log(`[Dashboard] Disconnected: ${socket.id}`);
      // Clean up stream subscriptions
      watchingDevices.forEach(deviceId => {
        const session = streamingSessions.get(deviceId);
        if (session) {
          session.dashboardSockets.delete(socket);
          if (session.dashboardSockets.size === 0 && session.workerSocket) {
            session.workerSocket.emit('device:stream:stop', { deviceId });
          }
        }
      });
    });
  });

  // ============================================
  // Start Server
  // ============================================
  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.io namespaces: /worker, /dashboard`);
  });
});
