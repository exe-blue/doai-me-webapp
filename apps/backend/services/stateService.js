/**
 * Device State Management Service
 *
 * Tracks and manages device states with heartbeat monitoring.
 */

// Device state constants
const DeviceStates = {
  UNKNOWN: 'unknown',
  IDLE: 'idle',
  BUSY: 'busy',
  OFFLINE: 'offline',
  ERROR: 'error'
};

// State transition triggers
const StateTransitionTriggers = {
  HEARTBEAT_RECEIVED: 'heartbeat_received',
  TASK_ASSIGNED: 'task_assigned',
  TASK_COMPLETED: 'task_completed',
  DISCONNECTED: 'disconnected',
  ERROR_OCCURRED: 'error_occurred'
};

// In-memory device state storage
// Map<deviceId, { state, lastHeartbeat, serial, metadata }>
const deviceStates = new Map();

// Heartbeat timeout threshold (2 minutes)
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

// Heartbeat check interval (60 seconds)
const HEARTBEAT_CHECK_INTERVAL_MS = 60 * 1000;

let heartbeatCheckIntervalId = null;

/**
 * Update device state based on trigger and options
 *
 * @param {string} deviceId - Device identifier
 * @param {string} serial - Device serial number
 * @param {string} trigger - State transition trigger
 * @param {object} options - Additional options (metadata, etc.)
 */
function updateDeviceState(deviceId, serial, trigger, options = {}) {
  const now = Date.now();
  const currentEntry = deviceStates.get(deviceId);

  let newState = DeviceStates.UNKNOWN;

  // Determine new state based on trigger
  switch (trigger) {
    case StateTransitionTriggers.HEARTBEAT_RECEIVED:
      // If device was offline/unknown, bring it back to idle
      // Otherwise maintain current state (unless it's offline)
      if (!currentEntry || currentEntry.state === DeviceStates.OFFLINE || currentEntry.state === DeviceStates.UNKNOWN) {
        newState = DeviceStates.IDLE;
      } else {
        newState = currentEntry.state;
      }
      break;

    case StateTransitionTriggers.TASK_ASSIGNED:
      newState = DeviceStates.BUSY;
      break;

    case StateTransitionTriggers.TASK_COMPLETED:
      newState = DeviceStates.IDLE;
      break;

    case StateTransitionTriggers.DISCONNECTED:
      newState = DeviceStates.OFFLINE;
      break;

    case StateTransitionTriggers.ERROR_OCCURRED:
      newState = DeviceStates.ERROR;
      break;

    default:
      console.warn(`[StateService] Unknown trigger: ${trigger}`);
      newState = currentEntry ? currentEntry.state : DeviceStates.UNKNOWN;
  }

  // Log state change if it actually changed
  const oldState = currentEntry?.state;
  if (oldState !== newState) {
    console.log(`[StateService] Device ${deviceId} (${serial}): ${oldState || 'NEW'} -> ${newState} (trigger: ${trigger})`);
  }

  // Update state entry
  deviceStates.set(deviceId, {
    state: newState,
    lastHeartbeat: now,
    serial: serial,
    metadata: options.metadata || {}
  });
}

/**
 * Get current state for a device
 *
 * @param {string} deviceId - Device identifier
 * @returns {object|null} State entry or null if not found
 */
function getDeviceState(deviceId) {
  return deviceStates.get(deviceId) || null;
}

/**
 * Get all device states
 *
 * @returns {Map} All device states
 */
function getAllDeviceStates() {
  return new Map(deviceStates);
}

/**
 * Load initial device states from database
 *
 * This is a placeholder implementation. In a full implementation,
 * this would query the database for all devices and their last known states.
 */
async function loadInitialStates() {
  console.log('[StateService] State service initialized');
  // Future: Query database for devices and set initial states
  // For now, we start with an empty state map
  deviceStates.clear();
}

/**
 * Start the heartbeat checker interval
 *
 * Periodically checks for devices that haven't sent a heartbeat
 * within the timeout threshold and marks them as offline.
 */
function startHeartbeatChecker() {
  if (heartbeatCheckIntervalId) {
    console.warn('[StateService] Heartbeat checker already running');
    return;
  }

  console.log(`[StateService] Starting heartbeat checker (interval: ${HEARTBEAT_CHECK_INTERVAL_MS}ms, timeout: ${HEARTBEAT_TIMEOUT_MS}ms)`);

  heartbeatCheckIntervalId = setInterval(() => {
    const now = Date.now();
    let offlineCount = 0;

    for (const [deviceId, entry] of deviceStates.entries()) {
      const timeSinceLastHeartbeat = now - entry.lastHeartbeat;

      // If device is not already offline and hasn't sent heartbeat in time, mark as offline
      if (entry.state !== DeviceStates.OFFLINE && timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[StateService] Device ${deviceId} (${entry.serial}) marked as OFFLINE (no heartbeat for ${Math.round(timeSinceLastHeartbeat / 1000)}s)`);

        deviceStates.set(deviceId, {
          ...entry,
          state: DeviceStates.OFFLINE
        });

        offlineCount++;
      }
    }

    if (offlineCount > 0) {
      console.log(`[StateService] Heartbeat check: ${offlineCount} device(s) marked as offline`);
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);
}

/**
 * Stop the heartbeat checker interval
 */
function stopHeartbeatChecker() {
  if (heartbeatCheckIntervalId) {
    clearInterval(heartbeatCheckIntervalId);
    heartbeatCheckIntervalId = null;
    console.log('[StateService] Heartbeat checker stopped');
  }
}

// Export public API
module.exports = {
  DeviceStates,
  StateTransitionTriggers,
  updateDeviceState,
  getDeviceState,
  getAllDeviceStates,
  loadInitialStates,
  startHeartbeatChecker,
  stopHeartbeatChecker
};
