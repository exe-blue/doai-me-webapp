import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScreenStreamProxy } from '../ScreenStreamProxy';
import { WorkerRegistry } from '../WorkerRegistry';
import type { MinicapFrame, StreamStartInfo, StreamStopInfo, StreamError } from '@doai/worker-types';
import type { Socket } from 'socket.io';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockSocket(id = 'viewer-1'): Socket {
  return {
    id,
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as Socket;
}

function createStreamStartInfo(overrides: Partial<StreamStartInfo> = {}): StreamStartInfo {
  return {
    deviceId: 'device-1',
    sessionId: 'session-1',
    config: { width: 720, height: 1280, quality: 80, frameRate: 30 },
    minicapInfo: {
      virtualWidth: 720,
      virtualHeight: 1280,
      orientation: 0,
      quirks: '',
    },
    ...overrides,
  } as StreamStartInfo;
}

function createFrame(num = 1): MinicapFrame {
  return {
    frameNumber: num,
    timestamp: Date.now(),
    width: 720,
    height: 1280,
    format: 'jpeg',
    data: Buffer.from('fake-frame-data'),
    size: 100,
  };
}

describe('ScreenStreamProxy', () => {
  let registry: WorkerRegistry;
  let proxy: ScreenStreamProxy;

  beforeEach(() => {
    registry = new WorkerRegistry();
    proxy = new ScreenStreamProxy(registry, {
      maxBufferSize: 3,
      maxViewersPerStream: 2,
      maxFrameRate: 60,
      qualityReductionThreshold: 2,
    });
  });

  // ================================================================
  // Stream Lifecycle
  // ================================================================

  describe('handleStreamStart', () => {
    it('should start a new stream', () => {
      const listener = vi.fn();
      proxy.on('stream:started', listener);

      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      expect(proxy.isStreaming('device-1')).toBe(true);
      expect(listener).toHaveBeenCalledWith('device-1', expect.any(Object));
    });

    it('should not start duplicate stream', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      expect(proxy.getActiveStreams()).toHaveLength(1);
    });
  });

  describe('handleStreamStop', () => {
    it('should stop an active stream', () => {
      const listener = vi.fn();
      proxy.on('stream:stopped', listener);

      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const stopInfo: StreamStopInfo = {
        deviceId: 'device-1',
        sessionId: 'session-1',
        reason: 'user_request',
        totalFrames: 100,
        durationMs: 5000,
      };

      proxy.handleStreamStop('worker-1', stopInfo);

      expect(proxy.isStreaming('device-1')).toBe(false);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('should notify viewers when stream stops', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const viewerSocket = createMockSocket();
      proxy.addViewer('device-1', viewerSocket);

      proxy.handleStreamStop('worker-1', {
        deviceId: 'device-1',
        sessionId: 'session-1',
        reason: 'done',
        totalFrames: 50,
        durationMs: 2000,
      });

      expect(viewerSocket.emit).toHaveBeenCalledWith('screen:stopped', expect.objectContaining({
        deviceId: 'device-1',
      }));
    });

    it('should ignore stop for unknown session', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      proxy.handleStreamStop('worker-1', {
        deviceId: 'device-1',
        sessionId: 'wrong-session',
        reason: 'done',
        totalFrames: 0,
        durationMs: 0,
      });

      expect(proxy.isStreaming('device-1')).toBe(true);
    });
  });

  // ================================================================
  // Stream Error
  // ================================================================

  describe('handleStreamError', () => {
    it('should emit stream:error event', () => {
      const listener = vi.fn();
      proxy.on('stream:error', listener);

      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const error: StreamError = {
        deviceId: 'device-1',
        sessionId: 'session-1',
        code: 'CAPTURE_FAILED',
        message: 'Failed to capture',
        recoverable: true,
      };

      proxy.handleStreamError('worker-1', error);

      expect(listener).toHaveBeenCalledWith('device-1', error);
    });

    it('should clean up non-recoverable error', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      proxy.handleStreamError('worker-1', {
        deviceId: 'device-1',
        sessionId: 'session-1',
        code: 'FATAL',
        message: 'Fatal error',
        recoverable: false,
      });

      expect(proxy.isStreaming('device-1')).toBe(false);
    });
  });

  // ================================================================
  // Frame Forwarding
  // ================================================================

  describe('handleFrame', () => {
    it('should forward frames to viewers', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const viewerSocket = createMockSocket();
      proxy.addViewer('device-1', viewerSocket);

      proxy.handleFrame('worker-1', 'device-1', createFrame(1));

      expect(viewerSocket.emit).toHaveBeenCalledWith('screen:frame', expect.objectContaining({
        deviceId: 'device-1',
        frameNumber: 1,
      }));
    });

    it('should maintain ring buffer', () => {
      vi.useFakeTimers();

      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      // Send 5 frames, advancing time between each to bypass rate limiter
      for (let i = 1; i <= 5; i++) {
        vi.advanceTimersByTime(100); // 100ms between frames (well above 1000/60 ≈ 17ms limit)
        proxy.handleFrame('worker-1', 'device-1', createFrame(i));
      }

      const stream = proxy.getStream('device-1');
      expect(stream!.frameBuffer).toHaveLength(3);
      expect(stream!.frameBuffer[0].frameNumber).toBe(3);

      vi.useRealTimers();
    });

    it('should ignore frames from wrong worker', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const viewerSocket = createMockSocket();
      proxy.addViewer('device-1', viewerSocket);

      proxy.handleFrame('wrong-worker', 'device-1', createFrame(1));

      // Only the 'screen:info' emit from addViewer, not 'screen:frame'
      const frameEmits = (viewerSocket.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === 'screen:frame'
      );
      expect(frameEmits).toHaveLength(0);
    });
  });

  // ================================================================
  // Viewer Management
  // ================================================================

  describe('addViewer', () => {
    it('should add viewer to stream', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const viewerSocket = createMockSocket('v1');
      const added = proxy.addViewer('device-1', viewerSocket);

      expect(added).toBe(true);
      expect(proxy.getViewerCount('device-1')).toBe(1);
    });

    it('should return false for non-active stream', () => {
      const viewerSocket = createMockSocket();
      const added = proxy.addViewer('nonexistent', viewerSocket);

      expect(added).toBe(false);
    });

    it('should reject when max viewers reached', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      proxy.addViewer('device-1', createMockSocket('v1'));
      proxy.addViewer('device-1', createMockSocket('v2'));

      const added = proxy.addViewer('device-1', createMockSocket('v3'));
      expect(added).toBe(false); // Max is 2
    });

    it('should not duplicate viewers', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const viewerSocket = createMockSocket('v1');
      proxy.addViewer('device-1', viewerSocket);
      proxy.addViewer('device-1', viewerSocket);

      expect(proxy.getViewerCount('device-1')).toBe(1);
    });

    it('should send stream info and latest frame to new viewer', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());
      proxy.handleFrame('worker-1', 'device-1', createFrame(1));

      const viewerSocket = createMockSocket('v1');
      proxy.addViewer('device-1', viewerSocket);

      expect(viewerSocket.emit).toHaveBeenCalledWith('screen:info', expect.objectContaining({
        deviceId: 'device-1',
      }));
      expect(viewerSocket.emit).toHaveBeenCalledWith('screen:frame', expect.objectContaining({
        deviceId: 'device-1',
      }));
    });
  });

  describe('removeViewer', () => {
    it('should remove viewer from stream', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const viewerSocket = createMockSocket('v1');
      proxy.addViewer('device-1', viewerSocket);

      const removed = proxy.removeViewer('device-1', viewerSocket);

      expect(removed).toBe(true);
      expect(proxy.getViewerCount('device-1')).toBe(0);
    });

    it('should emit stream:viewer_left event', () => {
      const listener = vi.fn();
      proxy.on('stream:viewer_left', listener);

      proxy.handleStreamStart('worker-1', createStreamStartInfo());

      const viewerSocket = createMockSocket('v1');
      proxy.addViewer('device-1', viewerSocket);
      proxy.removeViewer('device-1', viewerSocket);

      expect(listener).toHaveBeenCalledWith('device-1', 'v1');
    });
  });

  describe('removeViewerFromAll', () => {
    it('should remove viewer from all streams', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo({ deviceId: 'device-1', sessionId: 's1' }));
      proxy.handleStreamStart('worker-2', createStreamStartInfo({ deviceId: 'device-2', sessionId: 's2' }));

      const viewerSocket = createMockSocket('v1');
      proxy.addViewer('device-1', viewerSocket);
      proxy.addViewer('device-2', viewerSocket);

      proxy.removeViewerFromAll(viewerSocket);

      expect(proxy.getViewerCount('device-1')).toBe(0);
      expect(proxy.getViewerCount('device-2')).toBe(0);
    });
  });

  // ================================================================
  // Stream Requests
  // ================================================================

  describe('requestStreamStart', () => {
    it('should send stream start command to worker', () => {
      const socket = createMockSocket('ws-1');
      registry.registerWorker(
        {
          workerId: 'worker-1',
          workerType: 'youtube',
          version: '1.0.0',
          capabilities: [],
          connectedDevices: ['device-1'],
          maxConcurrentJobs: 1,
          host: { hostname: 'test', platform: 'win32', arch: 'x64' },
        },
        socket
      );

      const result = proxy.requestStreamStart('device-1');

      expect(result).toBe(true);
      expect(socket.emit).toHaveBeenCalledWith('cmd:start_stream', expect.objectContaining({
        deviceId: 'device-1',
      }));
    });

    it('should return false if device not found', () => {
      const result = proxy.requestStreamStart('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ================================================================
  // Statistics
  // ================================================================

  describe('statistics', () => {
    it('getTotalViewerCount should count across all streams', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo({ deviceId: 'device-1', sessionId: 's1' }));
      proxy.handleStreamStart('worker-2', createStreamStartInfo({ deviceId: 'device-2', sessionId: 's2' }));

      proxy.addViewer('device-1', createMockSocket('v1'));
      proxy.addViewer('device-2', createMockSocket('v2'));

      expect(proxy.getTotalViewerCount()).toBe(2);
    });

    it('clear should remove all streams', () => {
      proxy.handleStreamStart('worker-1', createStreamStartInfo());
      proxy.clear();

      expect(proxy.getActiveStreams()).toHaveLength(0);
    });
  });
});
