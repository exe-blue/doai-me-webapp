'use strict';

const { createClient } = require('@supabase/supabase-js');
const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NODE_ID = process.env.NODE_ID;

const HEARTBEAT_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Supabase client (service_role — bypasses RLS)
// ---------------------------------------------------------------------------
let supabase;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${ts()}] [agent]`, ...args);
}

function logError(...args) {
  console.error(`[${ts()}] [agent]`, ...args);
}

// ---------------------------------------------------------------------------
// getAdbDevices — parse `adb devices -l`
// ---------------------------------------------------------------------------

async function getAdbDevices() {
  try {
    const { stdout } = await execFileAsync('adb', ['devices', '-l'], {
      timeout: 10_000,
    });

    const lines = stdout.split('\n').filter((l) => l.trim() && !l.startsWith('List of'));
    const devices = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const serial = parts[0];
      if (!serial || parts[1] !== 'device') continue; // skip offline / unauthorized

      let model;
      let transportId;
      for (const part of parts.slice(2)) {
        if (part.startsWith('model:')) model = part.split(':')[1];
        if (part.startsWith('transport_id:')) transportId = part.split(':')[1];
      }

      devices.push({ serial, model, transport_id: transportId });
    }

    return devices;
  } catch (err) {
    logError('adb devices failed:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// upsertNode — register / update this node in the nodes table
// ---------------------------------------------------------------------------

async function upsertNode(nodeId) {
  const { error } = await supabase.from('nodes').upsert(
    {
      id: nodeId,
      name: os.hostname(),
      status: 'online',
      last_seen: ts(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    logError('upsertNode failed:', error.message);
    throw error;
  }

  log(`Node ${nodeId} registered`);
}

// ---------------------------------------------------------------------------
// detectDevices — run adb, return parsed devices
// ---------------------------------------------------------------------------

async function detectDevices() {
  return getAdbDevices();
}

// ---------------------------------------------------------------------------
// upsertDevices — sync discovered devices into devices + device_states
// ---------------------------------------------------------------------------

async function upsertDevices(nodeId, devices) {
  for (const device of devices) {
    // Upsert devices table
    const { error: devErr } = await supabase.from('devices').upsert(
      {
        id: device.serial,
        pc_id: nodeId,
        serial_number: device.serial,
        model: device.model || null,
        status: 'online',
        connection_type: 'usb',
        last_heartbeat: ts(),
      },
      { onConflict: 'id' }
    );

    if (devErr) {
      logError(`upsertDevices (devices) failed for ${device.serial}:`, devErr.message);
    }

    // Upsert device_states table
    const { error: stateErr } = await supabase.from('device_states').upsert(
      {
        device_id: device.serial,
        pc_id: nodeId,
        status: 'online',
        last_heartbeat: ts(),
      },
      { onConflict: 'device_id' }
    );

    if (stateErr) {
      logError(`upsertDevices (device_states) failed for ${device.serial}:`, stateErr.message);
    }
  }
}

// ---------------------------------------------------------------------------
// logEvent — append to command_events
// ---------------------------------------------------------------------------

async function logEvent(commandId, type, payload) {
  const { error } = await supabase.from('command_events').insert({
    command_id: commandId,
    type,
    payload: payload || {},
  });

  if (error) {
    logError(`logEvent failed for command ${commandId}:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// executeCommand — run the actual ADB / ping command
// ---------------------------------------------------------------------------

async function executeCommand(command, signal) {
  const deviceId = command.device_id;
  const payload = command.payload || {};

  switch (command.type) {
    case 'shell': {
      const args = payload.args || [payload.command || 'echo ok'];
      const shellArgs = ['-s', deviceId, 'shell', ...args];
      const { stdout } = await execFileAsync('adb', shellArgs, {
        timeout: command.timeout_ms || 30_000,
        signal,
      });
      const output = stdout.toString().trim();
      await logEvent(command.id, 'STDOUT', { output });
      return { stdout: output };
    }

    case 'reboot': {
      const { stdout } = await execFileAsync('adb', ['-s', deviceId, 'reboot'], {
        timeout: command.timeout_ms || 30_000,
        signal,
      });
      return { stdout: stdout.toString().trim() };
    }

    case 'install': {
      const apkPath = payload.apk_path;
      if (!apkPath) throw new Error('install command requires payload.apk_path');
      const { stdout } = await execFileAsync('adb', ['-s', deviceId, 'install', '-r', apkPath], {
        timeout: command.timeout_ms || 120_000,
        signal,
      });
      const output = stdout.toString().trim();
      await logEvent(command.id, 'STDOUT', { output });
      return { stdout: output };
    }

    case 'screenshot': {
      const { stdout } = await execFileAsync('adb', ['-s', deviceId, 'exec-out', 'screencap', '-p'], {
        timeout: command.timeout_ms || 30_000,
        encoding: 'buffer',
        maxBuffer: 10 * 1024 * 1024, // 10 MB for screenshots
        signal,
      });
      const base64 = Buffer.from(stdout).toString('base64');
      return { screenshot_base64: base64, size: stdout.length };
    }

    case 'ping': {
      return { pong: true, timestamp: Date.now() };
    }

    default:
      throw new Error(`Unknown command type: ${command.type}`);
  }
}

// ---------------------------------------------------------------------------
// claimAndExecute — atomically claim a command, then run it
// ---------------------------------------------------------------------------

async function claimAndExecute(command) {
  const nodeId = NODE_ID;

  // 1. Claim via RPC (atomic, race-safe)
  const { data: claimed, error: claimErr } = await supabase.rpc('claim_command', {
    p_node_id: nodeId,
    p_device_id: command.device_id,
  });

  if (claimErr) {
    logError(`claim_command RPC failed for ${command.id}:`, claimErr.message);
    return;
  }

  if (!claimed || claimed.length === 0) {
    log(`Command ${command.id} already claimed or no pending command — skipping`);
    return;
  }

  log(`Claimed command ${command.id} (type=${command.type}, device=${command.device_id})`);

  // 2. Log STARTED event
  await logEvent(command.id, 'STARTED', {});

  // 3. Update status to RUNNING
  await supabase
    .from('commands')
    .update({ status: 'RUNNING', started_at: ts() })
    .eq('id', command.id);

  // 4. Execute with timeout
  const ac = new AbortController();
  const timeoutMs = command.timeout_ms || 30_000;
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const result = await executeCommand(command, ac.signal);
    clearTimeout(timer);

    // 5. Success
    await supabase
      .from('commands')
      .update({
        status: 'SUCCEEDED',
        result,
        completed_at: ts(),
      })
      .eq('id', command.id);

    await logEvent(command.id, 'SUCCEEDED', { result });
    log(`Command ${command.id} SUCCEEDED`);
  } catch (err) {
    clearTimeout(timer);

    const isTimeout = err.name === 'AbortError' || err.code === 'ABORT_ERR';
    const status = isTimeout ? 'TIMEOUT' : 'FAILED';

    await supabase
      .from('commands')
      .update({
        status,
        error: err.message,
        completed_at: ts(),
      })
      .eq('id', command.id);

    await logEvent(command.id, status, { error: err.message });
    logError(`Command ${command.id} ${status}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// subscribeToCommands — Supabase Realtime on INSERT to commands table
// ---------------------------------------------------------------------------

let commandChannel;

function subscribeToCommands(nodeId) {
  commandChannel = supabase
    .channel('commands-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'commands',
        filter: `node_id=eq.${nodeId}`,
      },
      async (payload) => {
        const cmd = payload.new;
        if (cmd.status === 'PENDING') {
          log(`Incoming command ${cmd.id} (type=${cmd.type}, device=${cmd.device_id})`);
          await claimAndExecute(cmd);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        log(`Subscribed to commands for ${nodeId}`);
      } else {
        log(`Realtime subscription status: ${status}`);
      }
    });
}

// ---------------------------------------------------------------------------
// heartbeat — periodic node liveness + device refresh
// ---------------------------------------------------------------------------

let heartbeatTimer;

function startHeartbeat(nodeId) {
  heartbeatTimer = setInterval(async () => {
    try {
      // Update node last_seen
      await supabase
        .from('nodes')
        .update({ last_seen: ts(), status: 'online' })
        .eq('id', nodeId);

      // Refresh devices
      const devices = await detectDevices();
      await upsertDevices(nodeId, devices);

      log(`Heartbeat OK — ${devices.length} device(s)`);
    } catch (err) {
      logError('Heartbeat failed:', err.message);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(nodeId) {
  log('Shutting down...');

  // Stop heartbeat
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  // Unsubscribe from realtime
  if (commandChannel) {
    await supabase.removeChannel(commandChannel);
  }

  // Mark node as offline
  try {
    await supabase
      .from('nodes')
      .update({ status: 'offline', last_seen: ts() })
      .eq('id', nodeId);
    log(`Node ${nodeId} set to offline`);
  } catch (err) {
    logError('Failed to set node offline:', err.message);
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Validate env vars
  if (!SUPABASE_URL) {
    console.error('Missing SUPABASE_URL environment variable');
    process.exit(1);
  }
  if (!SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_SERVICE_KEY environment variable');
    process.exit(1);
  }
  if (!NODE_ID) {
    console.error('Missing NODE_ID environment variable');
    process.exit(1);
  }

  // 2. Init Supabase client
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });

  log(`Starting agent (node_id=${NODE_ID})`);

  // 3. Register node
  await upsertNode(NODE_ID);

  // 4. Detect & register devices
  const devices = await detectDevices();
  await upsertDevices(NODE_ID, devices);

  const serials = devices.map((d) => d.serial).join(', ');
  log(`Found ${devices.length} device(s)${devices.length > 0 ? ': ' + serials : ''}`);

  // 5. Subscribe to commands
  subscribeToCommands(NODE_ID);

  // 6. Start heartbeat
  startHeartbeat(NODE_ID);

  log('Agent is running. Press Ctrl+C to stop.');

  // 7. Graceful shutdown handlers
  process.on('SIGINT', () => shutdown(NODE_ID));
  process.on('SIGTERM', () => shutdown(NODE_ID));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  logError('Fatal error:', err.message);
  process.exit(1);
});
