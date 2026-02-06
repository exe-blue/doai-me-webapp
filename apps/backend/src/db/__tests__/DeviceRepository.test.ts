import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Device, DeviceStats } from '../types';

// ─── Supabase mock chain builder ───────────────────────────────────

function chainBuilder(terminalValue: any = { data: null, error: null }) {
  const chain: Record<string, any> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'single', 'order', 'limit', 'range',
    'lt', 'gt', 'gte', 'lte',
  ];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Terminal method: single() returns the resolved value
  chain.single = vi.fn().mockResolvedValue(terminalValue);
  // Make chain itself thenable for queries without .single()
  chain.then = (resolve: any) => resolve(terminalValue);
  return chain;
}

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../supabase', () => ({
  getSupabase: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

import { DeviceRepository } from '../repositories/DeviceRepository';

// ─── Test data ─────────────────────────────────────────────────────

const MOCK_DEVICE: Device = {
  id: 'device-001',
  pc_id: 'pc-001',
  device_number: 1,
  serial_number: 'SN001',
  ip_address: '192.168.1.100',
  model: 'Pixel 7',
  android_version: null,
  connection_type: 'usb',
  usb_port: null,
  status: 'online',
  battery_level: null,
  last_heartbeat: '2026-02-06T00:00:00Z',
  last_task_at: null,
  last_error: null,
  last_error_at: null,
  error_count: 0,
  management_code: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('DeviceRepository', () => {
  let repo: DeviceRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new DeviceRepository();
  });

  // ─── findById ─────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return device when found', async () => {
      const chain = chainBuilder({ data: MOCK_DEVICE, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findById('device-001');

      expect(mockFrom).toHaveBeenCalledWith('devices');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('id', 'device-001');
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(MOCK_DEVICE);
    });

    it('should return null when not found (PGRST116)', async () => {
      const chain = chainBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      const dbError = { code: '42P01', message: 'relation does not exist' };
      const chain = chainBuilder({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(repo.findById('device-001')).rejects.toEqual(dbError);
    });
  });

  // ─── findByPcId ───────────────────────────────────────────────

  describe('findByPcId()', () => {
    it('should return devices for a given PC', async () => {
      const devices = [MOCK_DEVICE, { ...MOCK_DEVICE, id: 'device-002', device_number: 2 }];
      const chain = chainBuilder({ data: devices, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByPcId('pc-001');

      expect(chain.eq).toHaveBeenCalledWith('pc_id', 'pc-001');
      expect(chain.order).toHaveBeenCalledWith('device_number');
      expect(result).toEqual(devices);
    });

    it('should return empty array when no devices found', async () => {
      const chain = chainBuilder({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByPcId('pc-empty');

      expect(result).toEqual([]);
    });

    it('should throw on error', async () => {
      const dbError = { message: 'query failed' };
      const chain = chainBuilder({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(repo.findByPcId('pc-001')).rejects.toEqual(dbError);
    });
  });

  // ─── findByStatus ─────────────────────────────────────────────

  describe('findByStatus()', () => {
    it('should filter by status', async () => {
      const chain = chainBuilder({ data: [MOCK_DEVICE], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByStatus('online');

      expect(chain.eq).toHaveBeenCalledWith('status', 'online');
      expect(result).toEqual([MOCK_DEVICE]);
    });
  });

  // ─── findByStatuses ───────────────────────────────────────────

  describe('findByStatuses()', () => {
    it('should filter by multiple statuses', async () => {
      const chain = chainBuilder({ data: [MOCK_DEVICE], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByStatuses(['online', 'busy']);

      expect(chain.in).toHaveBeenCalledWith('status', ['online', 'busy']);
      expect(result).toEqual([MOCK_DEVICE]);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return all devices ordered by device_number', async () => {
      const chain = chainBuilder({ data: [MOCK_DEVICE], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findAll();

      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.order).toHaveBeenCalledWith('device_number');
      expect(result).toEqual([MOCK_DEVICE]);
    });

    it('should apply limit when provided', async () => {
      const chain = chainBuilder({ data: [MOCK_DEVICE], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.findAll({ limit: 10 });

      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('should apply range when offset is provided', async () => {
      const chain = chainBuilder({ data: [MOCK_DEVICE], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.findAll({ offset: 20, limit: 10 });

      expect(chain.range).toHaveBeenCalledWith(20, 29);
    });
  });

  // ─── findOnlineDevices ────────────────────────────────────────

  describe('findOnlineDevices()', () => {
    it('should filter online devices ordered by heartbeat desc', async () => {
      const chain = chainBuilder({ data: [MOCK_DEVICE], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findOnlineDevices();

      expect(chain.eq).toHaveBeenCalledWith('status', 'online');
      expect(chain.order).toHaveBeenCalledWith('last_heartbeat', { ascending: false });
      expect(result).toEqual([MOCK_DEVICE]);
    });

    it('should filter by pcId when provided', async () => {
      const chain = chainBuilder({ data: [MOCK_DEVICE], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.findOnlineDevices('pc-001');

      expect(chain.eq).toHaveBeenCalledWith('status', 'online');
      expect(chain.eq).toHaveBeenCalledWith('pc_id', 'pc-001');
    });

    it('should apply limit when provided', async () => {
      const chain = chainBuilder({ data: [MOCK_DEVICE], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.findOnlineDevices(undefined, 5);

      expect(chain.limit).toHaveBeenCalledWith(5);
    });
  });

  // ─── upsert ───────────────────────────────────────────────────

  describe('upsert()', () => {
    it('should upsert device with onConflict id', async () => {
      const chain = chainBuilder({ data: MOCK_DEVICE, error: null });
      mockFrom.mockReturnValue(chain);

      const input = { id: 'device-001', device_number: 1, serial_number: 'SN001' };
      const result = await repo.upsert(input as any);

      expect(chain.upsert).toHaveBeenCalledWith(input, { onConflict: 'id' });
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(MOCK_DEVICE);
    });

    it('should throw on upsert error', async () => {
      const dbError = { message: 'upsert failed' };
      const chain = chainBuilder({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(repo.upsert({ id: 'x' } as any)).rejects.toEqual(dbError);
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('should reset error_count for online status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      // For non-single paths, resolve via .then
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('device-001', 'online');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'online',
          error_count: 0,
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 'device-001');
    });

    it('should reset error_count for busy status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('device-001', 'busy');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'busy',
          error_count: 0,
        })
      );
    });

    it('should use RPC for error status', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await repo.updateStatus('device-001', 'error', { last_error: 'ADB connection lost' });

      expect(mockRpc).toHaveBeenCalledWith('update_device_status_with_error', {
        p_device_id: 'device-001',
        p_last_error: 'ADB connection lost',
      });
    });

    it('should fall back to increment_device_error_count when RPC 42883', async () => {
      // First RPC call fails with 42883 (function not found)
      mockRpc
        .mockResolvedValueOnce({ error: { code: '42883', message: 'function not found' } })
        .mockResolvedValueOnce({ error: null }); // increment succeeds

      // Mock the update chain for last_error fields
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('device-001', 'error', { last_error: 'test error' });

      expect(mockRpc).toHaveBeenCalledWith('increment_device_error_count', { device_id: 'device-001' });
    });

    it('should update directly for offline status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('device-001', 'offline');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'offline' })
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update()', () => {
    it('should update device fields', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.update('device-001', { model: 'Pixel 8' });

      expect(chain.update).toHaveBeenCalledWith({ model: 'Pixel 8' });
      expect(chain.eq).toHaveBeenCalledWith('id', 'device-001');
    });
  });

  // ─── updateManyStatuses ───────────────────────────────────────

  describe('updateManyStatuses()', () => {
    it('should batch update statuses', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateManyStatuses(['d1', 'd2', 'd3'], 'offline');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'offline' })
      );
      expect(chain.in).toHaveBeenCalledWith('id', ['d1', 'd2', 'd3']);
    });
  });

  // ─── delete ───────────────────────────────────────────────────

  describe('delete()', () => {
    it('should delete device by id', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.delete('device-001');

      expect(mockFrom).toHaveBeenCalledWith('devices');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'device-001');
    });
  });

  // ─── disconnectByPc ───────────────────────────────────────────

  describe('disconnectByPc()', () => {
    it('should set all PC devices to offline', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.disconnectByPc('pc-001');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'offline' })
      );
      expect(chain.eq).toHaveBeenCalledWith('pc_id', 'pc-001');
    });
  });

  // ─── getStats ─────────────────────────────────────────────────

  describe('getStats()', () => {
    it('should compute device stats from status records', async () => {
      const statusData = [
        { status: 'online' },
        { status: 'online' },
        { status: 'offline' },
        { status: 'busy' },
        { status: 'error' },
      ];
      const chain = chainBuilder({ data: statusData, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getStats();

      expect(result).toEqual<DeviceStats>({
        total: 5,
        online: 2,
        offline: 1,
        busy: 1,
        error: 1,
      });
    });

    it('should return all zeros when no devices', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getStats();

      expect(result).toEqual<DeviceStats>({
        total: 0,
        online: 0,
        offline: 0,
        busy: 0,
        error: 0,
      });
    });
  });

  // ─── countByPc ────────────────────────────────────────────────

  describe('countByPc()', () => {
    it('should count devices grouped by pc_id', async () => {
      const pcData = [
        { pc_id: 'pc-001' },
        { pc_id: 'pc-001' },
        { pc_id: 'pc-002' },
        { pc_id: null },
      ];
      const chain = chainBuilder({ data: pcData, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.countByPc();

      expect(result).toEqual({
        'pc-001': 2,
        'pc-002': 1,
        'unassigned': 1,
      });
    });
  });

  // ─── device state operations ──────────────────────────────────

  describe('upsertDeviceState()', () => {
    it('should upsert device state with heartbeat', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.upsertDeviceState({ device_id: 'device-001', battery_level: 85 });

      expect(mockFrom).toHaveBeenCalledWith('device_states');
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          device_id: 'device-001',
          battery_level: 85,
          last_heartbeat: expect.any(String),
        }),
        { onConflict: 'device_id' }
      );
    });
  });

  describe('getDeviceState()', () => {
    it('should return device state when found', async () => {
      const stateData = { device_id: 'device-001', battery_level: 85 };
      const chain = chainBuilder({ data: stateData, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getDeviceState('device-001');

      expect(mockFrom).toHaveBeenCalledWith('device_states');
      expect(result).toEqual(stateData);
    });

    it('should return null when state not found (PGRST116)', async () => {
      const chain = chainBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getDeviceState('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllDeviceStates()', () => {
    it('should return all device states', async () => {
      const states = [
        { device_id: 'device-001' },
        { device_id: 'device-002' },
      ];
      const chain = chainBuilder({ data: states, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getAllDeviceStates();

      expect(mockFrom).toHaveBeenCalledWith('device_states');
      expect(result).toEqual(states);
    });
  });
});
