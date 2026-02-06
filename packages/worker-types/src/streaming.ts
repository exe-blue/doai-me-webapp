/**
 * Screen streaming type definitions
 */

// ============================================================================
// Minicap Frame
// ============================================================================

/**
 * A single frame from the minicap screen capture
 */
export interface MinicapFrame {
  /** Frame sequence number */
  frameNumber: number;
  /** Frame timestamp */
  timestamp: number;
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
  /** Frame format */
  format: 'jpeg' | 'png' | 'raw';
  /** Frame data as buffer */
  data: Uint8Array;
  /** Frame size in bytes */
  size: number;
  /** Quality setting used (for JPEG) */
  quality?: number;
}

/**
 * Minicap connection information
 */
export interface MinicapInfo {
  /** Minicap version */
  version: number;
  /** Device real width */
  realWidth: number;
  /** Device real height */
  realHeight: number;
  /** Virtual width (requested) */
  virtualWidth: number;
  /** Virtual height (requested) */
  virtualHeight: number;
  /** Display orientation (0, 90, 180, 270) */
  orientation: 0 | 90 | 180 | 270;
  /** Quirks flags */
  quirks: number;
}

// ============================================================================
// Stream Configuration
// ============================================================================

/**
 * Configuration for screen streaming
 */
export interface StreamConfig {
  /** Target device ID */
  deviceId: string;
  /** Desired frame width (0 = native) */
  width: number;
  /** Desired frame height (0 = native) */
  height: number;
  /** Target frame rate */
  frameRate: number;
  /** JPEG quality (1-100) */
  quality: number;
  /** Stream protocol */
  protocol: 'websocket' | 'socket' | 'http';
  /** Server port */
  port: number;
  /** Whether to enable audio streaming */
  enableAudio: boolean;
  /** Audio sample rate (if enabled) */
  audioSampleRate?: number;
  /** Maximum bitrate in kbps (0 = unlimited) */
  maxBitrate?: number;
  /** Encoder to use */
  encoder?: 'hardware' | 'software';
}

/**
 * Default stream configuration values
 */
export const DEFAULT_STREAM_CONFIG: Omit<StreamConfig, 'deviceId'> = {
  width: 720,
  height: 0, // Auto-calculate based on aspect ratio
  frameRate: 30,
  quality: 80,
  protocol: 'websocket',
  port: 9002,
  enableAudio: false,
  maxBitrate: 0,
  encoder: 'hardware',
};

// ============================================================================
// Screen Stream Events
// ============================================================================

/**
 * Events emitted by the screen streaming service
 */
export interface ScreenStreamEvents {
  /**
   * Emitted when streaming starts
   */
  'stream:start': (info: StreamStartInfo) => void;
  
  /**
   * Emitted when streaming stops
   */
  'stream:stop': (info: StreamStopInfo) => void;
  
  /**
   * Emitted for each new frame
   */
  'stream:frame': (frame: MinicapFrame) => void;
  
  /**
   * Emitted when an error occurs
   */
  'stream:error': (error: StreamError) => void;
  
  /**
   * Emitted when stream quality changes
   */
  'stream:quality_change': (info: QualityChangeInfo) => void;
  
  /**
   * Emitted with stream statistics
   */
  'stream:stats': (stats: StreamStats) => void;
}

/**
 * Information provided when stream starts
 */
export interface StreamStartInfo {
  /** Device ID */
  deviceId: string;
  /** Stream session ID */
  sessionId: string;
  /** Actual stream configuration */
  config: StreamConfig;
  /** Minicap information */
  minicapInfo: MinicapInfo;
  /** Start timestamp */
  startedAt: number;
}

/**
 * Information provided when stream stops
 */
export interface StreamStopInfo {
  /** Device ID */
  deviceId: string;
  /** Stream session ID */
  sessionId: string;
  /** Stop reason */
  reason: 'requested' | 'error' | 'device_disconnected' | 'timeout';
  /** Total frames sent */
  totalFrames: number;
  /** Stream duration in milliseconds */
  durationMs: number;
  /** Stop timestamp */
  stoppedAt: number;
}

/**
 * Stream error information
 */
export interface StreamError {
  /** Device ID */
  deviceId: string;
  /** Stream session ID */
  sessionId?: string;
  /** Error code */
  code: StreamErrorCode;
  /** Error message */
  message: string;
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** Timestamp */
  timestamp: number;
}

/**
 * Possible stream error codes
 */
export type StreamErrorCode =
  | 'MINICAP_NOT_FOUND'
  | 'MINICAP_START_FAILED'
  | 'CONNECTION_LOST'
  | 'FRAME_DECODE_ERROR'
  | 'BUFFER_OVERFLOW'
  | 'DEVICE_DISCONNECTED'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN_ERROR';

/**
 * Quality change information
 */
export interface QualityChangeInfo {
  /** Device ID */
  deviceId: string;
  /** Previous quality setting */
  previousQuality: number;
  /** New quality setting */
  newQuality: number;
  /** Reason for change */
  reason: 'bandwidth' | 'cpu' | 'manual';
  /** Timestamp */
  timestamp: number;
}

/**
 * Stream statistics
 */
export interface StreamStats {
  /** Device ID */
  deviceId: string;
  /** Stream session ID */
  sessionId: string;
  /** Frames per second (current) */
  fps: number;
  /** Average frame size in bytes */
  avgFrameSize: number;
  /** Total bytes transferred */
  totalBytes: number;
  /** Total frames sent */
  totalFrames: number;
  /** Dropped frames count */
  droppedFrames: number;
  /** Current bitrate in kbps */
  bitrate: number;
  /** Stream latency in milliseconds */
  latencyMs: number;
  /** Timestamp */
  timestamp: number;
}
