// ============================================
// DoAi.Me Worker Core - Minicap Server
// Minicap streaming management
// ============================================

import * as net from 'net';
import { EventEmitter } from 'events';
import { AdbController } from '../AdbController';
import { Logger, defaultLogger } from '../Logger';
import { MinicapManager, MinicapManagerOptions } from './MinicapManager';
import type {
  MinicapFrame,
  MinicapInfo,
  StreamConfig,
  StreamError,
  StreamErrorCode,
} from '@doai/worker-types';

/**
 * Minicap server state
 */
export type MinicapServerState = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * Minicap server configuration
 */
export interface MinicapServerOptions extends MinicapManagerOptions {
  /** Local port for minicap forwarding */
  localPort?: number;
  /** Remote port on device */
  remotePort?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Reconnect attempts on connection loss */
  reconnectAttempts?: number;
  /** Reconnect delay in milliseconds */
  reconnectDelay?: number;
}

/**
 * Frame callback type
 */
export type FrameCallback = (frame: MinicapFrame) => void;

/**
 * Display information from device
 */
interface DisplayInfo {
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

/**
 * Minicap binary protocol header (24 bytes)
 */
interface MinicapBanner {
  version: number;        // 1 byte
  headerSize: number;     // 1 byte
  pid: number;            // 4 bytes (little endian)
  realWidth: number;      // 4 bytes (little endian)
  realHeight: number;     // 4 bytes (little endian)
  virtualWidth: number;   // 4 bytes (little endian)
  virtualHeight: number;  // 4 bytes (little endian)
  orientation: number;    // 1 byte
  quirks: number;         // 1 byte
}

/**
 * Minicap Server
 * Manages minicap process and screen streaming
 * 
 * @example
 * ```typescript
 * const server = new MinicapServer(adb, { minicapPath: './vendor/minicap' });
 * 
 * server.onFrame((frame) => {
 *   console.log(`Frame ${frame.frameNumber}: ${frame.size} bytes`);
 * });
 * 
 * await server.start('device-serial', { 
 *   deviceId: 'device-serial',
 *   width: 720, 
 *   height: 0, 
 *   frameRate: 30, 
 *   quality: 80,
 *   protocol: 'socket',
 *   port: 1717,
 *   enableAudio: false,
 * });
 * ```
 */
export class MinicapServer extends EventEmitter {
  private adb: AdbController;
  private logger: Logger;
  private manager: MinicapManager;
  
  private state: MinicapServerState = 'idle';
  private currentSerial: string | null = null;
  private currentConfig: StreamConfig | null = null;
  private minicapInfo: MinicapInfo | null = null;
  
  private socket: net.Socket | null = null;
  private localPort: number;
  private remotePort: number;
  private connectionTimeout: number;
  private reconnectAttempts: number;
  private reconnectDelay: number;
  
  private frameCallbacks: Set<FrameCallback> = new Set();
  private frameNumber: number = 0;
  private banner: MinicapBanner | null = null;
  private readBuffer: Buffer = Buffer.alloc(0);
  private bannerParsed: boolean = false;

  constructor(adb: AdbController, options: MinicapServerOptions = {}) {
    super();
    this.adb = adb;
    this.logger = options.logger ?? defaultLogger.child('MinicapServer');
    this.manager = new MinicapManager(options);
    
    this.localPort = options.localPort ?? 1717;
    this.remotePort = options.remotePort ?? 1717;
    this.connectionTimeout = options.connectionTimeout ?? 10000;
    this.reconnectAttempts = options.reconnectAttempts ?? 3;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
  }

  /**
   * Get current server state
   */
  getState(): MinicapServerState {
    return this.state;
  }

  /**
   * Get minicap info (available after start)
   */
  getMinicapInfo(): MinicapInfo | null {
    return this.minicapInfo;
  }

  /**
   * Register a frame callback
   * @param callback Function to call on each frame
   * @returns Unsubscribe function
   */
  onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.add(callback);
    return () => {
      this.frameCallbacks.delete(callback);
    };
  }

  /**
   * Get display information from device
   * @param serial Device serial number
   * @returns Display info
   */
  private async getDisplayInfo(serial: string): Promise<DisplayInfo> {
    const output = await this.adb.executeShell(serial, 'dumpsys display | grep -E "mDisplayWidth|mDisplayHeight|mRotation"');
    
    let width = 1080;
    let height = 1920;
    let rotation: 0 | 90 | 180 | 270 = 0;
    
    const widthMatch = output.match(/mDisplayWidth=(\d+)/);
    const heightMatch = output.match(/mDisplayHeight=(\d+)/);
    const rotationMatch = output.match(/mRotation=(\d)/);
    
    if (widthMatch) width = parseInt(widthMatch[1], 10);
    if (heightMatch) height = parseInt(heightMatch[1], 10);
    if (rotationMatch) {
      const rot = parseInt(rotationMatch[1], 10);
      rotation = (rot * 90) as 0 | 90 | 180 | 270;
    }
    
    // Fallback: try wm size
    if (!widthMatch || !heightMatch) {
      const wmOutput = await this.adb.executeShell(serial, 'wm size');
      const wmMatch = wmOutput.match(/(\d+)x(\d+)/);
      if (wmMatch) {
        width = parseInt(wmMatch[1], 10);
        height = parseInt(wmMatch[2], 10);
      }
    }
    
    return { width, height, rotation };
  }

  /**
   * Start minicap streaming
   * @param serial Device serial number
   * @param config Stream configuration
   */
  async start(serial: string, config: StreamConfig): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start: server is in ${this.state} state`);
    }

    this.state = 'starting';
    this.currentSerial = serial;
    this.currentConfig = config;
    this.frameNumber = 0;
    this.bannerParsed = false;
    this.readBuffer = Buffer.alloc(0);

    try {
      this.logger.info('Starting minicap server', { serial, config });

      // Get display info
      const displayInfo = await this.getDisplayInfo(serial);
      this.logger.debug('Display info', { serial, displayInfo });

      // Calculate virtual dimensions
      let virtualWidth = config.width || displayInfo.width;
      let virtualHeight = config.height || displayInfo.height;
      
      // Auto-calculate height if set to 0
      if (config.height === 0 && config.width > 0) {
        const aspectRatio = displayInfo.height / displayInfo.width;
        virtualHeight = Math.round(config.width * aspectRatio);
      }

      // Deploy minicap if needed
      const deployInfo = await this.manager.deployToDevice(serial, this.adb);
      this.logger.debug('Minicap deployed', { deployInfo });

      // Build minicap arguments
      const minicapArgs = [
        `-P ${displayInfo.width}x${displayInfo.height}@${virtualWidth}x${virtualHeight}/${displayInfo.rotation}`,
        `-Q ${config.quality}`,
      ].join(' ');

      // Set up port forwarding
      await this.adb.forward(serial, this.localPort, this.remotePort);
      this.logger.debug('Port forwarding established', { 
        localPort: this.localPort, 
        remotePort: this.remotePort 
      });

      // Start minicap process on device
      const minicapCmd = `LD_LIBRARY_PATH=/data/local/tmp /data/local/tmp/minicap ${minicapArgs}`;
      this.logger.debug('Starting minicap process', { command: minicapCmd });
      
      // Start minicap in background (fire and forget)
      this.adb.executeShell(serial, minicapCmd).catch((err) => {
        // Minicap exited - this is expected when we stop
        if (this.state === 'running') {
          this.logger.warn('Minicap process exited unexpectedly', { error: err.message });
          this.handleError('MINICAP_START_FAILED', err.message, false);
        }
      });

      // Wait for minicap to start
      await this.delay(500);

      // Connect to minicap socket
      await this.connectToMinicap();

      this.state = 'running';
      this.logger.info('Minicap server started', { serial });

    } catch (error) {
      this.state = 'error';
      const err = error as Error;
      this.logger.errorWithStack('Failed to start minicap server', err, { serial });
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Connect to minicap socket
   */
  private async connectToMinicap(attempt: number = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let connected = false;

      const timeout = setTimeout(() => {
        if (!connected) {
          socket.destroy();
          if (attempt < this.reconnectAttempts) {
            this.logger.debug('Connection timeout, retrying', { attempt });
            this.delay(this.reconnectDelay)
              .then(() => this.connectToMinicap(attempt + 1))
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error('Failed to connect to minicap after multiple attempts'));
          }
        }
      }, this.connectionTimeout);

      socket.on('connect', () => {
        connected = true;
        clearTimeout(timeout);
        this.socket = socket;
        this.logger.debug('Connected to minicap socket');
        resolve();
      });

      socket.on('data', (data) => {
        this.handleData(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        if (!connected) {
          if (attempt < this.reconnectAttempts) {
            this.logger.debug('Connection error, retrying', { attempt, error: err.message });
            this.delay(this.reconnectDelay)
              .then(() => this.connectToMinicap(attempt + 1))
              .then(resolve)
              .catch(reject);
          } else {
            reject(err);
          }
        } else {
          this.handleError('CONNECTION_LOST', err.message, true);
        }
      });

      socket.on('close', () => {
        if (this.state === 'running') {
          this.logger.warn('Minicap socket closed');
          this.handleError('CONNECTION_LOST', 'Socket closed', true);
        }
      });

      socket.connect(this.localPort, 'localhost');
    });
  }

  /**
   * Handle incoming data from minicap
   * @param data Raw data buffer
   */
  private handleData(data: Buffer): void {
    this.readBuffer = Buffer.concat([this.readBuffer, data]);

    // Parse banner first (24 bytes)
    if (!this.bannerParsed) {
      if (this.readBuffer.length >= 24) {
        this.parseBanner();
        this.bannerParsed = true;
      } else {
        return;
      }
    }

    // Parse frames
    this.parseFrames();
  }

  /**
   * Parse minicap banner from buffer
   */
  private parseBanner(): void {
    const buffer = this.readBuffer;
    
    this.banner = {
      version: buffer.readUInt8(0),
      headerSize: buffer.readUInt8(1),
      pid: buffer.readUInt32LE(2),
      realWidth: buffer.readUInt32LE(6),
      realHeight: buffer.readUInt32LE(10),
      virtualWidth: buffer.readUInt32LE(14),
      virtualHeight: buffer.readUInt32LE(18),
      orientation: buffer.readUInt8(22),
      quirks: buffer.readUInt8(23),
    };

    this.minicapInfo = {
      version: this.banner.version,
      realWidth: this.banner.realWidth,
      realHeight: this.banner.realHeight,
      virtualWidth: this.banner.virtualWidth,
      virtualHeight: this.banner.virtualHeight,
      orientation: (this.banner.orientation * 90) as 0 | 90 | 180 | 270,
      quirks: this.banner.quirks,
    };

    this.logger.debug('Parsed minicap banner', { banner: this.banner });
    
    // Remove banner from buffer
    this.readBuffer = this.readBuffer.slice(24);

    // Emit info event
    this.emit('info', this.minicapInfo);
  }

  /**
   * Parse frames from buffer
   */
  private parseFrames(): void {
    // Frame format: 4 bytes size (little endian) + JPEG data
    while (this.readBuffer.length >= 4) {
      const frameSize = this.readBuffer.readUInt32LE(0);
      
      if (this.readBuffer.length < 4 + frameSize) {
        // Not enough data for complete frame
        break;
      }

      // Extract frame data
      const frameData = this.readBuffer.slice(4, 4 + frameSize);
      this.readBuffer = this.readBuffer.slice(4 + frameSize);

      // Create frame object
      const frame: MinicapFrame = {
        frameNumber: this.frameNumber++,
        timestamp: Date.now(),
        width: this.banner?.virtualWidth ?? 0,
        height: this.banner?.virtualHeight ?? 0,
        format: 'jpeg',
        data: new Uint8Array(frameData),
        size: frameSize,
        quality: this.currentConfig?.quality,
      };

      // Notify callbacks
      this.frameCallbacks.forEach((callback) => {
        try {
          callback(frame);
        } catch (err) {
          this.logger.warn('Frame callback error', { error: (err as Error).message });
        }
      });

      // Emit frame event
      this.emit('frame', frame);
    }
  }

  /**
   * Handle streaming error
   * @param code Error code
   * @param message Error message
   * @param recoverable Whether the error is recoverable
   */
  private handleError(code: StreamErrorCode, message: string, recoverable: boolean): void {
    const error: StreamError = {
      deviceId: this.currentSerial ?? '',
      code,
      message,
      recoverable,
      timestamp: Date.now(),
    };

    this.emit('error', error);
    this.logger.error('Stream error', { error });

    if (!recoverable) {
      this.stop().catch(() => {});
    }
  }

  /**
   * Stop minicap streaming
   */
  async stop(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';
    this.logger.info('Stopping minicap server', { serial: this.currentSerial });

    await this.cleanup();

    this.state = 'idle';
    this.logger.info('Minicap server stopped');
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Close socket
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    // Kill minicap process on device
    if (this.currentSerial) {
      try {
        await this.adb.executeShell(this.currentSerial, 'pkill -9 minicap');
      } catch {
        // Ignore errors - process may already be dead
      }
    }

    // Reset state
    this.banner = null;
    this.bannerParsed = false;
    this.readBuffer = Buffer.alloc(0);
    this.minicapInfo = null;
    this.currentSerial = null;
    this.currentConfig = null;
  }

  /**
   * Utility delay function
   * @param ms Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default MinicapServer;
