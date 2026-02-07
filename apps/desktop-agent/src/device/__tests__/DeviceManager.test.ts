import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceManager } from '../DeviceManager';

// Mock AdbController module
const mockGetVersion = vi.fn().mockResolvedValue('1.0.41');
const mockGetDevicesInfo = vi.fn().mockResolvedValue([]);
const mockGetBatteryLevel = vi.fn().mockResolvedValue(80);

vi.mock('../AdbController', () => ({
  getAdbController: () => ({
    getVersion: mockGetVersion,
    getDevicesInfo: mockGetDevicesInfo,
    getBatteryLevel: mockGetBatteryLevel,
    execute: vi.fn(),
    getConnectedDevices: vi.fn().mockResolvedValue([]),
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

describe('DeviceManager', () => {
  let dm: DeviceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    dm = new DeviceManager({ monitorIntervalMs: 1000, batteryCheckIntervalMs: 5000 });
  });

  afterEach(() => {
    dm.stop();
  });

  // ================================================================
  // Initialization
  // ================================================================

  describe('initialize', () => {
    it('should initialize and scan devices', async () => {
      mockGetDevicesInfo.mockResolvedValueOnce([
        { serial: 'd1', state: 'device', model: 'Pixel' },
      ]);

      await dm.initialize();

      expect(dm.getAllDevices()).toHaveLength(1);
      expect(dm.getConnectedDevices()).toEqual(['d1']);
    });

    it('should not initialize twice', async () => {
      await dm.initialize();
      await dm.initialize();

      expect(mockGetVersion).toHaveBeenCalledOnce();
    });

    it('should throw on ADB failure', async () => {
      mockGetVersion.mockRejectedValueOnce(new Error('ADB not found'));

      await expect(dm.initialize()).rejects.toThrow('ADB not found');
    });
  });

  // ================================================================
  // Scanning
  // ================================================================

  describe('scanDevices', () => {
    it('should detect new devices', async () => {
      const listener = vi.fn();
      dm.on('device:connected', listener);

      mockGetDevicesInfo.mockResolvedValueOnce([
        { serial: 'd1', state: 'device', model: 'Galaxy' },
      ]);

      await dm.scanDevices();

      expect(dm.getDevice('d1')).toBeDefined();
      expect(dm.getDevice('d1')?.state).toBe('IDLE');
      expect(listener).toHaveBeenCalledOnce();
    });

    it('should detect disconnected devices', async () => {
      const listener = vi.fn();
      dm.on('device:disconnected', listener);

      // First scan: device connected
      mockGetDevicesInfo.mockResolvedValueOnce([
        { serial: 'd1', state: 'device' },
      ]);
      await dm.scanDevices();

      // Second scan: device gone
      mockGetDevicesInfo.mockResolvedValueOnce([]);
      await dm.scanDevices();

      expect(dm.getDevice('d1')?.state).toBe('DISCONNECTED');
      expect(listener).toHaveBeenCalledOnce();
    });

    it('should detect reconnected devices', async () => {
      const listener = vi.fn();
      dm.on('device:reconnected', listener);

      // Connect
      mockGetDevicesInfo.mockResolvedValueOnce([{ serial: 'd1', state: 'device' }]);
      await dm.scanDevices();

      // Disconnect
      mockGetDevicesInfo.mockResolvedValueOnce([]);
      await dm.scanDevices();

      // Reconnect
      mockGetDevicesInfo.mockResolvedValueOnce([{ serial: 'd1', state: 'device' }]);
      await dm.scanDevices();

      expect(dm.getDevice('d1')?.state).toBe('IDLE');
      expect(listener).toHaveBeenCalledOnce();
    });

    it('should skip non-device state entries', async () => {
      mockGetDevicesInfo.mockResolvedValueOnce([
        { serial: 'd1', state: 'offline' },
        { serial: 'd2', state: 'unauthorized' },
      ]);

      await dm.scanDevices();

      expect(dm.getAllDevices()).toHaveLength(0);
    });
  });

  // ================================================================
  // State Management
  // ================================================================

  describe('updateState', () => {
    it('should update device state', async () => {
      mockGetDevicesInfo.mockResolvedValueOnce([{ serial: 'd1', state: 'device' }]);
      await dm.scanDevices();

      const listener = vi.fn();
      dm.on('device:stateChanged', listener);

      dm.updateState('d1', 'RUNNING', { currentWorkflowId: 'wf-1' });

      expect(dm.getDevice('d1')?.state).toBe('RUNNING');
      expect(dm.getDevice('d1')?.currentWorkflowId).toBe('wf-1');
      expect(listener).toHaveBeenCalledOnce();
    });

    it('should ignore update for unknown device', () => {
      dm.updateState('unknown', 'IDLE');
      // Should not throw
    });
  });

  // ================================================================
  // Queries
  // ================================================================

  describe('queries', () => {
    beforeEach(async () => {
      mockGetDevicesInfo.mockResolvedValueOnce([
        { serial: 'd1', state: 'device' },
        { serial: 'd2', state: 'device' },
      ]);
      await dm.scanDevices();
    });

    it('getIdleDevices should return IDLE devices', () => {
      dm.updateState('d1', 'RUNNING');
      const idle = dm.getIdleDevices();
      expect(idle).toHaveLength(1);
      expect(idle[0].serial).toBe('d2');
    });

    it('getAllStates should return all device states', () => {
      const states = dm.getAllStates();
      expect(Object.keys(states)).toHaveLength(2);
      expect(states['d1'].state).toBe('IDLE');
    });

    it('getConnectedDevices should exclude DISCONNECTED', async () => {
      mockGetDevicesInfo.mockResolvedValueOnce([{ serial: 'd1', state: 'device' }]);
      await dm.scanDevices(); // d2 becomes DISCONNECTED

      const connected = dm.getConnectedDevices();
      expect(connected).toEqual(['d1']);
    });
  });

  // ================================================================
  // Monitoring
  // ================================================================

  describe('startMonitoring', () => {
    it('should not start twice', () => {
      dm.startMonitoring();
      dm.startMonitoring(); // Should be a no-op (guard)
      dm.stop();
    });
  });
});
