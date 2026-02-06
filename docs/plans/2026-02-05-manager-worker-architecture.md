# Manager-Worker Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure desktop-agent as Manager and desktop-bot as Worker in a microservices-like architecture where only needed bots run on demand.

**Key Decisions:**
- Execution: Parallel Session (batch execution in worktree)
- Electron: KEEP (GUI dashboard + system tray required)
- Communication: Socket.IO only (delete worker-v5.1.js Supabase implementation)
- ADB Library: @devicefarmer/adbkit (stable protocol, event-based tracking)
- Screen Streaming: minicap (high-performance 30-40 FPS)

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│              Manager (desktop-agent + Electron)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ WorkerRegistry│  │ TaskDispatcher│  │ScreenStreamProxy │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
          │ Socket.IO           │ Socket.IO           │ minicap
          ▼                     ▼                     ▼
    ┌──────────┐          ┌──────────┐          ┌──────────┐
    │YouTubeBot│          │InstallBot│          │ [Future] │
    │ Worker   │          │ Worker   │          │  Worker  │
    └──────────┘          └──────────┘          └──────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │ @devicefarmer/   │
                    │ adbkit           │
                    └──────────────────┘
```

**Tech Stack:**
- TypeScript (both Manager and Workers)
- Socket.IO (real-time communication - chosen over Supabase polling)
- @devicefarmer/adbkit (Node.js ADB protocol client)
- minicap (high-performance screen streaming, C++ native)
- Node.js (Workers run as standalone processes)
- Electron (Manager UI - KEPT per user decision)

---

## Phase 0: Preparation

### Task 0.1: Analyze Current Implementations

**Files:**
- Read: `apps/desktop-bot/worker.js`
- Read: `apps/desktop-bot/worker-v5.1.js`
- Read: `apps/desktop-agent/src/socket/SocketClient.ts`

**Step 1: Document differences between worker.js and worker-v5.1.js**

Create comparison document:

```markdown
# Worker Implementation Comparison

## worker.js (Socket.IO based)
- Real-time bidirectional communication
- Remote control support (tap, swipe, keyevent)
- Screen streaming capability
- Heartbeat: 5s interval

## worker-v5.1.js (Supabase polling based)
- Database polling for jobs
- Atomic job claiming via RPC
- Flag-based completion detection
- Better offline recovery

## Decision: Keep worker.js (Socket.IO)
Reason: Aligns with Manager's real-time control needs
```

**Step 2: Identify features to preserve from worker-v5.1.js**

Features to extract:
- Atomic job claiming logic (adapt to Socket.IO ACK)
- Flag-based completion detection
- Evidence collection pattern

---

## Phase 1: Shared Types Package

### Task 1.1: Create @doai/worker-types Package

**Files:**
- Create: `packages/worker-types/package.json`
- Create: `packages/worker-types/src/index.ts`
- Create: `packages/worker-types/src/events.ts`
- Create: `packages/worker-types/src/worker.ts`
- Create: `packages/worker-types/src/device.ts`
- Create: `packages/worker-types/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "@doai/worker-types",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

**Step 2: Create event types (events.ts)**

```typescript
// packages/worker-types/src/events.ts

// ============================================
// Manager → Worker Events (Commands)
// ============================================

export interface CmdExecuteJob {
  job_id: string;
  job_type: string;
  params: Record<string, unknown>;
  device_ids: string[];
  priority?: number;
  timeout_ms?: number;
}

export interface CmdCancelJob {
  job_id: string;
  reason?: string;
}

export interface CmdPing {
  timestamp: number;
}

// ============================================
// Worker → Manager Events (Reports)
// ============================================

export interface EvtWorkerRegister {
  worker_id: string;
  worker_type: string;
  version: string;
  capabilities: string[];
  devices: DeviceInfo[];
}

export interface EvtHeartbeat {
  worker_id: string;
  devices: DeviceStatus[];
  system: SystemMetrics;
  active_jobs: string[];
}

export interface EvtJobProgress {
  job_id: string;
  device_id: string;
  progress: number; // 0-100
  current_step: string;
  message?: string;
}

export interface EvtJobComplete {
  job_id: string;
  device_id: string;
  success: boolean;
  duration_ms: number;
  result?: Record<string, unknown>;
  error?: string;
}

export interface EvtPong {
  timestamp: number;
  latency_ms: number;
}

// ============================================
// Supporting Types
// ============================================

export interface DeviceInfo {
  id: string;
  serial: string;
  model?: string;
  android_version?: string;
}

export interface DeviceStatus {
  id: string;
  state: 'idle' | 'busy' | 'error' | 'offline';
  battery?: number;
  current_job?: string;
}

export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  uptime_seconds: number;
}

// ============================================
// Event Maps for Type Safety
// ============================================

export interface ManagerToWorkerEvents {
  'cmd:execute_job': (data: CmdExecuteJob, ack: (response: { accepted: boolean; reason?: string }) => void) => void;
  'cmd:cancel_job': (data: CmdCancelJob, ack: (response: { cancelled: boolean }) => void) => void;
  'cmd:ping': (data: CmdPing) => void;
}

export interface WorkerToManagerEvents {
  'evt:register': (data: EvtWorkerRegister, ack: (response: { success: boolean; manager_id: string }) => void) => void;
  'evt:heartbeat': (data: EvtHeartbeat) => void;
  'evt:job_progress': (data: EvtJobProgress) => void;
  'evt:job_complete': (data: EvtJobComplete) => void;
  'evt:pong': (data: EvtPong) => void;
}
```

**Step 3: Create worker interface (worker.ts)**

```typescript
// packages/worker-types/src/worker.ts

export type WorkerType = 'youtube' | 'install' | 'scrape' | 'generic';

export interface WorkerCapability {
  name: string;
  version: string;
  supported_actions: string[];
}

export interface WorkerConfig {
  worker_id: string;
  worker_type: WorkerType;
  manager_url: string;
  heartbeat_interval_ms: number;
  reconnect_attempts: number;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

export interface JobHandler {
  job_type: string;
  execute: (params: Record<string, unknown>, device_id: string, onProgress: (progress: number, message?: string) => void) => Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }>;
  cancel?: () => Promise<void>;
}

export interface WorkerInterface {
  readonly id: string;
  readonly type: WorkerType;
  readonly capabilities: WorkerCapability[];
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  registerJobHandler(handler: JobHandler): void;
  unregisterJobHandler(job_type: string): void;
  
  getDevices(): DeviceInfo[];
  getStatus(): WorkerStatus;
}

export interface WorkerStatus {
  connected: boolean;
  uptime_seconds: number;
  active_jobs: number;
  total_jobs_completed: number;
  total_jobs_failed: number;
}
```

**Step 4: Create device types (device.ts)**

```typescript
// packages/worker-types/src/device.ts

export type DeviceState = 'idle' | 'running' | 'error' | 'quarantine' | 'disconnected';

export interface Device {
  id: string;
  serial: string;
  model: string;
  android_version: string;
  state: DeviceState;
  battery_level: number;
  is_charging: boolean;
  screen_on: boolean;
  ip_address?: string;
  last_seen: Date;
}

export interface DeviceCommand {
  type: 'tap' | 'swipe' | 'text' | 'keyevent' | 'shell';
  params: Record<string, unknown>;
}

export interface DeviceCommandResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

**Step 5: Create index.ts**

```typescript
// packages/worker-types/src/index.ts

export * from './events';
export * from './worker';
export * from './device';
```

**Step 6: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 7: Build and verify**

Run:
```bash
cd packages/worker-types
npm install
npm run build
```

Expected: `dist/` folder created with `.js` and `.d.ts` files

**Step 8: Commit**

```bash
git add packages/worker-types/
git commit -m "feat: add @doai/worker-types package with shared type definitions"
```

---

## Phase 2: Worker Base Class

### Task 2.1: Create @doai/worker-core Package

**Files:**
- Create: `packages/worker-core/package.json`
- Create: `packages/worker-core/src/index.ts`
- Create: `packages/worker-core/src/BaseWorker.ts`
- Create: `packages/worker-core/src/AdbController.ts`
- Create: `packages/worker-core/src/DeviceManager.ts`
- Create: `packages/worker-core/src/Logger.ts`
- Create: `packages/worker-core/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "@doai/worker-core",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@doai/worker-types": "^1.0.0",
    "socket.io-client": "^4.7.4",
    "dotenv": "^16.4.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3"
  }
}
```

**Step 2: Create Logger (Logger.ts)**

```typescript
// packages/worker-core/src/Logger.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private context: string;
  private minLevel: LogLevel;

  constructor(context: string, minLevel: LogLevel = 'info') {
    this.context = context;
    this.minLevel = minLevel;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`;
    
    if (meta) {
      console.log(prefix, message, JSON.stringify(meta));
    } else {
      console.log(prefix, message);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`, this.minLevel);
  }
}
```

**Step 3: Create AdbController (AdbController.ts)**

```typescript
// packages/worker-core/src/AdbController.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import { Device, DeviceCommand, DeviceCommandResult } from '@doai/worker-types';
import { Logger } from './Logger';

const execAsync = promisify(exec);

export class AdbController {
  private adbPath: string;
  private logger: Logger;

  constructor(adbPath: string = 'adb', logger?: Logger) {
    this.adbPath = adbPath;
    this.logger = logger || new Logger('AdbController');
  }

  private sanitizeInput(input: string): string {
    // Prevent command injection
    return input.replace(/[;&|`$(){}[\]<>\\]/g, '');
  }

  async execute(command: string, serial?: string): Promise<{ stdout: string; stderr: string }> {
    const sanitized = this.sanitizeInput(command);
    const fullCommand = serial 
      ? `${this.adbPath} -s ${serial} ${sanitized}`
      : `${this.adbPath} ${sanitized}`;
    
    this.logger.debug(`Executing: ${fullCommand}`);
    
    try {
      const { stdout, stderr } = await execAsync(fullCommand, { timeout: 30000 });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
      this.logger.error(`ADB command failed: ${fullCommand}`, { error: error.message });
      throw error;
    }
  }

  async listDevices(): Promise<Device[]> {
    const { stdout } = await this.execute('devices -l');
    const lines = stdout.split('\n').slice(1); // Skip header
    
    const devices: Device[] = [];
    
    for (const line of lines) {
      if (!line.trim() || line.includes('offline')) continue;
      
      const match = line.match(/^(\S+)\s+device\s*(.*)/);
      if (!match) continue;
      
      const serial = match[1];
      const props = match[2];
      
      const modelMatch = props.match(/model:(\S+)/);
      const model = modelMatch ? modelMatch[1] : 'Unknown';
      
      // Get Android version
      let androidVersion = 'Unknown';
      try {
        const { stdout: version } = await this.execute('shell getprop ro.build.version.release', serial);
        androidVersion = version;
      } catch {}

      // Get battery level
      let batteryLevel = 100;
      let isCharging = false;
      try {
        const { stdout: battery } = await this.execute('shell dumpsys battery', serial);
        const levelMatch = battery.match(/level:\s*(\d+)/);
        const chargingMatch = battery.match(/status:\s*(\d+)/);
        if (levelMatch) batteryLevel = parseInt(levelMatch[1], 10);
        if (chargingMatch) isCharging = chargingMatch[1] === '2' || chargingMatch[1] === '5';
      } catch {}

      devices.push({
        id: serial,
        serial,
        model,
        android_version: androidVersion,
        state: 'idle',
        battery_level: batteryLevel,
        is_charging: isCharging,
        screen_on: true,
        last_seen: new Date(),
      });
    }
    
    return devices;
  }

  async executeCommand(serial: string, command: DeviceCommand): Promise<DeviceCommandResult> {
    try {
      let shellCommand: string;
      
      switch (command.type) {
        case 'tap':
          shellCommand = `shell input tap ${command.params.x} ${command.params.y}`;
          break;
        case 'swipe':
          shellCommand = `shell input swipe ${command.params.x1} ${command.params.y1} ${command.params.x2} ${command.params.y2} ${command.params.duration || 300}`;
          break;
        case 'text':
          const escaped = String(command.params.text).replace(/ /g, '%s');
          shellCommand = `shell input text "${escaped}"`;
          break;
        case 'keyevent':
          shellCommand = `shell input keyevent ${command.params.keycode}`;
          break;
        case 'shell':
          shellCommand = `shell ${command.params.command}`;
          break;
        default:
          return { success: false, error: `Unknown command type: ${command.type}` };
      }
      
      const { stdout } = await this.execute(shellCommand, serial);
      return { success: true, output: stdout };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async screenshot(serial: string, localPath: string): Promise<boolean> {
    try {
      const remotePath = '/sdcard/screenshot.png';
      await this.execute(`shell screencap -p ${remotePath}`, serial);
      await this.execute(`pull ${remotePath} "${localPath}"`, serial);
      await this.execute(`shell rm ${remotePath}`, serial);
      return true;
    } catch (error) {
      this.logger.error('Screenshot failed', { serial, error });
      return false;
    }
  }
}
```

**Step 4: Create DeviceManager (DeviceManager.ts)**

```typescript
// packages/worker-core/src/DeviceManager.ts

import { EventEmitter } from 'events';
import { Device, DeviceState } from '@doai/worker-types';
import { AdbController } from './AdbController';
import { Logger } from './Logger';

export interface DeviceManagerEvents {
  'device:connected': (device: Device) => void;
  'device:disconnected': (deviceId: string) => void;
  'device:stateChanged': (device: Device, oldState: DeviceState) => void;
  'device:lowBattery': (device: Device) => void;
}

export class DeviceManager extends EventEmitter {
  private devices: Map<string, Device> = new Map();
  private adb: AdbController;
  private logger: Logger;
  private scanInterval: NodeJS.Timeout | null = null;
  private batteryCheckInterval: NodeJS.Timeout | null = null;

  constructor(adb: AdbController, logger?: Logger) {
    super();
    this.adb = adb;
    this.logger = logger || new Logger('DeviceManager');
  }

  async start(scanIntervalMs: number = 5000, batteryCheckIntervalMs: number = 60000): Promise<void> {
    this.logger.info('Starting device manager');
    
    // Initial scan
    await this.scanDevices();
    
    // Periodic scans
    this.scanInterval = setInterval(() => this.scanDevices(), scanIntervalMs);
    this.batteryCheckInterval = setInterval(() => this.checkBatteries(), batteryCheckIntervalMs);
  }

  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.batteryCheckInterval) {
      clearInterval(this.batteryCheckInterval);
      this.batteryCheckInterval = null;
    }
    this.logger.info('Device manager stopped');
  }

  private async scanDevices(): Promise<void> {
    try {
      const foundDevices = await this.adb.listDevices();
      const foundIds = new Set(foundDevices.map(d => d.id));
      
      // Check for disconnected devices
      for (const [id, device] of this.devices) {
        if (!foundIds.has(id)) {
          this.devices.delete(id);
          this.emit('device:disconnected', id);
          this.logger.info(`Device disconnected: ${id}`);
        }
      }
      
      // Check for new or updated devices
      for (const device of foundDevices) {
        const existing = this.devices.get(device.id);
        
        if (!existing) {
          this.devices.set(device.id, device);
          this.emit('device:connected', device);
          this.logger.info(`Device connected: ${device.id} (${device.model})`);
        } else {
          // Update device info
          device.state = existing.state; // Preserve state
          this.devices.set(device.id, device);
        }
      }
    } catch (error) {
      this.logger.error('Device scan failed', { error });
    }
  }

  private async checkBatteries(): Promise<void> {
    for (const device of this.devices.values()) {
      if (device.battery_level < 20 && !device.is_charging) {
        this.emit('device:lowBattery', device);
        this.logger.warn(`Low battery: ${device.id} at ${device.battery_level}%`);
      }
    }
  }

  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  setDeviceState(id: string, state: DeviceState): void {
    const device = this.devices.get(id);
    if (device) {
      const oldState = device.state;
      device.state = state;
      this.emit('device:stateChanged', device, oldState);
    }
  }

  getIdleDevices(): Device[] {
    return this.getDevices().filter(d => d.state === 'idle');
  }
}
```

**Step 5: Create BaseWorker (BaseWorker.ts)**

```typescript
// packages/worker-core/src/BaseWorker.ts

import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';
import {
  WorkerConfig,
  WorkerType,
  WorkerCapability,
  WorkerStatus,
  JobHandler,
  ManagerToWorkerEvents,
  WorkerToManagerEvents,
  CmdExecuteJob,
  CmdCancelJob,
  EvtHeartbeat,
  DeviceStatus,
} from '@doai/worker-types';
import { AdbController } from './AdbController';
import { DeviceManager } from './DeviceManager';
import { Logger } from './Logger';

export abstract class BaseWorker extends EventEmitter {
  protected config: WorkerConfig;
  protected socket: Socket | null = null;
  protected adb: AdbController;
  protected deviceManager: DeviceManager;
  protected logger: Logger;
  
  protected jobHandlers: Map<string, JobHandler> = new Map();
  protected activeJobs: Map<string, { job_id: string; device_id: string; cancel?: () => Promise<void> }> = new Map();
  
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private startTime = Date.now();
  private jobsCompleted = 0;
  private jobsFailed = 0;

  constructor(config: WorkerConfig) {
    super();
    this.config = config;
    this.logger = new Logger(`Worker:${config.worker_type}`, config.log_level);
    this.adb = new AdbController(process.env.ADB_PATH || 'adb', this.logger.child('ADB'));
    this.deviceManager = new DeviceManager(this.adb, this.logger.child('DeviceManager'));
  }

  // Abstract methods for subclasses
  abstract get type(): WorkerType;
  abstract get capabilities(): WorkerCapability[];

  get id(): string {
    return this.config.worker_id;
  }

  async connect(): Promise<void> {
    this.logger.info(`Connecting to manager: ${this.config.manager_url}`);
    
    // Start device manager first
    await this.deviceManager.start();
    
    // Connect to manager
    this.socket = io(this.config.manager_url, {
      reconnection: true,
      reconnectionAttempts: this.config.reconnect_attempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      transports: ['websocket'],
    });

    this.setupSocketHandlers();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

      this.socket!.on('connect', () => {
        clearTimeout(timeout);
        this.logger.info('Connected to manager');
        this.register();
        this.startHeartbeat();
        resolve();
      });

      this.socket!.on('connect_error', (error) => {
        clearTimeout(timeout);
        this.logger.error('Connection failed', { error: error.message });
        reject(error);
      });
    });
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.deviceManager.stop();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.logger.info('Disconnected from manager');
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('disconnect', (reason) => {
      this.logger.warn(`Disconnected: ${reason}`);
      this.stopHeartbeat();
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.logger.info(`Reconnected after ${attemptNumber} attempts`);
      this.register();
      this.startHeartbeat();
    });

    // Command handlers
    this.socket.on('cmd:execute_job', (data: CmdExecuteJob, ack) => {
      this.handleExecuteJob(data, ack);
    });

    this.socket.on('cmd:cancel_job', (data: CmdCancelJob, ack) => {
      this.handleCancelJob(data, ack);
    });

    this.socket.on('cmd:ping', () => {
      this.socket!.emit('evt:pong', {
        timestamp: Date.now(),
        latency_ms: 0,
      });
    });
  }

  private register(): void {
    if (!this.socket) return;

    this.socket.emit('evt:register', {
      worker_id: this.id,
      worker_type: this.type,
      version: process.env.npm_package_version || '1.0.0',
      capabilities: this.capabilities.map(c => c.name),
      devices: this.deviceManager.getDevices().map(d => ({
        id: d.id,
        serial: d.serial,
        model: d.model,
        android_version: d.android_version,
      })),
    }, (response: { success: boolean; manager_id: string }) => {
      if (response.success) {
        this.logger.info(`Registered with manager: ${response.manager_id}`);
      } else {
        this.logger.error('Registration failed');
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeat_interval_ms);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat(): void {
    if (!this.socket?.connected) return;

    const devices = this.deviceManager.getDevices();
    const deviceStatuses: DeviceStatus[] = devices.map(d => ({
      id: d.id,
      state: d.state === 'running' ? 'busy' : d.state === 'disconnected' ? 'offline' : d.state,
      battery: d.battery_level,
      current_job: this.getJobForDevice(d.id),
    }));

    const heartbeat: EvtHeartbeat = {
      worker_id: this.id,
      devices: deviceStatuses,
      system: {
        cpu_percent: 0, // TODO: Implement
        memory_percent: 0, // TODO: Implement
        uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      },
      active_jobs: Array.from(this.activeJobs.keys()),
    };

    this.socket.emit('evt:heartbeat', heartbeat);
  }

  private getJobForDevice(deviceId: string): string | undefined {
    for (const [jobId, job] of this.activeJobs) {
      if (job.device_id === deviceId) return jobId;
    }
    return undefined;
  }

  private async handleExecuteJob(data: CmdExecuteJob, ack: (response: { accepted: boolean; reason?: string }) => void): Promise<void> {
    const handler = this.jobHandlers.get(data.job_type);
    
    if (!handler) {
      this.logger.warn(`No handler for job type: ${data.job_type}`);
      ack({ accepted: false, reason: `Unknown job type: ${data.job_type}` });
      return;
    }

    // Check device availability
    const availableDevices = data.device_ids.filter(id => {
      const device = this.deviceManager.getDevice(id);
      return device && device.state === 'idle';
    });

    if (availableDevices.length === 0) {
      ack({ accepted: false, reason: 'No available devices' });
      return;
    }

    ack({ accepted: true });

    // Execute job on each device
    for (const deviceId of availableDevices) {
      this.executeJob(data.job_id, deviceId, handler, data.params);
    }
  }

  private async executeJob(
    jobId: string,
    deviceId: string,
    handler: JobHandler,
    params: Record<string, unknown>
  ): Promise<void> {
    const jobKey = `${jobId}:${deviceId}`;
    this.deviceManager.setDeviceState(deviceId, 'running');
    
    const startTime = Date.now();
    
    this.activeJobs.set(jobKey, {
      job_id: jobId,
      device_id: deviceId,
      cancel: handler.cancel,
    });

    const onProgress = (progress: number, message?: string) => {
      this.socket?.emit('evt:job_progress', {
        job_id: jobId,
        device_id: deviceId,
        progress,
        current_step: message || 'Running',
        message,
      });
    };

    try {
      const result = await handler.execute(params, deviceId, onProgress);
      
      this.socket?.emit('evt:job_complete', {
        job_id: jobId,
        device_id: deviceId,
        success: result.success,
        duration_ms: Date.now() - startTime,
        result: result.result,
        error: result.error,
      });

      if (result.success) {
        this.jobsCompleted++;
      } else {
        this.jobsFailed++;
      }
    } catch (error: any) {
      this.socket?.emit('evt:job_complete', {
        job_id: jobId,
        device_id: deviceId,
        success: false,
        duration_ms: Date.now() - startTime,
        error: error.message,
      });
      this.jobsFailed++;
    } finally {
      this.activeJobs.delete(jobKey);
      this.deviceManager.setDeviceState(deviceId, 'idle');
    }
  }

  private async handleCancelJob(data: CmdCancelJob, ack: (response: { cancelled: boolean }) => void): Promise<void> {
    let cancelled = false;
    
    for (const [key, job] of this.activeJobs) {
      if (job.job_id === data.job_id && job.cancel) {
        try {
          await job.cancel();
          this.activeJobs.delete(key);
          this.deviceManager.setDeviceState(job.device_id, 'idle');
          cancelled = true;
        } catch (error) {
          this.logger.error(`Failed to cancel job: ${data.job_id}`, { error });
        }
      }
    }
    
    ack({ cancelled });
  }

  registerJobHandler(handler: JobHandler): void {
    this.jobHandlers.set(handler.job_type, handler);
    this.logger.info(`Registered job handler: ${handler.job_type}`);
  }

  unregisterJobHandler(jobType: string): void {
    this.jobHandlers.delete(jobType);
    this.logger.info(`Unregistered job handler: ${jobType}`);
  }

  getStatus(): WorkerStatus {
    return {
      connected: this.socket?.connected || false,
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      active_jobs: this.activeJobs.size,
      total_jobs_completed: this.jobsCompleted,
      total_jobs_failed: this.jobsFailed,
    };
  }
}
```

**Step 6: Create index.ts**

```typescript
// packages/worker-core/src/index.ts

export { BaseWorker } from './BaseWorker';
export { AdbController } from './AdbController';
export { DeviceManager } from './DeviceManager';
export { Logger } from './Logger';

export type { DeviceManagerEvents } from './DeviceManager';
```

**Step 7: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 8: Build and verify**

Run:
```bash
cd packages/worker-core
npm install
npm run build
```

Expected: `dist/` folder with all compiled files

**Step 9: Commit**

```bash
git add packages/worker-core/
git commit -m "feat: add @doai/worker-core package with BaseWorker class"
```

---

## Phase 3: YouTube Worker Implementation

### Task 3.1: Create YouTube Worker Bot

**Files:**
- Create: `apps/youtube-bot/package.json`
- Create: `apps/youtube-bot/src/index.ts`
- Create: `apps/youtube-bot/src/YouTubeWorker.ts`
- Create: `apps/youtube-bot/src/handlers/WatchHandler.ts`
- Create: `apps/youtube-bot/src/handlers/HumanSimulator.ts`
- Create: `apps/youtube-bot/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "@doai/youtube-bot",
  "version": "1.0.0",
  "main": "dist/index.js",
  "bin": {
    "youtube-bot": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "@doai/worker-core": "^1.0.0",
    "@doai/worker-types": "^1.0.0",
    "dotenv": "^16.4.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2"
  }
}
```

**Step 2: Create HumanSimulator (handlers/HumanSimulator.ts)**

```typescript
// apps/youtube-bot/src/handlers/HumanSimulator.ts

import { AdbController } from '@doai/worker-core';

export interface HumanSimulatorConfig {
  minDelay: number;
  maxDelay: number;
  touchVariance: number;
  scrollProbability: number;
  likeProbability: number;
  commentProbability: number;
}

const DEFAULT_CONFIG: HumanSimulatorConfig = {
  minDelay: 500,
  maxDelay: 2000,
  touchVariance: 10,
  scrollProbability: 0.3,
  likeProbability: 0.1,
  commentProbability: 0.02,
};

export class HumanSimulator {
  private adb: AdbController;
  private config: HumanSimulatorConfig;

  constructor(adb: AdbController, config: Partial<HumanSimulatorConfig> = {}) {
    this.adb = adb;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private randomDelay(): number {
    return this.config.minDelay + Math.random() * (this.config.maxDelay - this.config.minDelay);
  }

  private addVariance(value: number): number {
    return value + (Math.random() - 0.5) * 2 * this.config.touchVariance;
  }

  async wait(ms?: number): Promise<void> {
    const delay = ms ?? this.randomDelay();
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async tap(serial: string, x: number, y: number): Promise<void> {
    const variedX = Math.round(this.addVariance(x));
    const variedY = Math.round(this.addVariance(y));
    
    await this.adb.executeCommand(serial, {
      type: 'tap',
      params: { x: variedX, y: variedY },
    });
    
    await this.wait(100 + Math.random() * 200);
  }

  async scroll(serial: string, direction: 'up' | 'down'): Promise<void> {
    const centerX = 540;
    const startY = direction === 'down' ? 1500 : 500;
    const endY = direction === 'down' ? 500 : 1500;
    const duration = 300 + Math.random() * 200;

    await this.adb.executeCommand(serial, {
      type: 'swipe',
      params: {
        x1: this.addVariance(centerX),
        y1: this.addVariance(startY),
        x2: this.addVariance(centerX),
        y2: this.addVariance(endY),
        duration: Math.round(duration),
      },
    });

    await this.wait(500 + Math.random() * 500);
  }

  async randomScrollDuringWatch(serial: string): Promise<void> {
    if (Math.random() < this.config.scrollProbability) {
      // Scroll down to comments
      await this.scroll(serial, 'down');
      await this.wait(2000 + Math.random() * 3000);
      
      // Scroll back up
      await this.scroll(serial, 'up');
    }
  }

  shouldLike(): boolean {
    return Math.random() < this.config.likeProbability;
  }

  shouldComment(): boolean {
    return Math.random() < this.config.commentProbability;
  }

  async simulateWatching(serial: string, durationSeconds: number): Promise<void> {
    const endTime = Date.now() + durationSeconds * 1000;
    
    while (Date.now() < endTime) {
      // Random micro-interactions
      await this.wait(5000 + Math.random() * 10000);
      
      if (Date.now() >= endTime) break;
      
      // Maybe scroll
      await this.randomScrollDuringWatch(serial);
    }
  }
}
```

**Step 3: Create WatchHandler (handlers/WatchHandler.ts)**

```typescript
// apps/youtube-bot/src/handlers/WatchHandler.ts

import { JobHandler } from '@doai/worker-types';
import { AdbController, Logger } from '@doai/worker-core';
import { HumanSimulator } from './HumanSimulator';

interface WatchParams {
  video_url: string;
  watch_duration_seconds: number;
  like_video?: boolean;
  comment_text?: string;
}

export class WatchHandler implements JobHandler {
  job_type = 'youtube_watch';
  
  private adb: AdbController;
  private simulator: HumanSimulator;
  private logger: Logger;
  private cancelled = false;

  constructor(adb: AdbController, logger: Logger) {
    this.adb = adb;
    this.simulator = new HumanSimulator(adb);
    this.logger = logger;
  }

  async execute(
    params: Record<string, unknown>,
    deviceId: string,
    onProgress: (progress: number, message?: string) => void
  ): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
    const watchParams = params as WatchParams;
    this.cancelled = false;

    try {
      onProgress(0, 'Starting YouTube');
      
      // Open YouTube with video URL
      const videoId = this.extractVideoId(watchParams.video_url);
      if (!videoId) {
        return { success: false, error: 'Invalid video URL' };
      }

      // Use intent to open video directly
      await this.adb.execute(
        `shell am start -a android.intent.action.VIEW -d "https://www.youtube.com/watch?v=${videoId}"`,
        deviceId
      );
      
      await this.simulator.wait(5000); // Wait for YouTube to load
      
      if (this.cancelled) return { success: false, error: 'Cancelled' };

      onProgress(10, 'Video opened');

      // Watch the video with human-like behavior
      const watchTime = watchParams.watch_duration_seconds;
      const checkInterval = 10; // Check every 10 seconds
      const totalChecks = Math.ceil(watchTime / checkInterval);

      for (let i = 0; i < totalChecks; i++) {
        if (this.cancelled) return { success: false, error: 'Cancelled' };
        
        const progress = Math.min(90, 10 + (i / totalChecks) * 80);
        onProgress(progress, `Watching: ${i * checkInterval}/${watchTime}s`);
        
        // Simulate human watching behavior
        await this.simulator.simulateWatching(deviceId, Math.min(checkInterval, watchTime - i * checkInterval));
      }

      if (this.cancelled) return { success: false, error: 'Cancelled' };

      // Optional: Like video
      if (watchParams.like_video || this.simulator.shouldLike()) {
        onProgress(92, 'Liking video');
        await this.likeVideo(deviceId);
      }

      // Optional: Comment
      if (watchParams.comment_text) {
        onProgress(95, 'Adding comment');
        await this.addComment(deviceId, watchParams.comment_text);
      }

      onProgress(100, 'Completed');

      return {
        success: true,
        result: {
          video_id: videoId,
          watched_seconds: watchTime,
          liked: watchParams.like_video,
          commented: !!watchParams.comment_text,
        },
      };
    } catch (error: any) {
      this.logger.error('Watch job failed', { error: error.message, deviceId });
      return { success: false, error: error.message };
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
  }

  private extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  private async likeVideo(deviceId: string): Promise<void> {
    // Like button typically at bottom of video player
    // These coordinates are approximate and may need adjustment
    await this.simulator.tap(deviceId, 150, 1750);
    await this.simulator.wait(1000);
  }

  private async addComment(deviceId: string, text: string): Promise<void> {
    // Scroll to comments
    await this.simulator.scroll(deviceId, 'down');
    await this.simulator.wait(2000);
    
    // Tap comment field (approximate coordinates)
    await this.simulator.tap(deviceId, 540, 800);
    await this.simulator.wait(1000);
    
    // Type comment
    await this.adb.executeCommand(deviceId, {
      type: 'text',
      params: { text },
    });
    await this.simulator.wait(500);
    
    // Submit (Enter key)
    await this.adb.executeCommand(deviceId, {
      type: 'keyevent',
      params: { keycode: 66 },
    });
  }
}
```

**Step 4: Create YouTubeWorker (YouTubeWorker.ts)**

```typescript
// apps/youtube-bot/src/YouTubeWorker.ts

import { BaseWorker, Logger } from '@doai/worker-core';
import { WorkerConfig, WorkerType, WorkerCapability } from '@doai/worker-types';
import { WatchHandler } from './handlers/WatchHandler';

export class YouTubeWorker extends BaseWorker {
  constructor(config: WorkerConfig) {
    super(config);
    this.setupHandlers();
  }

  get type(): WorkerType {
    return 'youtube';
  }

  get capabilities(): WorkerCapability[] {
    return [
      {
        name: 'youtube_watch',
        version: '1.0.0',
        supported_actions: ['watch', 'like', 'comment'],
      },
    ];
  }

  private setupHandlers(): void {
    // Register job handlers
    this.registerJobHandler(new WatchHandler(this.adb, this.logger.child('WatchHandler')));
    
    // Listen to device events
    this.deviceManager.on('device:connected', (device) => {
      this.logger.info(`Device available: ${device.id} (${device.model})`);
    });
    
    this.deviceManager.on('device:disconnected', (deviceId) => {
      this.logger.warn(`Device lost: ${deviceId}`);
    });
    
    this.deviceManager.on('device:lowBattery', (device) => {
      this.logger.warn(`Low battery on ${device.id}: ${device.battery_level}%`);
    });
  }
}
```

**Step 5: Create entry point (index.ts)**

```typescript
#!/usr/bin/env node
// apps/youtube-bot/src/index.ts

import 'dotenv/config';
import { WorkerConfig } from '@doai/worker-types';
import { YouTubeWorker } from './YouTubeWorker';

const config: WorkerConfig = {
  worker_id: process.env.WORKER_ID || `youtube-${require('os').hostname()}`,
  worker_type: 'youtube',
  manager_url: process.env.MANAGER_URL || 'http://localhost:3001',
  heartbeat_interval_ms: parseInt(process.env.HEARTBEAT_INTERVAL || '5000', 10),
  reconnect_attempts: parseInt(process.env.RECONNECT_ATTEMPTS || '10', 10),
  log_level: (process.env.LOG_LEVEL as any) || 'info',
};

const worker = new YouTubeWorker(config);

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║       DOAI YouTube Worker Bot          ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`Worker ID: ${config.worker_id}`);
  console.log(`Manager:   ${config.manager_url}`);
  console.log('');

  try {
    await worker.connect();
    console.log('✓ Connected to manager');
    console.log('✓ Listening for jobs...');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await worker.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.disconnect();
  process.exit(0);
});

main();
```

**Step 6: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 7: Build and verify**

Run:
```bash
cd apps/youtube-bot
npm install
npm run build
```

Expected: `dist/` folder with compiled files

**Step 8: Commit**

```bash
git add apps/youtube-bot/
git commit -m "feat: add YouTube worker bot with watch handler and human simulation"
```

---

## Phase 4: Manager Integration

### Task 4.1: Add Worker Registry to Desktop-Agent

**Files:**
- Create: `apps/desktop-agent/src/manager/WorkerRegistry.ts`
- Create: `apps/desktop-agent/src/manager/TaskDispatcher.ts`
- Modify: `apps/desktop-agent/src/socket/SocketClient.ts`
- Modify: `apps/desktop-agent/src/main.ts`

**Step 1: Create WorkerRegistry**

```typescript
// apps/desktop-agent/src/manager/WorkerRegistry.ts

import { EventEmitter } from 'events';
import { Socket } from 'socket.io';
import { EvtWorkerRegister, EvtHeartbeat, DeviceStatus } from '@doai/worker-types';

export interface RegisteredWorker {
  worker_id: string;
  worker_type: string;
  version: string;
  capabilities: string[];
  devices: DeviceStatus[];
  socket: Socket;
  connected_at: Date;
  last_heartbeat: Date;
  active_jobs: string[];
}

export class WorkerRegistry extends EventEmitter {
  private workers: Map<string, RegisteredWorker> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  start(healthCheckIntervalMs: number = 15000): void {
    this.healthCheckInterval = setInterval(() => {
      this.checkWorkerHealth();
    }, healthCheckIntervalMs);
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  registerWorker(data: EvtWorkerRegister, socket: Socket): { success: boolean; manager_id: string } {
    const existing = this.workers.get(data.worker_id);
    
    if (existing) {
      // Update existing worker's socket
      existing.socket = socket;
      existing.last_heartbeat = new Date();
      existing.capabilities = data.capabilities;
      this.emit('worker:reconnected', existing);
    } else {
      const worker: RegisteredWorker = {
        worker_id: data.worker_id,
        worker_type: data.worker_type,
        version: data.version,
        capabilities: data.capabilities,
        devices: data.devices.map(d => ({
          id: d.id,
          state: 'idle',
          battery: undefined,
          current_job: undefined,
        })),
        socket,
        connected_at: new Date(),
        last_heartbeat: new Date(),
        active_jobs: [],
      };
      
      this.workers.set(data.worker_id, worker);
      this.emit('worker:registered', worker);
    }

    return {
      success: true,
      manager_id: 'manager-1', // TODO: Configure
    };
  }

  unregisterWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      this.workers.delete(workerId);
      this.emit('worker:unregistered', worker);
    }
  }

  updateHeartbeat(data: EvtHeartbeat): void {
    const worker = this.workers.get(data.worker_id);
    if (worker) {
      worker.last_heartbeat = new Date();
      worker.devices = data.devices;
      worker.active_jobs = data.active_jobs;
      this.emit('worker:heartbeat', worker);
    }
  }

  private checkWorkerHealth(): void {
    const now = Date.now();
    const timeout = 30000; // 30 seconds

    for (const [id, worker] of this.workers) {
      const elapsed = now - worker.last_heartbeat.getTime();
      if (elapsed > timeout) {
        this.emit('worker:timeout', worker);
        // Don't remove immediately, let socket disconnect handle it
      }
    }
  }

  getWorker(workerId: string): RegisteredWorker | undefined {
    return this.workers.get(workerId);
  }

  getWorkers(): RegisteredWorker[] {
    return Array.from(this.workers.values());
  }

  getWorkersByType(type: string): RegisteredWorker[] {
    return this.getWorkers().filter(w => w.worker_type === type);
  }

  getWorkersWithCapability(capability: string): RegisteredWorker[] {
    return this.getWorkers().filter(w => w.capabilities.includes(capability));
  }

  getIdleDevices(): Array<{ worker_id: string; device: DeviceStatus }> {
    const result: Array<{ worker_id: string; device: DeviceStatus }> = [];
    
    for (const worker of this.workers.values()) {
      for (const device of worker.devices) {
        if (device.state === 'idle') {
          result.push({ worker_id: worker.worker_id, device });
        }
      }
    }
    
    return result;
  }

  getTotalDeviceCount(): number {
    return this.getWorkers().reduce((sum, w) => sum + w.devices.length, 0);
  }

  getIdleDeviceCount(): number {
    return this.getIdleDevices().length;
  }
}
```

**Step 2: Create TaskDispatcher**

```typescript
// apps/desktop-agent/src/manager/TaskDispatcher.ts

import { EventEmitter } from 'events';
import { WorkerRegistry, RegisteredWorker } from './WorkerRegistry';
import { CmdExecuteJob, EvtJobProgress, EvtJobComplete } from '@doai/worker-types';

export interface DispatchedJob {
  job_id: string;
  job_type: string;
  worker_id: string;
  device_ids: string[];
  dispatched_at: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result?: Record<string, unknown>;
  error?: string;
}

export class TaskDispatcher extends EventEmitter {
  private registry: WorkerRegistry;
  private jobs: Map<string, DispatchedJob> = new Map();

  constructor(registry: WorkerRegistry) {
    super();
    this.registry = registry;
  }

  async dispatchJob(
    jobId: string,
    jobType: string,
    params: Record<string, unknown>,
    targetWorkerType?: string,
    targetDeviceCount: number = 1
  ): Promise<{ success: boolean; dispatched_to?: string[]; error?: string }> {
    // Find workers with capability
    let candidates = this.registry.getWorkersWithCapability(jobType);
    
    if (targetWorkerType) {
      candidates = candidates.filter(w => w.worker_type === targetWorkerType);
    }

    if (candidates.length === 0) {
      return { success: false, error: `No workers available for job type: ${jobType}` };
    }

    // Find workers with idle devices
    const dispatchTargets: Array<{ worker: RegisteredWorker; device_ids: string[] }> = [];
    let remainingDevices = targetDeviceCount;

    for (const worker of candidates) {
      if (remainingDevices <= 0) break;

      const idleDevices = worker.devices
        .filter(d => d.state === 'idle')
        .slice(0, remainingDevices);

      if (idleDevices.length > 0) {
        dispatchTargets.push({
          worker,
          device_ids: idleDevices.map(d => d.id),
        });
        remainingDevices -= idleDevices.length;
      }
    }

    if (dispatchTargets.length === 0) {
      return { success: false, error: 'No idle devices available' };
    }

    // Dispatch to workers
    const dispatched: string[] = [];

    for (const target of dispatchTargets) {
      const command: CmdExecuteJob = {
        job_id: jobId,
        job_type: jobType,
        params,
        device_ids: target.device_ids,
      };

      target.worker.socket.emit('cmd:execute_job', command, (response: { accepted: boolean; reason?: string }) => {
        if (response.accepted) {
          dispatched.push(target.worker.worker_id);
        } else {
          console.warn(`Worker ${target.worker.worker_id} rejected job: ${response.reason}`);
        }
      });

      // Track job
      this.jobs.set(`${jobId}:${target.worker.worker_id}`, {
        job_id: jobId,
        job_type: jobType,
        worker_id: target.worker.worker_id,
        device_ids: target.device_ids,
        dispatched_at: new Date(),
        status: 'pending',
        progress: 0,
      });
    }

    return { success: true, dispatched_to: dispatched };
  }

  handleJobProgress(data: EvtJobProgress, workerId: string): void {
    const key = `${data.job_id}:${workerId}`;
    const job = this.jobs.get(key);
    
    if (job) {
      job.status = 'running';
      job.progress = data.progress;
      this.emit('job:progress', job, data);
    }
  }

  handleJobComplete(data: EvtJobComplete, workerId: string): void {
    const key = `${data.job_id}:${workerId}`;
    const job = this.jobs.get(key);
    
    if (job) {
      job.status = data.success ? 'completed' : 'failed';
      job.progress = 100;
      job.result = data.result;
      job.error = data.error;
      this.emit('job:complete', job, data);
    }
  }

  cancelJob(jobId: string): void {
    for (const [key, job] of this.jobs) {
      if (job.job_id === jobId && (job.status === 'pending' || job.status === 'running')) {
        const worker = this.registry.getWorker(job.worker_id);
        if (worker) {
          worker.socket.emit('cmd:cancel_job', { job_id: jobId }, () => {});
        }
        job.status = 'cancelled';
      }
    }
  }

  getJob(jobId: string): DispatchedJob[] {
    const result: DispatchedJob[] = [];
    for (const job of this.jobs.values()) {
      if (job.job_id === jobId) {
        result.push(job);
      }
    }
    return result;
  }

  getActiveJobs(): DispatchedJob[] {
    return Array.from(this.jobs.values()).filter(
      j => j.status === 'pending' || j.status === 'running'
    );
  }
}
```

**Step 3: Create manager index**

```typescript
// apps/desktop-agent/src/manager/index.ts

export { WorkerRegistry } from './WorkerRegistry';
export { TaskDispatcher } from './TaskDispatcher';
export type { RegisteredWorker } from './WorkerRegistry';
export type { DispatchedJob } from './TaskDispatcher';
```

**Step 4: Commit**

```bash
git add apps/desktop-agent/src/manager/
git commit -m "feat: add WorkerRegistry and TaskDispatcher for manager role"
```

---

## Phase 5: Cleanup & Migration

### Task 5.1: Archive Old Desktop-Bot

**Files:**
- Move: `apps/desktop-bot/` → `_archive/desktop-bot-legacy/`

**Step 1: Archive old implementation**

Run:
```bash
mkdir -p _archive/desktop-bot-legacy
mv apps/desktop-bot/* _archive/desktop-bot-legacy/
rmdir apps/desktop-bot
```

**Step 2: Update .gitignore if needed**

Add to `.gitignore`:
```
# Archived legacy code (keep for reference)
# _archive/
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: archive legacy desktop-bot implementation"
```

---

### Task 5.2: Update Workspace Configuration

**Files:**
- Modify: `package.json` (root)
- Modify: `tsconfig.json` (root)

**Step 1: Update root package.json workspaces**

Add to `package.json`:
```json
{
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "build:packages": "npm run build --workspace=packages/worker-types && npm run build --workspace=packages/worker-core",
    "build:bots": "npm run build --workspace=apps/youtube-bot",
    "build:all": "npm run build:packages && npm run build:bots"
  }
}
```

**Step 2: Verify build**

Run:
```bash
npm install
npm run build:all
```

Expected: All packages and apps build successfully

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: update workspace configuration for new architecture"
```

---

## Phase 6: Documentation

### Task 6.1: Update Architecture Documentation

**Files:**
- Create: `docs/ARCHITECTURE-MANAGER-WORKER.md`

**Step 1: Create architecture documentation**

```markdown
# Manager-Worker Architecture

## Overview

The DOAI system uses a Manager-Worker pattern for device automation:

```
┌─────────────────────────────────────────────────────────────┐
│                    Manager (desktop-agent)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ WorkerRegistry│  │ TaskDispatcher│  │ StatusAggregator │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────┐          ┌──────────┐          ┌──────────┐
    │YouTubeBot│          │InstallBot│          │ [Future] │
    └──────────┘          └──────────┘          └──────────┘
```

## Components

### Manager (desktop-agent)
- **WorkerRegistry**: Tracks connected workers and their devices
- **TaskDispatcher**: Routes jobs to appropriate workers
- **StatusAggregator**: Collects and displays system status

### Workers (bots)
- **YouTubeBot**: YouTube video watching automation
- **InstallBot**: App installation automation (future)
- Custom workers can be created by extending `BaseWorker`

## Communication Protocol

### Events (Worker → Manager)
- `evt:register` - Worker registration
- `evt:heartbeat` - Periodic status update (5s interval)
- `evt:job_progress` - Job execution progress
- `evt:job_complete` - Job completion report

### Commands (Manager → Worker)
- `cmd:execute_job` - Execute a job on devices
- `cmd:cancel_job` - Cancel running job
- `cmd:ping` - Health check

## Creating a New Worker

1. Extend `BaseWorker` from `@doai/worker-core`
2. Implement `type` and `capabilities` getters
3. Register job handlers in constructor
4. Build and deploy

Example:
```typescript
import { BaseWorker } from '@doai/worker-core';

class MyWorker extends BaseWorker {
  get type() { return 'custom'; }
  get capabilities() { return [{ name: 'my_job', ... }]; }
  
  constructor(config) {
    super(config);
    this.registerJobHandler(new MyJobHandler());
  }
}
```

## Running the System

1. Start Manager: `npm run start --workspace=apps/desktop-agent`
2. Start Workers: `npm run start --workspace=apps/youtube-bot`

Workers automatically connect to Manager and register themselves.
```

**Step 2: Commit**

```bash
git add docs/ARCHITECTURE-MANAGER-WORKER.md
git commit -m "docs: add Manager-Worker architecture documentation"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `packages/worker-types` builds successfully
- [ ] `packages/worker-core` builds successfully
- [ ] `apps/youtube-bot` builds and starts
- [ ] `apps/desktop-agent` starts with manager capabilities
- [ ] Worker connects to Manager successfully
- [ ] Job dispatch works end-to-end
- [ ] Old `desktop-bot` archived
- [ ] Documentation updated

## Rollback Plan

If issues occur:
1. Restore archived code: `mv _archive/desktop-bot-legacy apps/desktop-bot`
2. Revert workspace changes: `git revert HEAD~N`
3. Old system continues working independently
