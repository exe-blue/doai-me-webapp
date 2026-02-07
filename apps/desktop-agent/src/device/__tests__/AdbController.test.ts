import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock AppConfig (imported by AdbController)
vi.mock('../../config/AppConfig', () => ({
  getResourcePath: vi.fn(() => '/fake/resources/platform-tools/adb.exe'),
}));

// Mock fs (used by findBundledAdb)
vi.mock('fs', () => ({
  default: { existsSync: vi.fn(() => false) },
  existsSync: vi.fn(() => false),
}));

// Create hoisted mock for the promisified execFile
const { mockExecFileAsync } = vi.hoisted(() => {
  return { mockExecFileAsync: vi.fn() };
});

// Mock child_process with custom promisify symbol so util.promisify returns our mock
vi.mock('child_process', () => {
  const customPromisify = Symbol.for('nodejs.util.promisify.custom');

  const execFile = Object.assign(
    vi.fn(),
    { [customPromisify]: mockExecFileAsync }
  );

  return { execFile, spawn: vi.fn() };
});

import { AdbController } from '../AdbController';

describe('AdbController', () => {
  let adb: AdbController;

  beforeEach(() => {
    mockExecFileAsync.mockReset();
    mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
    adb = new AdbController({ adbPath: '/usr/bin/adb' });
  });

  // ================================================================
  // Input Sanitization
  // ================================================================

  describe('sanitizeInput (via execute)', () => {
    it('should reject dangerous characters', async () => {
      await expect(adb.execute('device; rm -rf /', 'shell ls')).rejects.toThrow(
        'Invalid input contains disallowed characters'
      );
    });

    it('should reject shell injection patterns', async () => {
      await expect(adb.execute('device`id`', 'shell ls')).rejects.toThrow(
        'Invalid input contains disallowed characters'
      );
    });

    it('should allow valid device serials', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'output', stderr: '' });
      await adb.execute('192.168.1.1:5555', 'shell ls');
      expect(mockExecFileAsync).toHaveBeenCalled();
    });

    it('should allow emulator serial format', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'output', stderr: '' });
      await adb.execute('emulator-5554', 'shell ls');
      expect(mockExecFileAsync).toHaveBeenCalled();
    });
  });

  // ================================================================
  // Command Execution
  // ================================================================

  describe('execute', () => {
    it('should execute adb command with device flag', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'result', stderr: '' });
      const result = await adb.execute('device-1', 'shell ls');

      expect(result).toBe('result');
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        '/usr/bin/adb',
        ['-s', 'device-1', 'shell', 'ls'],
        expect.any(Object)
      );
    });

    it('should execute without device flag when deviceId is empty', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'result', stderr: '' });
      await adb.execute('', 'devices');

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        '/usr/bin/adb',
        ['devices'],
        expect.any(Object)
      );
    });

    it('should throw on timeout (killed)', async () => {
      mockExecFileAsync.mockRejectedValue(
        Object.assign(new Error('timeout'), { killed: true })
      );
      await expect(adb.execute('d1', 'shell sleep 999')).rejects.toThrow('ADB command timeout');
    });

    it('should propagate errors', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('command failed'));
      await expect(adb.execute('d1', 'shell invalid')).rejects.toThrow('command failed');
    });
  });

  // ================================================================
  // Device Queries
  // ================================================================

  describe('getConnectedDevices', () => {
    it('should parse device list', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'List of devices attached\ndevice-1\tdevice\ndevice-2\toffline\n',
        stderr: '',
      });
      const devices = await adb.getConnectedDevices();
      expect(devices).toEqual(['device-1']);
    });

    it('should return empty array on error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('adb not found'));
      const devices = await adb.getConnectedDevices();
      expect(devices).toEqual([]);
    });
  });

  describe('getDevicesInfo', () => {
    it('should parse detailed device list', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'List of devices attached\nR58M12345  device  model:Galaxy_S21  product:exynos\n',
        stderr: '',
      });
      const devices = await adb.getDevicesInfo();
      expect(devices).toHaveLength(1);
      expect(devices[0].serial).toBe('R58M12345');
      expect(devices[0].state).toBe('device');
      expect(devices[0].model).toBe('Galaxy_S21');
    });

    it('should return empty on error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('fail'));
      const devices = await adb.getDevicesInfo();
      expect(devices).toEqual([]);
    });
  });

  // ================================================================
  // Battery & Screen
  // ================================================================

  describe('getBatteryLevel', () => {
    it('should parse battery level', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'Current Battery Service state:\n  level: 85\n  status: 2',
        stderr: '',
      });
      const level = await adb.getBatteryLevel('d1');
      expect(level).toBe(85);
    });

    it('should return -1 on error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('fail'));
      const level = await adb.getBatteryLevel('d1');
      expect(level).toBe(-1);
    });
  });

  describe('isScreenOn', () => {
    it('should detect screen on', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'mScreenState=ON', stderr: '' });
      const on = await adb.isScreenOn('d1');
      expect(on).toBe(true);
    });

    it('should detect screen off', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'mScreenState=OFF', stderr: '' });
      const on = await adb.isScreenOn('d1');
      expect(on).toBe(false);
    });
  });

  // ================================================================
  // Version
  // ================================================================

  describe('getVersion', () => {
    it('should parse version', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'Android Debug Bridge version 1.0.41\nVersion 34.0.5-11411018',
        stderr: '',
      });
      const version = await adb.getVersion();
      expect(version).toBe('1.0.41');
    });

    it('should return unknown for unrecognized format', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'some output', stderr: '' });
      const version = await adb.getVersion();
      expect(version).toBe('unknown');
    });
  });
});
