import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InfraHealthChecker } from '../InfraHealthChecker';

// Mock all controller singletons
const mockAdbGetVersion = vi.fn();
const mockAppiumHealthCheck = vi.fn();
const mockAppiumIsUiAutomator2Installed = vi.fn();
const mockScrcpyHealthCheck = vi.fn();

vi.mock('../../device/AdbController', () => ({
  getAdbController: () => ({
    getVersion: mockAdbGetVersion,
  }),
}));

vi.mock('../../device/AppiumController', () => ({
  getAppiumController: () => ({
    healthCheck: mockAppiumHealthCheck,
    isUiAutomator2Installed: mockAppiumIsUiAutomator2Installed,
  }),
}));

vi.mock('../../device/ScrcpyController', () => ({
  getScrcpyController: () => ({
    healthCheck: mockScrcpyHealthCheck,
  }),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock http/https
vi.mock('http', () => ({
  default: {
    request: vi.fn((url: string, opts: any, cb: any) => {
      const mockRes = {
        statusCode: 200,
        on: vi.fn((event: string, handler: any) => {
          if (event === 'data') handler('OK');
          if (event === 'end') handler();
        }),
      };
      cb(mockRes);
      return {
        on: vi.fn(),
        end: vi.fn(),
      };
    }),
  },
}));

vi.mock('https', () => ({
  default: {
    request: vi.fn((url: string, opts: any, cb: any) => {
      const mockRes = {
        statusCode: 200,
        on: vi.fn((event: string, handler: any) => {
          if (event === 'data') handler('OK');
          if (event === 'end') handler();
        }),
      };
      cb(mockRes);
      return {
        on: vi.fn(),
        end: vi.fn(),
      };
    }),
  },
}));

describe('InfraHealthChecker', () => {
  let checker: InfraHealthChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    checker = new InfraHealthChecker('https://api.doai.me');

    // Default: all services OK
    mockAdbGetVersion.mockResolvedValue('34.0.5');
    mockAppiumHealthCheck.mockResolvedValue({ status: 'ok', version: '2.5.1', lastCheck: Date.now() });
    mockAppiumIsUiAutomator2Installed.mockResolvedValue({ installed: true, version: '2.34.0' });
    mockScrcpyHealthCheck.mockResolvedValue({ status: 'ok', version: '2.3', activeStreams: 0, lastCheck: Date.now() });
  });

  // ================================================================
  // Full Health Check
  // ================================================================

  describe('check', () => {
    it('should return health status for all services', async () => {
      const result = await checker.check();

      expect(result.adb.status).toBe('ok');
      expect(result.adb.version).toBe('34.0.5');
      expect(result.appium.status).toBe('ok');
      expect(result.uiautomator2.status).toBe('ok');
      expect(result.scrcpy.status).toBe('ok');
      expect(result.backend.status).toBe('ok');
    });

    it('should report ADB missing', async () => {
      mockAdbGetVersion.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      const result = await checker.check();

      expect(result.adb.status).toBe('missing');
    });

    it('should report ADB error', async () => {
      mockAdbGetVersion.mockRejectedValue(new Error('Connection refused'));

      const result = await checker.check();

      expect(result.adb.status).toBe('error');
      expect(result.adb.error).toBe('Connection refused');
    });

    it('should report UIAutomator2 not installed', async () => {
      mockAppiumIsUiAutomator2Installed.mockResolvedValue({ installed: false });

      const result = await checker.check();

      expect(result.uiautomator2.status).toBe('missing');
    });

    it('should report Appium missing', async () => {
      mockAppiumHealthCheck.mockResolvedValue({ status: 'missing', error: 'not found', lastCheck: Date.now() });

      const result = await checker.check();

      expect(result.appium.status).toBe('missing');
    });
  });

  // ================================================================
  // Caching
  // ================================================================

  describe('caching', () => {
    it('should cache results for 30 seconds', async () => {
      await checker.check();
      await checker.check(); // Should use cache

      // ADB getVersion should only be called once (second call uses cache)
      expect(mockAdbGetVersion).toHaveBeenCalledOnce();
    });

    it('should refresh when forceRefresh is true', async () => {
      await checker.check();
      await checker.check(true); // Force refresh

      expect(mockAdbGetVersion).toHaveBeenCalledTimes(2);
    });
  });
});
