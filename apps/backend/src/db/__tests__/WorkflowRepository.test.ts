import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workflow } from '../types';

// ─── Supabase mock chain builder ───────────────────────────────────

function chainBuilder(terminalValue: any = { data: null, error: null }) {
  const chain: Record<string, any> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'single', 'order', 'limit', 'range',
    'lt', 'gt', 'gte', 'lte', 'not', 'contains',
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

import { WorkflowRepository } from '../repositories/WorkflowRepository';

// ─── Test data ─────────────────────────────────────────────────────

const MOCK_WORKFLOW: Workflow = {
  id: 'wf-001',
  name: 'YouTube Search Bot',
  description: 'Automates YouTube search and watch',
  category: 'youtube',
  tags: ['youtube', 'search', 'bot'],
  steps: [],
  is_active: true,
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('WorkflowRepository', () => {
  let repo: WorkflowRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new WorkflowRepository();
  });

  // ─── findById ─────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return workflow when found', async () => {
      const chain = chainBuilder({ data: MOCK_WORKFLOW, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findById('wf-001');

      expect(mockFrom).toHaveBeenCalledWith('workflows');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('id', 'wf-001');
      expect(result).toEqual(MOCK_WORKFLOW);
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

      await expect(repo.findById('wf-001')).rejects.toEqual(dbError);
    });
  });

  // ─── findActive ───────────────────────────────────────────────

  describe('findActive()', () => {
    it('should return active workflows ordered by name', async () => {
      const chain = chainBuilder({ data: [MOCK_WORKFLOW], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findActive();

      expect(chain.eq).toHaveBeenCalledWith('is_active', true);
      expect(chain.order).toHaveBeenCalledWith('name');
      expect(result).toEqual([MOCK_WORKFLOW]);
    });

    it('should return empty array when none active', async () => {
      const chain = chainBuilder({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findActive();
      expect(result).toEqual([]);
    });
  });

  // ─── findByCategory ───────────────────────────────────────────

  describe('findByCategory()', () => {
    it('should filter by category and active status', async () => {
      const chain = chainBuilder({ data: [MOCK_WORKFLOW], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByCategory('youtube');

      expect(chain.eq).toHaveBeenCalledWith('category', 'youtube');
      expect(chain.eq).toHaveBeenCalledWith('is_active', true);
      expect(chain.order).toHaveBeenCalledWith('name');
      expect(result).toEqual([MOCK_WORKFLOW]);
    });
  });

  // ─── findByTag ────────────────────────────────────────────────

  describe('findByTag()', () => {
    it('should filter by tag using contains', async () => {
      const chain = chainBuilder({ data: [MOCK_WORKFLOW], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByTag('youtube');

      expect(chain.contains).toHaveBeenCalledWith('tags', ['youtube']);
      expect(chain.eq).toHaveBeenCalledWith('is_active', true);
      expect(result).toEqual([MOCK_WORKFLOW]);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return only active workflows by default', async () => {
      const chain = chainBuilder({ data: [MOCK_WORKFLOW], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findAll();

      expect(chain.order).toHaveBeenCalledWith('name');
      expect(chain.eq).toHaveBeenCalledWith('is_active', true);
      expect(result).toEqual([MOCK_WORKFLOW]);
    });

    it('should include inactive when flag is true', async () => {
      const chain = chainBuilder({ data: [MOCK_WORKFLOW], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.findAll(true);

      // eq should not be called with is_active
      expect(chain.eq).not.toHaveBeenCalledWith('is_active', true);
    });
  });

  // ─── getCategories ────────────────────────────────────────────

  describe('getCategories()', () => {
    it('should return unique sorted categories', async () => {
      const data = [
        { category: 'youtube' },
        { category: 'system' },
        { category: 'youtube' },
        { category: 'adb' },
      ];
      const chain = chainBuilder({ data, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getCategories();

      expect(chain.not).toHaveBeenCalledWith('category', 'is', null);
      expect(result).toEqual(['adb', 'system', 'youtube']);
    });

    it('should return empty array when no workflows', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getCategories();
      expect(result).toEqual([]);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create()', () => {
    it('should insert workflow and return it', async () => {
      const chain = chainBuilder({ data: MOCK_WORKFLOW, error: null });
      mockFrom.mockReturnValue(chain);

      const input = { name: 'YouTube Search Bot', steps: [] };
      const result = await repo.create(input as any);

      expect(chain.insert).toHaveBeenCalledWith(input);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(MOCK_WORKFLOW);
    });

    it('should throw on insert error', async () => {
      const dbError = { message: 'insert failed' };
      const chain = chainBuilder({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(repo.create({} as any)).rejects.toEqual(dbError);
    });
  });

  // ─── upsert ───────────────────────────────────────────────────

  describe('upsert()', () => {
    it('should upsert with onConflict id', async () => {
      const chain = chainBuilder({ data: MOCK_WORKFLOW, error: null });
      mockFrom.mockReturnValue(chain);

      const input = { id: 'wf-001', name: 'Updated' };
      await repo.upsert(input as any);

      expect(chain.upsert).toHaveBeenCalledWith(input, { onConflict: 'id' });
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update()', () => {
    it('should update workflow fields', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.update('wf-001', { name: 'New Name' });

      expect(chain.update).toHaveBeenCalledWith({ name: 'New Name' });
      expect(chain.eq).toHaveBeenCalledWith('id', 'wf-001');
    });
  });

  // ─── setActive ────────────────────────────────────────────────

  describe('setActive()', () => {
    it('should set is_active to true', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.setActive('wf-001', true);

      expect(chain.update).toHaveBeenCalledWith({ is_active: true });
      expect(chain.eq).toHaveBeenCalledWith('id', 'wf-001');
    });

    it('should set is_active to false', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.setActive('wf-001', false);

      expect(chain.update).toHaveBeenCalledWith({ is_active: false });
    });
  });

  // ─── incrementVersion ─────────────────────────────────────────

  describe('incrementVersion()', () => {
    it('should use RPC for atomic increment', async () => {
      mockRpc.mockResolvedValue({ data: [{ version: 2 }], error: null });

      const result = await repo.incrementVersion('wf-001');

      expect(mockRpc).toHaveBeenCalledWith('increment_workflow_version', {
        workflow_id: 'wf-001',
      });
      expect(result).toBe(2);
    });

    it('should fall back to optimistic lock when RPC missing (42883)', async () => {
      // RPC fails with function not found
      mockRpc.mockResolvedValue({ error: { code: '42883', message: 'function not found' } });

      // Fallback: select current version, then update with optimistic lock
      const selectChain = chainBuilder({ data: { version: 3 }, error: null });
      const updateChain = chainBuilder({ data: [{ version: 4 }], error: null });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        // First call is select (findById in fallback), second is update
        return callCount % 2 === 1 ? selectChain : updateChain;
      });

      const result = await repo.incrementVersion('wf-001');

      expect(result).toBe(4);
    });

    it('should handle scalar RPC return value', async () => {
      mockRpc.mockResolvedValue({ data: 5, error: null });

      const result = await repo.incrementVersion('wf-001');

      expect(result).toBe(5);
    });
  });

  // ─── delete ───────────────────────────────────────────────────

  describe('delete()', () => {
    it('should delete workflow by id', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.delete('wf-001');

      expect(mockFrom).toHaveBeenCalledWith('workflows');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'wf-001');
    });
  });

  // ─── softDelete ───────────────────────────────────────────────

  describe('softDelete()', () => {
    it('should set is_active to false', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.softDelete('wf-001');

      expect(chain.update).toHaveBeenCalledWith({ is_active: false });
    });
  });

  // ─── count ────────────────────────────────────────────────────

  describe('count()', () => {
    it('should count active workflows by default', async () => {
      const chain = chainBuilder({ count: 10, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.count();

      expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(chain.eq).toHaveBeenCalledWith('is_active', true);
      expect(result).toBe(10);
    });

    it('should count all workflows when activeOnly is false', async () => {
      const chain = chainBuilder({ count: 15, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.count(false);

      expect(chain.eq).not.toHaveBeenCalledWith('is_active', true);
      expect(result).toBe(15);
    });

    it('should return 0 on null count', async () => {
      const chain = chainBuilder({ count: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.count();
      expect(result).toBe(0);
    });
  });

  // ─── countByCategory ──────────────────────────────────────────

  describe('countByCategory()', () => {
    it('should count workflows grouped by category', async () => {
      const data = [
        { category: 'youtube' },
        { category: 'youtube' },
        { category: 'system' },
        { category: null },
      ];
      const chain = chainBuilder({ data, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.countByCategory();

      expect(result).toEqual({
        youtube: 2,
        system: 1,
        uncategorized: 1,
      });
    });
  });
});
