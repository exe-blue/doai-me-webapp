import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Alert, AlertLevel } from '../types';

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
  chain.single = vi.fn().mockResolvedValue(terminalValue);
  chain.then = (resolve: any) => resolve(terminalValue);
  return chain;
}

const mockFrom = vi.fn();

vi.mock('../supabase', () => ({
  getSupabase: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { AlertRepository } from '../repositories/AlertRepository';

// ─── Test data ─────────────────────────────────────────────────────

const MOCK_ALERT: Alert = {
  id: 1,
  level: 'warning',
  message: 'Device device-001 has been offline for 5 minutes',
  source: 'device-monitor',
  data: {},
  acknowledged: false,
  acknowledged_at: null,
  acknowledged_by: null,
  created_at: '2026-02-06T00:00:00Z',
};

describe('AlertRepository', () => {
  let repo: AlertRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new AlertRepository();
  });

  // ─── findById ─────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return alert when found', async () => {
      const chain = chainBuilder({ data: MOCK_ALERT, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findById(1);

      expect(mockFrom).toHaveBeenCalledWith('alerts');
      expect(chain.eq).toHaveBeenCalledWith('id', 1);
      expect(result).toEqual(MOCK_ALERT);
    });

    it('should return null when not found (PGRST116)', async () => {
      const chain = chainBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findById(999);
      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      const dbError = { code: '42P01', message: 'relation does not exist' };
      const chain = chainBuilder({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(repo.findById(1)).rejects.toEqual(dbError);
    });
  });

  // ─── findUnacknowledged ───────────────────────────────────────

  describe('findUnacknowledged()', () => {
    it('should return unacknowledged alerts with default limit', async () => {
      const chain = chainBuilder({ data: [MOCK_ALERT], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findUnacknowledged();

      expect(chain.eq).toHaveBeenCalledWith('acknowledged', false);
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.limit).toHaveBeenCalledWith(100);
      expect(result).toEqual([MOCK_ALERT]);
    });

    it('should respect custom limit', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.findUnacknowledged(10);

      expect(chain.limit).toHaveBeenCalledWith(10);
    });
  });

  // ─── findByLevel ──────────────────────────────────────────────

  describe('findByLevel()', () => {
    it('should filter by alert level', async () => {
      const chain = chainBuilder({ data: [MOCK_ALERT], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByLevel('warning');

      expect(chain.eq).toHaveBeenCalledWith('level', 'warning');
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(result).toEqual([MOCK_ALERT]);
    });

    it('should respect custom limit', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.findByLevel('critical', 5);

      expect(chain.limit).toHaveBeenCalledWith(5);
    });
  });

  // ─── getRecent ────────────────────────────────────────────────

  describe('getRecent()', () => {
    it('should return recent alerts with default limit', async () => {
      const chain = chainBuilder({ data: [MOCK_ALERT], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getRecent();

      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.limit).toHaveBeenCalledWith(100);
      expect(result).toEqual([MOCK_ALERT]);
    });
  });

  // ─── findByDateRange ──────────────────────────────────────────

  describe('findByDateRange()', () => {
    it('should filter by date range', async () => {
      const chain = chainBuilder({ data: [MOCK_ALERT], error: null });
      mockFrom.mockReturnValue(chain);

      const from = new Date('2026-02-01');
      const to = new Date('2026-02-07');
      const result = await repo.findByDateRange(from, to);

      expect(chain.gte).toHaveBeenCalledWith('created_at', from.toISOString());
      expect(chain.lte).toHaveBeenCalledWith('created_at', to.toISOString());
      expect(result).toEqual([MOCK_ALERT]);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create()', () => {
    it('should insert alert and return it', async () => {
      const chain = chainBuilder({ data: MOCK_ALERT, error: null });
      mockFrom.mockReturnValue(chain);

      const input = { level: 'warning', title: 'Test', message: 'Test alert' };
      const result = await repo.create(input as any);

      expect(chain.insert).toHaveBeenCalledWith(input);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(MOCK_ALERT);
    });
  });

  // ─── createMany ───────────────────────────────────────────────

  describe('createMany()', () => {
    it('should batch insert alerts', async () => {
      const alerts = [MOCK_ALERT, { ...MOCK_ALERT, id: 2 }];
      const chain = chainBuilder({ data: alerts, error: null });
      mockFrom.mockReturnValue(chain);

      const inputs = [
        { level: 'warning', title: 'A', message: 'a' },
        { level: 'critical', title: 'B', message: 'b' },
      ];
      const result = await repo.createMany(inputs as any);

      expect(chain.insert).toHaveBeenCalledWith(inputs);
      expect(chain.select).toHaveBeenCalled();
      expect(result).toEqual(alerts);
    });
  });

  // ─── acknowledge ──────────────────────────────────────────────

  describe('acknowledge()', () => {
    it('should mark alert as acknowledged with user id', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.acknowledge(1, 'user-123');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          acknowledged: true,
          acknowledged_at: expect.any(String),
          acknowledged_by: 'user-123',
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 1);
    });

    it('should set acknowledged_by to null when no user id', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.acknowledge(1);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ acknowledged_by: null })
      );
    });
  });

  // ─── acknowledgeMany ──────────────────────────────────────────

  describe('acknowledgeMany()', () => {
    it('should batch acknowledge alerts', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.acknowledgeMany([1, 2, 3], 'user-123');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          acknowledged: true,
          acknowledged_by: 'user-123',
        })
      );
      expect(chain.in).toHaveBeenCalledWith('id', [1, 2, 3]);
    });
  });

  // ─── acknowledgeAll ───────────────────────────────────────────

  describe('acknowledgeAll()', () => {
    it('should acknowledge all unacknowledged and return count', async () => {
      const chain = chainBuilder({ data: [{ id: 1 }, { id: 2 }], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.acknowledgeAll('user-123');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          acknowledged: true,
          acknowledged_by: 'user-123',
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('acknowledged', false);
      expect(chain.select).toHaveBeenCalledWith('id');
      expect(result).toBe(2);
    });

    it('should return 0 when no unacknowledged alerts', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.acknowledgeAll();
      expect(result).toBe(0);
    });
  });

  // ─── delete ───────────────────────────────────────────────────

  describe('delete()', () => {
    it('should delete alert by id', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.delete(1);

      expect(mockFrom).toHaveBeenCalledWith('alerts');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 1);
    });
  });

  // ─── deleteOld ────────────────────────────────────────────────

  describe('deleteOld()', () => {
    it('should delete old acknowledged alerts and return count', async () => {
      const chain = chainBuilder({ data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.deleteOld(30);

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('acknowledged', true);
      expect(chain.lt).toHaveBeenCalledWith('created_at', expect.any(String));
      expect(chain.select).toHaveBeenCalledWith('id');
      expect(result).toBe(3);
    });

    it('should return 0 when nothing to delete', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.deleteOld();
      expect(result).toBe(0);
    });
  });

  // ─── countUnacknowledged ──────────────────────────────────────

  describe('countUnacknowledged()', () => {
    it('should return count of unacknowledged alerts', async () => {
      const chain = chainBuilder({ count: 7, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.countUnacknowledged();

      expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(chain.eq).toHaveBeenCalledWith('acknowledged', false);
      expect(result).toBe(7);
    });

    it('should return 0 on null count', async () => {
      const chain = chainBuilder({ count: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.countUnacknowledged();
      expect(result).toBe(0);
    });
  });

  // ─── countUnacknowledgedByLevel ───────────────────────────────

  describe('countUnacknowledgedByLevel()', () => {
    it('should count unacknowledged alerts by level', async () => {
      const data = [
        { level: 'critical' },
        { level: 'critical' },
        { level: 'warning' },
        { level: 'info' },
        { level: 'info' },
        { level: 'info' },
      ];
      const chain = chainBuilder({ data, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.countUnacknowledgedByLevel();

      expect(chain.eq).toHaveBeenCalledWith('acknowledged', false);
      expect(result).toEqual<Record<AlertLevel, number>>({
        critical: 2,
        warning: 1,
        info: 3,
      });
    });
  });

  // ─── getTodayStats ────────────────────────────────────────────

  describe('getTodayStats()', () => {
    it('should return today alert stats by level', async () => {
      const data = [
        { level: 'critical' },
        { level: 'warning' },
        { level: 'warning' },
        { level: 'info' },
      ];
      const chain = chainBuilder({ data, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getTodayStats();

      expect(chain.gte).toHaveBeenCalledWith('created_at', expect.any(String));
      expect(result).toEqual({
        total: 4,
        critical: 1,
        warning: 2,
        info: 1,
      });
    });

    it('should return all zeros when no alerts today', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getTodayStats();

      expect(result).toEqual({
        total: 0,
        critical: 0,
        warning: 0,
        info: 0,
      });
    });
  });
});
