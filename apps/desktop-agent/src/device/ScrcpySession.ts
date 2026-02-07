/**
 * ScrcpySession — 단일 디바이스 scrcpy 세션
 *
 * scrcpy-server JAR을 디바이스에 푸시하고 실행한 뒤,
 * video/control 소켓을 연결하여 화면 스트리밍 + 입력 제어를 수행.
 *
 * 사용 흐름:
 *   1. session = new ScrcpySession(serial, adbController)
 *   2. await session.start()   → JAR push + server launch + socket connect
 *   3. session.tap(x, y)       → control socket으로 터치 전송
 *   4. session.on('frame', cb) → H.264 프레임 수신
 *   5. await session.stop()    → 정리
 */

import net from 'net';
import { EventEmitter } from 'events';
import { execFile, ChildProcess, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { AdbController, getAdbController } from './AdbController';
import {
  ScrcpyProtocol,
  AndroidMotionEventAction,
  AndroidKeyEventAction,
  ScreenPowerMode,
  type VideoMeta,
  type FrameHeader,
} from './ScrcpyProtocol';

const execFileAsync = promisify(execFile);

// ============================================
// Types
// ============================================

export type ScrcpySessionState =
  | 'idle'
  | 'starting'
  | 'connected'
  | 'streaming'
  | 'error'
  | 'stopped';

export interface ScrcpySessionOptions {
  /** scrcpy-server JAR 경로 (로컬) */
  serverJarPath: string;
  /** 최대 해상도 (0 = 원본) */
  maxSize?: number;
  /** 최대 FPS */
  maxFps?: number;
  /** 비디오 비트레이트 (bps) */
  videoBitRate?: number;
  /** 오디오 활성화 */
  audio?: boolean;
  /** scrcpy server 연결 포트 (ADB forward) */
  tunnelPort?: number;
  /** 서버 버전 문자열 (client-server 일치 필요) */
  serverVersion?: string;
  /** ADB 바이너리 경로 */
  adbPath?: string;
}

export interface ScrcpySessionEvents {
  /** H.264 NAL unit 수신 */
  frame: (data: Buffer, header: FrameHeader) => void;
  /** 비디오 메타데이터 수신 (최초 1회) */
  videoMeta: (meta: VideoMeta) => void;
  /** 세션 상태 변경 */
  stateChanged: (state: ScrcpySessionState) => void;
  /** 디바이스 메시지 (clipboard 등) */
  deviceMessage: (msg: { type: number; payload: unknown }) => void;
  /** 에러 */
  error: (err: Error) => void;
}

const REMOTE_SERVER_PATH = '/data/local/tmp/scrcpy-server.jar';
const SCRCPY_CLASS = 'com.genymobile.scrcpy.Server';
const DEFAULT_TUNNEL_PORT = 27183;
const DEFAULT_SERVER_VERSION = '2.7';
const DEFAULT_MAX_SIZE = 720;
const DEFAULT_MAX_FPS = 30;
const DEFAULT_BIT_RATE = 2_000_000;

// ============================================
// ScrcpySession
// ============================================

export class ScrcpySession extends EventEmitter {
  readonly deviceId: string;
  readonly adbSerial: string;

  private adb: AdbController;
  private adbPath: string;
  private options: Required<ScrcpySessionOptions>;

  private _state: ScrcpySessionState = 'idle';
  private serverProcess: ChildProcess | null = null;
  private videoSocket: net.Socket | null = null;
  private controlSocket: net.Socket | null = null;

  /** 비디오 메타 (connected 이후 설정) */
  private videoMeta: VideoMeta | null = null;

  /** 비디오 소켓 파싱 상태 */
  private videoBuffer: Buffer = Buffer.alloc(0);
  private videoMetaReceived = false;
  private currentFrameHeader: FrameHeader | null = null;
  private currentFrameData: Buffer = Buffer.alloc(0);

  constructor(
    deviceId: string,
    adbSerial: string,
    options: ScrcpySessionOptions
  ) {
    super();
    this.deviceId = deviceId;
    this.adbSerial = adbSerial;
    this.adb = getAdbController();
    this.adbPath = options.adbPath ?? 'adb';

    this.options = {
      serverJarPath: options.serverJarPath,
      maxSize: options.maxSize ?? DEFAULT_MAX_SIZE,
      maxFps: options.maxFps ?? DEFAULT_MAX_FPS,
      videoBitRate: options.videoBitRate ?? DEFAULT_BIT_RATE,
      audio: options.audio ?? false,
      tunnelPort: options.tunnelPort ?? DEFAULT_TUNNEL_PORT,
      serverVersion: options.serverVersion ?? DEFAULT_SERVER_VERSION,
      adbPath: options.adbPath ?? 'adb',
    };
  }

  // ------------------------------------
  // Public API
  // ------------------------------------

  get state(): ScrcpySessionState {
    return this._state;
  }

  get screenWidth(): number {
    return this.videoMeta?.width ?? 0;
  }

  get screenHeight(): number {
    return this.videoMeta?.height ?? 0;
  }

  /**
   * scrcpy 세션 시작
   *  1. JAR push
   *  2. ADB reverse tunnel 설정
   *  3. scrcpy-server 실행
   *  4. video + control 소켓 연결
   */
  async start(): Promise<void> {
    if (this._state !== 'idle' && this._state !== 'stopped' && this._state !== 'error') {
      throw new Error(`Cannot start session in state: ${this._state}`);
    }

    this.setState('starting');

    try {
      // 1. Push scrcpy-server JAR
      logger.info('[ScrcpySession] Pushing server JAR', {
        deviceId: this.deviceId,
        jar: this.options.serverJarPath,
      });
      await this.adb.execute(this.adbSerial, `push ${this.options.serverJarPath} ${REMOTE_SERVER_PATH}`);

      // 2. Setup ADB reverse tunnel (device connects back to agent)
      const abstractSocket = `scrcpy_${this.deviceId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      await this.adb.execute(this.adbSerial, `reverse localabstract:${abstractSocket} tcp:${this.options.tunnelPort}`);

      // 3. Start TCP server to accept connections
      const sockets = await this.acceptConnections();

      // 4. Launch scrcpy-server on device
      this.launchServer(abstractSocket);

      // 5. Wait for video + control sockets
      const { videoSocket, controlSocket } = await sockets;
      this.videoSocket = videoSocket;
      this.controlSocket = controlSocket;

      // 6. Setup socket handlers
      this.setupVideoSocket();
      this.setupControlSocket();

      this.setState('connected');
      logger.info('[ScrcpySession] Session started', { deviceId: this.deviceId });

    } catch (err) {
      this.setState('error');
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      logger.error('[ScrcpySession] Failed to start', {
        deviceId: this.deviceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 세션 종료
   */
  async stop(): Promise<void> {
    logger.info('[ScrcpySession] Stopping', { deviceId: this.deviceId });

    // 서버 프로세스 종료
    if (this.serverProcess && !this.serverProcess.killed) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    // 소켓 종료
    this.videoSocket?.destroy();
    this.videoSocket = null;

    this.controlSocket?.destroy();
    this.controlSocket = null;

    // ADB reverse 정리
    try {
      await this.adb.execute(this.adbSerial, 'reverse --remove-all');
    } catch {
      // ignore cleanup errors
    }

    // 상태 초기화
    this.videoMetaReceived = false;
    this.videoMeta = null;
    this.videoBuffer = Buffer.alloc(0);
    this.currentFrameHeader = null;
    this.currentFrameData = Buffer.alloc(0);

    this.setState('stopped');
  }

  // ------------------------------------
  // Input Control (Control Socket)
  // ------------------------------------

  /**
   * 터치 (탭)
   */
  async tap(x: number, y: number): Promise<void> {
    this.ensureControlSocket();
    const buffers = ScrcpyProtocol.serializeTap(x, y, this.screenWidth, this.screenHeight);
    for (const buf of buffers) {
      this.controlSocket!.write(buf);
    }
    // DOWN과 UP 사이에 약간의 지연
    await this.sleep(50);
  }

  /**
   * 스와이프
   */
  async swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs = 300,
    steps = 10
  ): Promise<void> {
    this.ensureControlSocket();
    const buffers = ScrcpyProtocol.serializeSwipe(
      x1, y1, x2, y2,
      this.screenWidth, this.screenHeight,
      steps
    );

    const intervalMs = durationMs / (steps + 2); // +2 for DOWN and UP

    for (const buf of buffers) {
      this.controlSocket!.write(buf);
      await this.sleep(intervalMs);
    }
  }

  /**
   * 길게 누르기
   */
  async longPress(x: number, y: number, durationMs = 1000): Promise<void> {
    this.ensureControlSocket();
    const down = ScrcpyProtocol.serializeLongPressDown(x, y, this.screenWidth, this.screenHeight);
    this.controlSocket!.write(down);

    await this.sleep(durationMs);

    const up = ScrcpyProtocol.serializeLongPressUp(x, y, this.screenWidth, this.screenHeight);
    this.controlSocket!.write(up);
  }

  /**
   * 텍스트 입력
   */
  injectText(text: string): void {
    this.ensureControlSocket();
    this.controlSocket!.write(ScrcpyProtocol.serializeText(text));
  }

  /**
   * 키 입력 (DOWN + UP)
   */
  async injectKey(keycode: number, metaState = 0): Promise<void> {
    this.ensureControlSocket();

    this.controlSocket!.write(ScrcpyProtocol.serializeKey({
      action: AndroidKeyEventAction.DOWN,
      keycode,
      repeat: 0,
      metaState,
    }));

    await this.sleep(30);

    this.controlSocket!.write(ScrcpyProtocol.serializeKey({
      action: AndroidKeyEventAction.UP,
      keycode,
      repeat: 0,
      metaState,
    }));
  }

  /**
   * 스크롤
   */
  injectScroll(x: number, y: number, dx: number, dy: number): void {
    this.ensureControlSocket();
    this.controlSocket!.write(ScrcpyProtocol.serializeScroll({
      x,
      y,
      screenWidth: this.screenWidth,
      screenHeight: this.screenHeight,
      horizontalScroll: dx,
      verticalScroll: dy,
      buttons: 0,
    }));
  }

  /**
   * 뒤로 가기
   */
  pressBack(): void {
    this.ensureControlSocket();
    this.controlSocket!.write(ScrcpyProtocol.serializeBackOrScreenOn());
  }

  /**
   * 화면 전원 모드
   */
  setScreenPowerMode(on: boolean): void {
    this.ensureControlSocket();
    this.controlSocket!.write(
      ScrcpyProtocol.serializeSetScreenPowerMode(on ? ScreenPowerMode.NORMAL : ScreenPowerMode.OFF)
    );
  }

  /**
   * 디바이스 회전
   */
  rotateDevice(): void {
    this.ensureControlSocket();
    this.controlSocket!.write(ScrcpyProtocol.serializeRotateDevice());
  }

  /**
   * 클립보드 설정
   */
  setClipboard(text: string, paste = false): void {
    this.ensureControlSocket();
    this.controlSocket!.write(ScrcpyProtocol.serializeSetClipboard(text, paste));
  }

  // ------------------------------------
  // Private: Server Launch
  // ------------------------------------

  private launchServer(abstractSocket: string): void {
    const args = [
      '-s', this.adbSerial,
      'shell',
      `CLASSPATH=${REMOTE_SERVER_PATH}`,
      'app_process', '/',
      SCRCPY_CLASS,
      this.options.serverVersion,
      `tunnel_forward=true`,
      `audio=${this.options.audio}`,
      `video=true`,
      `control=true`,
      `max_size=${this.options.maxSize}`,
      `max_fps=${this.options.maxFps}`,
      `video_bit_rate=${this.options.videoBitRate}`,
      `send_frame_meta=true`,
      `send_device_meta=true`,
      `send_dummy_byte=true`,
      `send_codec_meta=true`,
    ];

    logger.debug('[ScrcpySession] Launching server', {
      deviceId: this.deviceId,
      args: args.join(' '),
    });

    this.serverProcess = spawn(this.adbPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.serverProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        logger.debug('[ScrcpySession] server stderr', { deviceId: this.deviceId, msg });
      }
    });

    this.serverProcess.on('exit', (code) => {
      logger.info('[ScrcpySession] Server process exited', {
        deviceId: this.deviceId,
        code,
      });
      if (this._state === 'streaming' || this._state === 'connected') {
        this.setState('error');
        this.emit('error', new Error(`scrcpy-server exited with code ${code}`));
      }
    });

    this.serverProcess.on('error', (err) => {
      logger.error('[ScrcpySession] Server process error', {
        deviceId: this.deviceId,
        error: err.message,
      });
      this.setState('error');
      this.emit('error', err);
    });
  }

  // ------------------------------------
  // Private: Socket Connection
  // ------------------------------------

  /**
   * TCP 서버를 열고 scrcpy-server로부터 2개 연결(video + control)을 수락
   * forward 모드: agent가 listen → device가 connect
   */
  private acceptConnections(): Promise<{ videoSocket: net.Socket; controlSocket: net.Socket }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('Timeout waiting for scrcpy connections'));
      }, 15000);

      let videoSocket: net.Socket | null = null;
      let controlSocket: net.Socket | null = null;
      let connectionCount = 0;

      const server = net.createServer((socket) => {
        connectionCount++;

        if (connectionCount === 1) {
          // 첫 번째 연결 = video socket
          videoSocket = socket;
          logger.debug('[ScrcpySession] Video socket connected', { deviceId: this.deviceId });
        } else if (connectionCount === 2) {
          // 두 번째 연결 = control socket
          controlSocket = socket;
          logger.debug('[ScrcpySession] Control socket connected', { deviceId: this.deviceId });

          // 두 소켓 모두 연결 완료
          clearTimeout(timeout);
          server.close();
          resolve({ videoSocket: videoSocket!, controlSocket });
        }
      });

      server.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      server.listen(this.options.tunnelPort, '127.0.0.1', () => {
        logger.debug('[ScrcpySession] Listening for scrcpy connections', {
          deviceId: this.deviceId,
          port: this.options.tunnelPort,
        });
      });
    });
  }

  // ------------------------------------
  // Private: Video Socket Processing
  // ------------------------------------

  private setupVideoSocket(): void {
    if (!this.videoSocket) return;

    this.videoSocket.on('data', (chunk: Buffer) => {
      this.videoBuffer = Buffer.concat([this.videoBuffer, chunk]);
      this.processVideoBuffer();
    });

    this.videoSocket.on('error', (err) => {
      logger.error('[ScrcpySession] Video socket error', {
        deviceId: this.deviceId,
        error: err.message,
      });
      this.emit('error', err);
    });

    this.videoSocket.on('close', () => {
      logger.debug('[ScrcpySession] Video socket closed', { deviceId: this.deviceId });
    });
  }

  private processVideoBuffer(): void {
    // Phase 1: dummy byte (1 byte, forward mode)
    // Phase 2: device meta (64 bytes device name)
    // Phase 3: codec meta (12 bytes)
    // Phase 4: frame headers + data

    // Step 1: Skip dummy byte (if not yet received meta)
    if (!this.videoMetaReceived) {
      // Dummy byte + device name (64 bytes) + codec meta (12 bytes) = 77 bytes min
      if (this.videoBuffer.length < 77) return;

      // Skip dummy byte (1 byte)
      let offset = 1;

      // Skip device name (64 bytes, null-terminated UTF-8)
      const deviceName = this.videoBuffer.subarray(offset, offset + 64).toString('utf-8').replace(/\0+$/, '');
      offset += 64;
      logger.debug('[ScrcpySession] Device name', { deviceId: this.deviceId, deviceName });

      // Parse codec meta (12 bytes: codec u32, width u32, height u32)
      const metaData = this.videoBuffer.subarray(offset, offset + 12);
      this.videoMeta = ScrcpyProtocol.parseVideoMeta(metaData);
      offset += 12;

      logger.info('[ScrcpySession] Video meta received', {
        deviceId: this.deviceId,
        codec: ScrcpyProtocol.codecIdToString(this.videoMeta.codecId),
        width: this.videoMeta.width,
        height: this.videoMeta.height,
      });

      this.emit('videoMeta', this.videoMeta);
      this.videoMetaReceived = true;
      this.setState('streaming');

      // Remove consumed bytes
      this.videoBuffer = this.videoBuffer.subarray(offset);
    }

    // Step 2: Parse frame headers and data
    while (this.videoBuffer.length > 0) {
      if (!this.currentFrameHeader) {
        // Need 12 bytes for frame header
        if (this.videoBuffer.length < 12) return;

        this.currentFrameHeader = ScrcpyProtocol.parseFrameHeader(this.videoBuffer);
        this.videoBuffer = this.videoBuffer.subarray(12);
        this.currentFrameData = Buffer.alloc(0);
      }

      // Accumulate frame data
      const remaining = this.currentFrameHeader.packetSize - this.currentFrameData.length;
      if (this.videoBuffer.length < remaining) {
        // Not enough data yet — consume what we can
        this.currentFrameData = Buffer.concat([this.currentFrameData, this.videoBuffer]);
        this.videoBuffer = Buffer.alloc(0);
        return;
      }

      // Complete frame
      this.currentFrameData = Buffer.concat([
        this.currentFrameData,
        this.videoBuffer.subarray(0, remaining),
      ]);
      this.videoBuffer = this.videoBuffer.subarray(remaining);

      // Emit frame
      this.emit('frame', this.currentFrameData, this.currentFrameHeader);
      this.currentFrameHeader = null;
      this.currentFrameData = Buffer.alloc(0);
    }
  }

  // ------------------------------------
  // Private: Control Socket Processing
  // ------------------------------------

  private setupControlSocket(): void {
    if (!this.controlSocket) return;

    this.controlSocket.on('data', (chunk: Buffer) => {
      // Device messages (clipboard, ACK) — parse and emit
      const msg = ScrcpyProtocol.parseDeviceMessage(chunk);
      if (msg) {
        this.emit('deviceMessage', msg);
      }
    });

    this.controlSocket.on('error', (err) => {
      logger.error('[ScrcpySession] Control socket error', {
        deviceId: this.deviceId,
        error: err.message,
      });
    });

    this.controlSocket.on('close', () => {
      logger.debug('[ScrcpySession] Control socket closed', { deviceId: this.deviceId });
    });
  }

  // ------------------------------------
  // Private: Helpers
  // ------------------------------------

  private ensureControlSocket(): void {
    if (!this.controlSocket || this.controlSocket.destroyed) {
      throw new Error(`Control socket not available (state: ${this._state})`);
    }
  }

  private setState(state: ScrcpySessionState): void {
    if (this._state === state) return;
    this._state = state;
    this.emit('stateChanged', state);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ScrcpySession;
