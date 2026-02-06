'use strict';

/**
 * Register new C2 protocol handlers (evt:* events) on a worker socket.
 * Placeholder implementation - legacy handlers in socketio-server.js handle core functionality.
 */
function registerWorkerProtocolHandlers(socket, pcId, dashboardNs, connectedWorkers) {
  console.log(`[Protocol] Registered protocol handlers for worker: ${pcId}`);

  // evt:status - Worker status update
  socket.on('evt:status', (data) => {
    console.log(`[Protocol] evt:status from ${pcId}:`, JSON.stringify(data).slice(0, 200));
  });

  // evt:result - Task execution result
  socket.on('evt:result', (data) => {
    console.log(`[Protocol] evt:result from ${pcId}:`, JSON.stringify(data).slice(0, 200));
  });

  // evt:error - Error report
  socket.on('evt:error', (data) => {
    console.log(`[Protocol] evt:error from ${pcId}:`, JSON.stringify(data).slice(0, 200));
  });
}

module.exports = { registerWorkerProtocolHandlers };
