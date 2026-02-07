/**
 * FrameProcessor — H.264 프레임 → JPEG 썸네일 변환
 *
 * ScrcpySession에서 수신한 H.264 NAL 유닛에서 키프레임(SPS/PPS + IDR)을 감지하고,
 * 저해상도 JPEG 썸네일로 변환하여 대시보드 그리드 뷰에 전송.
 *
 * 변환 전략:
 * - 100대 그리드 모드: 1FPS, 160px, quality=60 → ~3KB/frame
 * - 포커스 모드: 원본 H.264 스트림 그대로 전달 (변환 없음)
 *
 * 의존성:
 * - ffmpeg(child_process)를 사용한 실시간 디코딩 + JPEG 인코딩
 * - 대안: sharp (raw → JPEG 만 지원, H.264 디코딩 불가)
 *
 * 따라서 이 모듈은 ffmpeg 기반 접근을 사용:
 * - 키프레임 수신 → ffmpeg stdin pipe → JPEG stdout pipe
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import type { FrameHeader } from './ScrcpyProtocol';

// ============================================
// Types
// ============================================

export interface FrameProcessorConfig {
  /** 썸네일 너비 (default 160) */
  thumbnailWidth?: number;
  /** JPEG quality (1-100, default 60) */
  jpegQuality?: number;
  /** 프레임 레이트 제한 (default 1) */
  maxFps?: number;
  /** ffmpeg 바이너리 경로 */
  ffmpegPath?: string;
}

export interface ThumbnailFrame {
  deviceId: string;
  data: Buffer;       // JPEG bytes
  width: number;
  height: number;
  timestamp: number;
}

// ============================================
// FrameProcessor
// ============================================

export class FrameProcessor extends EventEmitter {
  private deviceId: string;
  private config: Required<FrameProcessorConfig>;

  private ffmpegProcess: ChildProcess | null = null;
  private lastFrameTime = 0;
  private minIntervalMs: number;
  private outputBuffer: Buffer = Buffer.alloc(0);

  /** SPS/PPS config 데이터 (키프레임 재구성에 필요) */
  private configData: Buffer | null = null;
  private _running = false;

  constructor(deviceId: string, config?: FrameProcessorConfig) {
    super();
    this.deviceId = deviceId;
    this.config = {
      thumbnailWidth: config?.thumbnailWidth ?? 160,
      jpegQuality: config?.jpegQuality ?? 60,
      maxFps: config?.maxFps ?? 1,
      ffmpegPath: config?.ffmpegPath ?? 'ffmpeg',
    };
    this.minIntervalMs = 1000 / this.config.maxFps;
  }

  get running(): boolean {
    return this._running;
  }

  /**
   * ffmpeg 프로세스 시작
   * H.264 raw annexB → JPEG pipe
   */
  start(codecWidth: number, codecHeight: number): void {
    if (this._running) return;
    if (codecWidth <= 0 || codecHeight <= 0) {
      logger.warn('[FrameProcessor] Invalid codec dimensions, skipping start', { deviceId: this.deviceId, codecWidth, codecHeight });
      return;
    }

    // 출력 높이를 종횡비에 맞게 계산
    const aspectRatio = codecHeight / codecWidth;
    const outHeight = Math.round(this.config.thumbnailWidth * aspectRatio);
    // ffmpeg는 짝수 크기 필요
    const outW = this.config.thumbnailWidth % 2 === 0 ? this.config.thumbnailWidth : this.config.thumbnailWidth + 1;
    const outH = outHeight % 2 === 0 ? outHeight : outHeight + 1;

    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      // 입력: raw H.264 Annex B stream from stdin
      '-f', 'h264',
      '-i', 'pipe:0',
      // 출력: MJPEG to stdout
      '-vf', `scale=${outW}:${outH}`,
      '-q:v', String(Math.round((100 - this.config.jpegQuality) / 3.2 + 1)), // ffmpeg qscale (1=best, 31=worst)
      '-f', 'mjpeg',
      '-r', String(this.config.maxFps),
      'pipe:1',
    ];

    logger.debug('[FrameProcessor] Starting ffmpeg', {
      deviceId: this.deviceId,
      args: args.join(' '),
      outputSize: `${outW}x${outH}`,
    });

    this.ffmpegProcess = spawn(this.config.ffmpegPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this._running = true;

    // JPEG 출력 처리
    this.ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
      this.processJpegOutput(chunk, outW, outH);
    });

    this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        logger.debug('[FrameProcessor] ffmpeg stderr', { deviceId: this.deviceId, msg });
      }
    });

    this.ffmpegProcess.on('exit', (code) => {
      this._running = false;
      logger.debug('[FrameProcessor] ffmpeg exited', { deviceId: this.deviceId, code });
    });

    this.ffmpegProcess.on('error', (err) => {
      this._running = false;
      logger.error('[FrameProcessor] ffmpeg error', {
        deviceId: this.deviceId,
        error: err.message,
      });
    });
  }

  /**
   * H.264 프레임 피드
   * ScrcpySession의 'frame' 이벤트에서 호출
   */
  feedFrame(data: Buffer, header: FrameHeader): void {
    if (!this._running || !this.ffmpegProcess?.stdin?.writable) return;

    // config 프레임 (SPS/PPS) 저장
    if (header.isConfig) {
      this.configData = Buffer.from(data);
      // config 데이터도 ffmpeg에 전송 (디코더 초기화)
      this.ffmpegProcess.stdin.write(data);
      return;
    }

    // 프레임 레이트 제한
    const now = Date.now();
    if (now - this.lastFrameTime < this.minIntervalMs) {
      // 키프레임이 아니면 스킵
      if (!header.isKeyFrame) return;
    }

    // 키프레임인 경우 config 데이터 선행 전송
    if (header.isKeyFrame && this.configData) {
      this.ffmpegProcess.stdin.write(this.configData);
    }

    this.ffmpegProcess.stdin.write(data);
    this.lastFrameTime = now;
  }

  /**
   * MJPEG 출력 스트림에서 개별 JPEG 이미지 추출
   * JPEG: SOI (FF D8) → ... → EOI (FF D9)
   */
  private static readonly MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB limit

  private processJpegOutput(chunk: Buffer, width: number, height: number): void {
    this.outputBuffer = Buffer.concat([this.outputBuffer, chunk]);

    if (this.outputBuffer.length > FrameProcessor.MAX_BUFFER_SIZE) {
      logger.warn('[FrameProcessor] Output buffer exceeded limit, clearing', {
        deviceId: this.deviceId,
        bufferSize: this.outputBuffer.length,
      });
      this.outputBuffer = Buffer.alloc(0);
      return;
    }

    while (true) {
      // SOI 마커 찾기
      const soiIndex = this.findMarker(this.outputBuffer, 0xff, 0xd8);
      if (soiIndex === -1) {
        // SOI 없으면 버퍼 비우기
        this.outputBuffer = Buffer.alloc(0);
        return;
      }

      // EOI 마커 찾기 (SOI 이후)
      const eoiIndex = this.findMarker(this.outputBuffer, 0xff, 0xd9, soiIndex + 2);
      if (eoiIndex === -1) {
        // 아직 완전한 JPEG 아님 — SOI 이전 데이터 정리
        if (soiIndex > 0) {
          this.outputBuffer = this.outputBuffer.subarray(soiIndex);
        }
        return;
      }

      // 완전한 JPEG 추출 (EOI 포함 = +2 bytes)
      const jpegData = this.outputBuffer.subarray(soiIndex, eoiIndex + 2);
      this.outputBuffer = this.outputBuffer.subarray(eoiIndex + 2);

      // 썸네일 이벤트 emit
      const thumbnail: ThumbnailFrame = {
        deviceId: this.deviceId,
        data: Buffer.from(jpegData), // copy
        width,
        height,
        timestamp: Date.now(),
      };

      this.emit('thumbnail', thumbnail);
    }
  }

  private findMarker(buf: Buffer, b1: number, b2: number, start = 0): number {
    for (let i = start; i < buf.length - 1; i++) {
      if (buf[i] === b1 && buf[i + 1] === b2) return i;
    }
    return -1;
  }

  /**
   * 중지
   */
  stop(): void {
    if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
      this.ffmpegProcess.stdin?.end();
      this.ffmpegProcess.kill();
      this.ffmpegProcess = null;
    }
    this._running = false;
    this.outputBuffer = Buffer.alloc(0);
    this.configData = null;
    logger.debug('[FrameProcessor] Stopped', { deviceId: this.deviceId });
  }
}

export default FrameProcessor;
