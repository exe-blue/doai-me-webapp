import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowExecution, ExecutionStatus } from '../types';

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

import { WorkflowExecutionRepository } from '../repositories/WorkflowExecutionRepository';

// ─── Test data ─────────────────────────────────────────────────────

const MOCK_EXECUTION: WorkflowExecution = {
  id: 'exec-001',
  execution_id: 'exec_123_abc',
  workflow_id: 'wf-001',
  device_id: 'device-001',
  status: 'running',
  current_step: 'step-1',
  progress: 50,
  total_devices: 5,
  completed_devices: 2,
  failed_devices: 1,
  result: null,
  error_message: null,
  started_at: '2026-02-06T00:00:00Z',
  completed_at: null,
  created_at: '2026-02-06T00:00:00Z',
  updated_at: '2026-02-06T00:00:00Z',
};

describe('WorkflowExecutionRepository', () => {
  let repo: WorkflowExecutionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new WorkflowExecutionRepository();
  });

  // ─── findById ─────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return execution when found', async () => {
      const chain = chainBuilder({ data: MOCK_EXECUTION, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findById('exec-001');

      expect(mockFrom).toHaveBeenCalledWith('workflow_executions');
      expect(chain.eq).toHaveBeenCalledWith('id', 'exec-001');
      expect(result).toEqual(MOCK_EXECUTION);
    });

    it('should return null when not found', async () => {
      const chain = chainBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── findByExecutionId ────────────────────────────────────────

  describe('findByExecutionId()', () => {
    it('should filter by execution_id', async () => {
      const chain = chainBuilder({ data: MOCK_EXECUTION, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByExecutionId('exec_123_abc');

      expect(chain.eq).toHaveBeenCalledWith('execution_id', 'exec_123_abc');
      expect(result).toEqual(MOCK_EXECUTION);
    });

    it('should return null when not found', async () => {
      const chain = chainBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByExecutionId('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── findByDeviceId ───────────────────────────────────────────

  describe('findByDeviceId()', () => {
    it('should return executions for device with default limit', async () => {
      const chain = chainBuilder({ data: [MOCK_EXECUTION], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByDeviceId('device-001');

      expect(chain.eq).toHaveBeenCalledWith('device_id', 'device-001');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(result).toEqual([MOCK_EXECUTION]);
    });

    it('should respect custom limit', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.findByDeviceId('device-001', 10);

      expect(chain.limit).toHaveBeenCalledWith(10);
    });
  });

  // ─── findByStatus ─────────────────────────────────────────────

  describe('findByStatus()', () => {
    it('should filter by status', async () => {
      const chain = chainBuilder({ data: [MOCK_EXECUTION], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findByStatus('running');

      expect(chain.eq).toHaveBeenCalledWith('status', 'running');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toEqual([MOCK_EXECUTION]);
    });
  });

  // ─── getRecent ────────────────────────────────────────────────

  describe('getRecent()', () => {
    it('should select with workflow and device joins', async () => {
      const joinedData = [{ ...MOCK_EXECUTION, workflow: { name: 'Bot' }, device: { name: 'Phone', model: 'Pixel' } }];
      const chain = chainBuilder({ data: joinedData, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getRecent(20);

      expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('workflow:workflows(name)'));
      expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('device:devices(name, model)'));
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(result).toEqual(joinedData);
    });

    it('should default to limit 100', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.getRecent();

      expect(chain.limit).toHaveBeenCalledWith(100);
    });
  });

  // ─── findRunning ──────────────────────────────────────────────

  describe('findRunning()', () => {
    it('should find running and pending executions', async () => {
      const chain = chainBuilder({ data: [MOCK_EXECUTION], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.findRunning();

      expect(chain.in).toHaveBeenCalledWith('status', ['running', 'pending']);
      expect(chain.order).toHaveBeenCalledWith('started_at', { ascending: false });
      expect(result).toEqual([MOCK_EXECUTION]);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create()', () => {
    it('should insert with default status and generated execution_id', async () => {
      const chain = chainBuilder({ data: MOCK_EXECUTION, error: null });
      mockFrom.mockReturnValue(chain);

      const input = { workflow_id: 'wf-001', device_id: 'device-001' };
      const result = await repo.create(input as any);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow_id: 'wf-001',
          device_id: 'device-001',
          status: 'queued',
          execution_id: expect.stringMatching(/^exec_\d+_[a-z0-9]+$/),
        })
      );
      expect(result).toEqual(MOCK_EXECUTION);
    });

    it('should preserve provided status and execution_id', async () => {
      const chain = chainBuilder({ data: MOCK_EXECUTION, error: null });
      mockFrom.mockReturnValue(chain);

      const input = {
        workflow_id: 'wf-001',
        status: 'pending',
        execution_id: 'custom-id',
      };
      await repo.create(input as any);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          execution_id: 'custom-id',
        })
      );
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('should auto-set started_at for running status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('exec-001', 'running');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          started_at: expect.any(String),
        })
      );
    });

    it('should not override provided started_at', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('exec-001', 'running', {
        started_at: '2026-01-01T00:00:00Z',
      });

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          started_at: '2026-01-01T00:00:00Z',
        })
      );
    });

    it('should auto-set completed_at for completed status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('exec-001', 'completed');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_at: expect.any(String),
        })
      );
    });

    it('should auto-set completed_at for failed status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('exec-001', 'failed', {
        error_message: 'Device disconnected',
      });

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Device disconnected',
          completed_at: expect.any(String),
        })
      );
    });

    it('should auto-set completed_at for cancelled status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('exec-001', 'cancelled');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ completed_at: expect.any(String) })
      );
    });

    it('should auto-set completed_at for partial status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('exec-001', 'partial');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ completed_at: expect.any(String) })
      );
    });

    it('should NOT auto-set timestamps for queued status', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatus('exec-001', 'queued');

      expect(chain.update).toHaveBeenCalledWith({ status: 'queued' });
    });
  });

  // ─── updateStatusByExecutionId ────────────────────────────────

  describe('updateStatusByExecutionId()', () => {
    it('should update by execution_id with auto timestamps', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatusByExecutionId('exec_123', 'running');

      expect(chain.eq).toHaveBeenCalledWith('execution_id', 'exec_123');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          started_at: expect.any(String),
        })
      );
    });

    it('should set completed_at for terminal statuses', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateStatusByExecutionId('exec_123', 'completed');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ completed_at: expect.any(String) })
      );
    });
  });

  // ─── updateProgress ───────────────────────────────────────────

  describe('updateProgress()', () => {
    it('should update progress percentage', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateProgress('exec-001', 75);

      expect(chain.update).toHaveBeenCalledWith({ progress: 75 });
      expect(chain.eq).toHaveBeenCalledWith('id', 'exec-001');
    });

    it('should include current_step when provided', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.updateProgress('exec-001', 80, 'step-3');

      expect(chain.update).toHaveBeenCalledWith({
        progress: 80,
        current_step: 'step-3',
      });
    });
  });

  // ─── incrementDeviceCount ─────────────────────────────────────

  describe('incrementDeviceCount()', () => {
    it('should use RPC for atomic completed increment', async () => {
      mockRpc.mockResolvedValue({ error: null });

      await repo.incrementDeviceCount('exec-001', 'completed');

      expect(mockRpc).toHaveBeenCalledWith('increment_execution_device_count', {
        exec_id: 'exec-001',
        count_type: 'completed',
      });
    });

    it('should use RPC for atomic failed increment', async () => {
      mockRpc.mockResolvedValue({ error: null });

      await repo.incrementDeviceCount('exec-001', 'failed');

      expect(mockRpc).toHaveBeenCalledWith('increment_execution_device_count', {
        exec_id: 'exec-001',
        count_type: 'failed',
      });
    });

    it('should fall back when RPC missing (42883)', async () => {
      mockRpc.mockResolvedValue({ error: { code: '42883', message: 'function not found' } });

      // Fallback: select → update with optimistic lock
      const selectChain = chainBuilder({
        data: { total_devices: 5, completed_devices: 2, failed_devices: 1 },
        error: null,
      });
      const updateChain = chainBuilder({ data: [{ id: 'exec-001' }], error: null });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        return callCount % 2 === 1 ? selectChain : updateChain;
      });

      await repo.incrementDeviceCount('exec-001', 'completed');

      // Verify optimistic lock: eq(columnToIncrement, currentValue)
      expect(updateChain.eq).toHaveBeenCalledWith('completed_devices', 2);
    });
  });

  // ─── delete ───────────────────────────────────────────────────

  describe('delete()', () => {
    it('should delete execution by id', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.delete('exec-001');

      expect(mockFrom).toHaveBeenCalledWith('workflow_executions');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'exec-001');
    });
  });

  // ─── addLog ───────────────────────────────────────────────────

  describe('addLog()', () => {
    it('should insert execution log', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.addLog('exec-001', 'info', 'Step completed', {
        step_id: 'step-1',
        device_id: 'device-001',
        status: 'completed',
      });

      expect(mockFrom).toHaveBeenCalledWith('execution_logs');
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: 'exec-001',
          level: 'info',
          message: 'Step completed',
          step_id: 'step-1',
          device_id: 'device-001',
          status: 'completed',
        })
      );
    });

    it('should insert log without options', async () => {
      const chain = chainBuilder({ data: null, error: null });
      chain.then = (resolve: any) => resolve({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await repo.addLog('exec-001', 'error', 'Something failed');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: 'exec-001',
          level: 'error',
          message: 'Something failed',
        })
      );
    });
  });

  // ─── getLogs ──────────────────────────────────────────────────

  describe('getLogs()', () => {
    it('should get logs ordered by created_at ascending', async () => {
      const logs = [{ id: 1, message: 'log1' }];
      const chain = chainBuilder({ data: logs, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getLogs('exec-001');

      expect(mockFrom).toHaveBeenCalledWith('execution_logs');
      expect(chain.eq).toHaveBeenCalledWith('execution_id', 'exec-001');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(result).toEqual(logs);
    });

    it('should filter by level when provided', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.getLogs('exec-001', { level: 'error' });

      expect(chain.eq).toHaveBeenCalledWith('level', 'error');
    });

    it('should apply limit when provided', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.getLogs('exec-001', { limit: 10 });

      expect(chain.limit).toHaveBeenCalledWith(10);
    });
  });

  // ─── getDeviceLogs ────────────────────────────────────────────

  describe('getDeviceLogs()', () => {
    it('should get device logs with default limit', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.getDeviceLogs('device-001');

      expect(chain.eq).toHaveBeenCalledWith('device_id', 'device-001');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.limit).toHaveBeenCalledWith(100);
    });

    it('should respect custom limit', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await repo.getDeviceLogs('device-001', 25);

      expect(chain.limit).toHaveBeenCalledWith(25);
    });
  });

  // ─── countByStatus ────────────────────────────────────────────

  describe('countByStatus()', () => {
    it('should compute status counts', async () => {
      const statusData = [
        { status: 'queued' },
        { status: 'running' },
        { status: 'running' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' },
      ];
      const chain = chainBuilder({ data: statusData, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.countByStatus();

      expect(result).toEqual<Record<ExecutionStatus, number>>({
        queued: 1,
        pending: 0,
        running: 2,
        completed: 3,
        failed: 1,
        cancelled: 0,
        partial: 0,
      });
    });
  });

  // ─── getStats ─────────────────────────────────────────────────

  describe('getStats()', () => {
    it('should compute period stats with success rate', async () => {
      const statusData = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'running' },
      ];
      const chain = chainBuilder({ data: statusData, error: null });
      mockFrom.mockReturnValue(chain);

      const from = new Date('2026-01-01');
      const to = new Date('2026-02-01');
      const result = await repo.getStats(from, to);

      expect(chain.gte).toHaveBeenCalledWith('created_at', from.toISOString());
      expect(chain.lte).toHaveBeenCalledWith('created_at', to.toISOString());
      expect(result).toEqual({
        total: 5,
        completed: 3,
        failed: 1,
        successRate: 60,
      });
    });

    it('should return 0 success rate when no executions', async () => {
      const chain = chainBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await repo.getStats(new Date(), new Date());

      expect(result).toEqual({
        total: 0,
        completed: 0,
        failed: 0,
        successRate: 0,
      });
    });
  });
});
