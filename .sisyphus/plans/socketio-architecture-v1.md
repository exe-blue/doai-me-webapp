# Socket.io Event Architecture for DoAi.me Device Farm

## Overview

This document defines the Socket.io event structure for real-time communication between:
- **Dashboard** (Next.js Frontend)
- **Socket.io Server** (Node.js Backend)
- **PC Workers** (Client machines running ADB)

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    Dashboard    │────▶│  Socket.io       │◀────│   PC Worker     │
│   (Next.js)     │◀────│  Server          │────▶│   (Node.js)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
   [Browser]              [Supabase DB]           [ADB Devices]
```

## Namespace Structure

```
/                     # Default namespace
├── /dashboard        # Dashboard clients (web UI)
├── /worker           # PC Worker clients
└── /stream           # Real-time screen streaming
```

## Event Schema

### 1. Heartbeat Events (PC Worker → Server)

```typescript
// Event: worker:heartbeat
// Direction: PC Worker → Server
// Interval: Every 5 seconds
{
  event: "worker:heartbeat",
  payload: {
    pc_id: string,           // PC identifier
    timestamp: ISO8601,      // UTC timestamp
    devices: [{
      serial_number: string,
      status: "idle" | "busy" | "offline",
      adb_connected: boolean,
      battery_level?: number,
      current_job_id?: string
    }]
  }
}

// Event: worker:heartbeat:ack
// Direction: Server → PC Worker
{
  event: "worker:heartbeat:ack",
  payload: {
    received_at: ISO8601,
    pending_commands: number  // Commands waiting for this worker
  }
}
```

### 2. Device Status Events

```typescript
// Event: device:status:update
// Direction: Server → Dashboard (broadcast)
{
  event: "device:status:update",
  payload: {
    device_id: string,       // UUID
    serial_number: string,
    pc_id: string,
    status: "idle" | "busy" | "offline",
    health_status: "healthy" | "zombie" | "offline",
    last_seen_at: ISO8601
  }
}

// Event: device:connected
// Direction: Server → Dashboard (broadcast)
{
  event: "device:connected",
  payload: {
    device_id: string,
    serial_number: string,
    pc_id: string
  }
}

// Event: device:disconnected
// Direction: Server → Dashboard (broadcast)
{
  event: "device:disconnected",
  payload: {
    device_id: string,
    serial_number: string,
    reason: "adb_lost" | "worker_offline" | "manual"
  }
}
```

### 3. Command Events

```typescript
// Event: command:send
// Direction: Dashboard → Server → PC Worker
{
  event: "command:send",
  payload: {
    command_id: string,      // UUID for tracking
    device_id: string,       // Target device UUID
    command_type: "tap" | "swipe" | "keyevent" | "text" | "shell" | "screenshot",
    params: {
      x?: number,
      y?: number,
      x2?: number,           // For swipe
      y2?: number,           // For swipe
      duration?: number,     // For swipe
      keycode?: number,      // For keyevent
      text?: string,         // For text input
      shellCommand?: string  // For shell
    },
    broadcast?: boolean,     // If true, send to all devices in group
    broadcast_device_ids?: string[]  // Specific devices for broadcast
  }
}

// Event: command:ack
// Direction: PC Worker → Server → Dashboard
{
  event: "command:ack",
  payload: {
    command_id: string,
    device_id: string,
    status: "received" | "executing" | "completed" | "failed",
    error?: string,
    result?: any
  }
}
```

### 4. Screen Streaming Events (Namespace: /stream)

```typescript
// Event: stream:start
// Direction: Dashboard → Server → PC Worker
{
  event: "stream:start",
  payload: {
    device_id: string,
    quality: "low" | "medium" | "high",  // 240p, 480p, 720p
    fps: number              // 1-5 fps
  }
}

// Event: stream:frame
// Direction: PC Worker → Server → Dashboard
{
  event: "stream:frame",
  payload: {
    device_id: string,
    timestamp: number,       // Unix ms
    frame: string,           // Base64 encoded JPEG
    width: number,
    height: number
  }
}

// Event: stream:stop
// Direction: Dashboard → Server → PC Worker
{
  event: "stream:stop",
  payload: {
    device_id: string
  }
}
```

### 5. Job Progress Events

```typescript
// Event: job:progress
// Direction: PC Worker → Server → Dashboard
{
  event: "job:progress",
  payload: {
    assignment_id: string,
    job_id: string,
    device_id: string,
    progress_pct: number,    // 0-100
    current_step: string,    // "searching", "watching", "liking", etc.
    elapsed_sec: number
  }
}

// Event: job:completed
// Direction: PC Worker → Server → Dashboard
{
  event: "job:completed",
  payload: {
    assignment_id: string,
    job_id: string,
    device_id: string,
    final_duration_sec: number,
    did_like: boolean,
    did_comment: boolean,
    did_playlist: boolean
  }
}

// Event: job:failed
// Direction: PC Worker → Server → Dashboard
{
  event: "job:failed",
  payload: {
    assignment_id: string,
    job_id: string,
    device_id: string,
    error_code: string,
    error_message: string
  }
}
```

## Room Structure

```typescript
// Worker rooms (by PC ID)
socket.join(`worker:${pc_id}`);

// Device rooms (by device ID)
socket.join(`device:${device_id}`);

// Dashboard clients (global)
socket.join("dashboard");

// Stream rooms (by device being watched)
socket.join(`stream:${device_id}`);
```

## Authentication

```typescript
// Connection authentication
{
  auth: {
    type: "worker" | "dashboard",
    token: string,           // JWT or API key
    pc_id?: string           // Required for workers
  }
}
```

## Error Events

```typescript
// Event: error
{
  event: "error",
  payload: {
    code: "AUTH_FAILED" | "DEVICE_NOT_FOUND" | "COMMAND_TIMEOUT" | "STREAM_ERROR",
    message: string,
    details?: any
  }
}
```

## Implementation Notes

1. **Fallback to Supabase Realtime**: If Socket.io is unavailable, fall back to Supabase Realtime for device status updates.

2. **Reconnection Strategy**:
   - Workers: Exponential backoff (1s, 2s, 4s, 8s, max 30s)
   - Dashboard: Immediate reconnect with 3 retries, then fallback

3. **Rate Limiting**:
   - Heartbeat: Max 1 per 3 seconds per worker
   - Commands: Max 10 per second per device
   - Stream frames: Max 5 fps

4. **Data Persistence**: All events are also logged to Supabase for audit trail.
