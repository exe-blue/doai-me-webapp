import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceRecovery } from '../DeviceRecovery';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockAdb() {
  return {
    getConnectedDevices: vi.fn().mockResolvedValue([]),
    reconnect: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue(''),
  };
}

function createMockReporter() {
  return {
    updateDeviceState: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DeviceRecovery', () => {
  let adb: ReturnType<typeof createMockAdb>;
  let reporter: ReturnType<typeof createMockReporter>;
  let recovery: DeviceRecovery;

  beforeEach(() => {
    vi.useFakeTimers();
    adb = createMockAdb();
    reporter = createMockReporter();
    recovery = new DeviceRecovery(adb, reporter, {
      maxReconnectAttempts: 2,
      checkIntervalMs: 1000,
      disconnectThresholdMs: 5000,
      enableAutoRecovery: true,
    });
  });

  afterEach(() => {
    recovery.stop();
    vi.useRealTimers();
  });

  // ================================================================
  // Registration
  // ================================================================

  describe('registerDevice', () => {
    it('should register a new device', () => {
      const listener = vi.fn();
      recovery.on('device:registered', listener);

      recovery.registerDevice('d1', 'IDLE');

      const device = recovery.getDeviceState('d1');
      expect(device?.id).toBe('d1');
      expect(device?.state).toBe('IDLE');
      expect(listener).toHaveBeenCalledWith('d1');
    });

    it('should update existing device', () => {
      recovery.registerDevice('d1', 'IDLE');
      recovery.registerDevice('d1', 'RUNNING');

      expect(recovery.getDeviceState('d1')?.state).toBe('RUNNING');
    });
  });

  describe('unregisterDevice', () => {
    it('should remove a device', () => {
      const listener = vi.fn();
      recovery.on('device:unregistered', listener);

      recovery.registerDevice('d1');
      recovery.unregisterDevice('d1');

      expect(recovery.getDeviceState('d1')).toBeUndefined();
      expect(listener).toHaveBeenCalledWith('d1');
    });
  });

  // ================================================================
  // Heartbeat
  // ================================================================

  describe('updateHeartbeat', () => {
    it('should update lastSeen and reset reconnect attempts', () => {
      recovery.registerDevice('d1');

      recovery.updateHeartbeat('d1', 'RUNNING');

      const device = recovery.getDeviceState('d1');
      expect(device?.state).toBe('RUNNING');
      expect(device?.reconnectAttempts).toBe(0);
    });
  });

  // ================================================================
  // State Updates
  // ================================================================

  describe('updateState', () => {
    it('should update device state with metadata', () => {
      recovery.registerDevice('d1');

      recovery.updateState('d1', 'ERROR', { lastError: 'timeout' });

      const device = recovery.getDeviceState('d1');
      expect(device?.state).toBe('ERROR');
      expect(device?.metadata?.lastError).toBe('timeout');
    });
  });

  // ================================================================
  // Manual Recovery
  // ================================================================

  describe('manualRecovery', () => {
    it('should attempt recovery and return true on success', async () => {
      adb.execute.mockResolvedValue('ok');

      recovery.registerDevice('d1');

      const result = await recovery.manualRecovery('d1');
      expect(result).toBe(true);
      expect(adb.execute).toHaveBeenCalledWith('d1', 'reconnect');
    });

    it('should return false for unknown device', async () => {
      const result = await recovery.manualRecovery('unknown');
      expect(result).toBe(false);
    });

    it('should return false on recovery failure', async () => {
      adb.execute.mockRejectedValue(new Error('fail'));

      recovery.registerDevice('d1');

      const result = await recovery.manualRecovery('d1');
      expect(result).toBe(false);
    });
  });

  // ================================================================
  // Reconnect All
  // ================================================================

  describe('reconnectAll', () => {
    it('should attempt reconnect for all disconnected devices', async () => {
      recovery.registerDevice('d1');
      recovery.registerDevice('d2');
      recovery.updateState('d1', 'DISCONNECTED');
      recovery.updateState('d2', 'DISCONNECTED');

      adb.reconnect.mockResolvedValue(undefined);

      const results = await recovery.reconnectAll();

      expect(results.get('d1')).toBe(true);
      expect(results.get('d2')).toBe(true);
    });

    it('should handle mixed results', async () => {
      recovery.registerDevice('d1');
      recovery.registerDevice('d2');
      recovery.updateState('d1', 'DISCONNECTED');
      recovery.updateState('d2', 'DISCONNECTED');

      adb.reconnect
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('fail'));

      const results = await recovery.reconnectAll();

      expect(results.get('d1')).toBe(true);
      expect(results.get('d2')).toBe(false);
    });

    it('should skip non-disconnected devices', async () => {
      recovery.registerDevice('d1');
      recovery.updateState('d1', 'IDLE');

      const results = await recovery.reconnectAll();
      expect(results.size).toBe(0);
    });
  });

  // ================================================================
  // Queries
  // ================================================================

  describe('getAllDevices', () => {
    it('should return a copy of devices map', () => {
      recovery.registerDevice('d1');
      recovery.registerDevice('d2');

      const devices = recovery.getAllDevices();
      expect(devices.size).toBe(2);

      // Modifying copy should not affect original
      devices.delete('d1');
      expect(recovery.getDeviceState('d1')).toBeDefined();
    });
  });
});
