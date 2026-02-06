import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, NodeStatus } from '../types';

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
const mockRpc = vi.fn();

vi.mock('../supabase', () => ({
  getSupabase: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

import { NodeRepository } from '../repositories/NodeRepository';

// ─── Test data ─────────────────────────────────────────────────────

const MOCK_NODE: Node = {
  id: 'node-001',
  name: 'Office PC 1',
  status: 'online',
  ip_address: '192.168.1.10',
  cpu_usage: 45.2,
  memory_usage: 62.1,
  device_capacity: 10,
  connected_devices: 3,
  last_seen: '2026-02-06T00:00:00Z',
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('NodeRepository', () => {
  let repo: NodeRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new NodeRepository();
  });

  // ─── findById ─────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return node when found', async () => {
      const chain = chainBuilder({ data: MOCK_NODE, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findById('node-001');

      expect(mockFrom).toHaveBeenCalledWith('nodes');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('id', 'node-001');
      expect(result).toEqual(MOCK_NODE);
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

      await expect(repo.findById('node-001')).rejects.toEqual(dbError);
    });
  });

  // ─── findByStatus ─────────────────────────────────────────────

  describe('findByStatus()', () => {
    it('should filter by status and order by name', async () => {
      const chain = chainBuilder({ data: [MOCK_NODE], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByStatus('online');

      expect(chain.eq).toHaveBeenCalledWith('status', 'online');
      expect(chain.order).toHaveBeenCalledWith('name');
      expect(result).toEqual([MOCK_NODE]);
    });
  });

  // ─── findOnlineNodes ──────────────────────────────────────────

  describe('findOnlineNodes()', () => {
    it('should delegate to findByStatus with online', async () => {
      const chain = chainBuilder({ data: [MOCK_NODE], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findOnlineNodes();

      expect(chain.eq).toHaveBeenCalledWith('status', 'online');
      expect(result).toEqual([MOCK_NODE]);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return all nodes ordered by name', async () => {
      const chain = chainBuilder({ data: [MOCK_NODE], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findAll();

      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.order).toHaveBeenCalledWith('name');
      expect(result).toEqual([MOCK_NODE]);
    });

    it('should return empty array on null data', async () => {
      const chain = chainBuilder({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─── findAvailableNodes ───────────────────────────────────────

  describe('findAvailableNodes()', () => {
    it('should return online nodes with available capacity', async () => {
      const fullNode = { ...MOCK_NODE, id: 'node-002', connected_devices: 10, device_capacity: 10 };
      const chain = chainBuilder({ data: [MOCK_NODE, fullNode], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findAvailableNodes();

      expect(chain.eq).toHaveBeenCalledWith('status', 'online');
      expect(chain.order).toHaveBeenCalledWith('connected_devices');
      // Only MOCK_NODE (3/10) should pass, fullNode (10/10) should be filtered
      expect(result).toEqual([MOCK_NODE]);
    });

    it('should return empty array when all nodes are full', async () => {
      const fullNode = { ...MOCK_NODE, connected_devices: 10, device_capacity: 10 };
      const chain = chainBuilder({ data: [fullNode], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findAvailableNodes();

      expect(result).toEqual([]);
    });
  });

  // ─── upsert ───────────────────────────────────────────────────

  describe('upsert()', () => {
    it('should upsert node with onConflict id', async () => {
      const chain = chainBuilder({ data: MOCK_NODE, error: null });
      mockFrom.mockReturnValue(chain);

      const input = { id: 'node-001', name: 'Office PC 1' };
      const result = await repo.upsert(input as any);

      expect(chain.upsert).toHaveBeenCalledWith(input, { onConflict: 'id' });
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(MOCK_NODE);
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('should update node status with last_seen timestamp', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('node-001', 'offline');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'offline',
          last_seen: expect.any(String),
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 'node-001');
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update()', () => {
    it('should update node fields', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.update('node-001', { cpu_usage: 75.5 });

      expect(chain.update).toHaveBeenCalledWith({ cpu_usage: 75.5 });
      expect(chain.eq).toHaveBeenCalledWith('id', 'node-001');
    });
  });

  // ─── heartbeat ────────────────────────────────────────────────

  describe('heartbeat()', () => {
    it('should update status to online with metrics', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.heartbeat('node-001', { cpu_usage: 50, memory_usage: 70 });

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'online',
          cpu_usage: 50,
          memory_usage: 70,
          last_seen: expect.any(String),
        })
      );
    });

    it('should work without metrics', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.heartbeat('node-001');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'online',
          last_seen: expect.any(String),
        })
      );
    });
  });

  // ─── register ─────────────────────────────────────────────────

  describe('register()', () => {
    it('should upsert with online status and last_seen', async () => {
      const chain = chainBuilder({ data: MOCK_NODE, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.register({ id: 'node-001', name: 'New PC' } as any);

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'node-001',
          name: 'New PC',
          status: 'online',
          last_seen: expect.any(String),
        }),
        { onConflict: 'id' }
      );
      expect(result).toEqual(MOCK_NODE);
    });
  });

  // ─── delete ───────────────────────────────────────────────────

  describe('delete()', () => {
    it('should delete node by id', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.delete('node-001');

      expect(mockFrom).toHaveBeenCalledWith('nodes');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'node-001');
    });
  });

  // ─── setOffline ───────────────────────────────────────────────

  describe('setOffline()', () => {
    it('should delegate to updateStatus with offline', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.setOffline('node-001');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'offline' })
      );
    });
  });

  // ─── markStaleNodesOffline ────────────────────────────────────

  describe('markStaleNodesOffline()', () => {
    it('should update stale online nodes to offline and return ids', async () => {
      const staleNodes = [{ id: 'node-002' }, { id: 'node-003' }];
      const chain = chainBuilder({ data: staleNodes, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.markStaleNodesOffline(60000);

      expect(chain.update).toHaveBeenCalledWith({ status: 'offline' });
      expect(chain.eq).toHaveBeenCalledWith('status', 'online');
      expect(chain.lt).toHaveBeenCalledWith('last_seen', expect.any(String));
      expect(chain.select).toHaveBeenCalledWith('id');
      expect(result).toEqual(['node-002', 'node-003']);
    });

    it('should return empty array when no stale nodes', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.markStaleNodesOffline();

      expect(result).toEqual([]);
    });
  });

  // ─── getStatusCounts ──────────────────────────────────────────

  describe('getStatusCounts()', () => {
    it('should compute status counts', async () => {
      const statusData = [
        { status: 'online' },
        { status: 'online' },
        { status: 'offline' },
        { status: 'error' },
      ];
      const chain = chainBuilder({ data: statusData, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getStatusCounts();

      expect(result).toEqual<Record<NodeStatus, number>>({
        online: 2,
        offline: 1,
        error: 1,
      });
    });
  });

  // ─── getNodeDeviceSummary ─────────────────────────────────────

  describe('getNodeDeviceSummary()', () => {
    it('should call RPC with node id', async () => {
      const summary = [{ node_id: 'node-001', total_devices: 5 }];
      mockRpc.mockResolvedValue({ data: summary, error: null });

      const result = await repo.getNodeDeviceSummary('node-001');

      expect(mockRpc).toHaveBeenCalledWith('get_node_device_summary', {
        p_pc_id: 'node-001',
      });
      expect(result).toEqual(summary);
    });

    it('should call RPC with null when no node id', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      await repo.getNodeDeviceSummary();

      expect(mockRpc).toHaveBeenCalledWith('get_node_device_summary', {
        p_pc_id: null,
      });
    });
  });

  // ─── count / countOnline ──────────────────────────────────────

  describe('count()', () => {
    it('should return exact node count', async () => {
      const chain = chainBuilder({ count: 5, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.count();

      expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(result).toBe(5);
    });

    it('should return 0 on null count', async () => {
      const chain = chainBuilder({ count: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.count();

      expect(result).toBe(0);
    });
  });

  describe('countOnline()', () => {
    it('should return count of online nodes', async () => {
      const chain = chainBuilder({ count: 3, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.countOnline();

      expect(chain.eq).toHaveBeenCalledWith('status', 'online');
      expect(result).toBe(3);
    });
  });
});
