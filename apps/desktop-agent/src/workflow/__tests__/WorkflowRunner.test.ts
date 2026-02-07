import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowRunner, Workflow } from '../WorkflowRunner';
import type { WorkflowStep } from '@doai/shared/database';

// Mock AdbController module
const mockExecute = vi.fn();
vi.mock('../../device/AdbController', () => ({
  getAdbController: () => ({
    execute: mockExecute,
    getBatteryLevel: vi.fn().mockResolvedValue(80),
    getConnectedDevices: vi.fn().mockResolvedValue(['d1']),
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

function createStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1',
    action: 'adb',
    command: 'shell ls',
    script: '',
    onError: 'fail',
    timeout: 30000,
    ...overrides,
  } as WorkflowStep;
}

function createWorkflow(steps: WorkflowStep[]): Workflow {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    version: 1,
    timeout: 300000,
    steps,
  };
}

describe('WorkflowRunner', () => {
  let runner: WorkflowRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue('ok');
    runner = new WorkflowRunner('node-1');
  });

  // ================================================================
  // Basic Execution
  // ================================================================

  describe('executeWorkflow', () => {
    it('should execute a single-step workflow', async () => {
      const workflow = createWorkflow([createStep()]);

      await runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow);

      expect(mockExecute).toHaveBeenCalledWith('d1', 'shell ls');
    });

    it('should execute multi-step workflow sequentially', async () => {
      const workflow = createWorkflow([
        createStep({ id: 's1', command: 'shell ls' }),
        createStep({ id: 's2', command: 'shell pwd' }),
        createStep({ id: 's3', command: 'shell whoami' }),
      ]);

      await runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow);

      expect(mockExecute).toHaveBeenCalledTimes(3);
    });

    it('should throw for unknown workflow', async () => {
      await expect(
        runner.executeWorkflow('unknown', 'd1', {})
      ).rejects.toThrow('Workflow not found');
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();
      const workflow = createWorkflow([
        createStep({ id: 's1' }),
        createStep({ id: 's2' }),
      ]);

      await runner.executeWorkflow('wf-1', 'd1', {}, { onProgress }, workflow);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(50, 's1');
      expect(onProgress).toHaveBeenCalledWith(100, 's2');
    });

    it('should track running workflows', async () => {
      let runningDuringExec: number = 0;

      const workflow = createWorkflow([
        createStep({ id: 's1' }),
      ]);

      mockExecute.mockImplementation(async () => {
        runningDuringExec = runner.getRunningWorkflows().length;
        return 'ok';
      });

      await runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow);

      expect(runningDuringExec).toBe(1);
      expect(runner.getRunningWorkflows()).toHaveLength(0); // Cleaned up
    });
  });

  // ================================================================
  // Step Actions
  // ================================================================

  describe('step actions', () => {
    it('should execute wait action', async () => {
      const workflow = createWorkflow([
        createStep({ id: 's1', action: 'wait', script: '10' }),
      ]);

      const start = Date.now();
      await runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(9); // ~10ms wait
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should execute system action', async () => {
      const workflow = createWorkflow([
        createStep({ id: 's1', action: 'system', script: 'report_completion' }),
      ]);

      // Should not throw
      await runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow);
    });

    it('should throw for unknown action', async () => {
      const workflow = createWorkflow([
        createStep({ id: 's1', action: 'unknown_action' as any }),
      ]);

      await expect(
        runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow)
      ).rejects.toThrow('Unknown action');
    });
  });

  // ================================================================
  // Error Handling
  // ================================================================

  describe('error handling', () => {
    it('should propagate error with fail policy', async () => {
      mockExecute.mockRejectedValue(new Error('adb error'));

      const workflow = createWorkflow([
        createStep({ id: 's1', onError: 'fail' }),
      ]);

      await expect(
        runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow)
      ).rejects.toThrow('adb error');
    });

    it('should skip step with skip policy', async () => {
      mockExecute
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');

      const workflow = createWorkflow([
        createStep({ id: 's1', onError: 'skip' }),
        createStep({ id: 's2' }),
      ]);

      await runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow);

      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('should retry on failure', async () => {
      mockExecute
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');

      const workflow = createWorkflow([
        createStep({
          id: 's1',
          retry: { attempts: 2, delay: 10, backoff: 'fixed' },
        }),
      ]);

      await runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow);

      expect(mockExecute).toHaveBeenCalledTimes(3); // 1 original + 2 retries
    });
  });

  // ================================================================
  // Template Interpolation
  // ================================================================

  describe('template interpolation', () => {
    it('should replace {{variables}} in commands', async () => {
      mockExecute.mockResolvedValue('ok');

      const workflow = createWorkflow([
        createStep({ id: 's1', command: 'shell am start {{package}}' }),
      ]);

      await runner.executeWorkflow('wf-1', 'd1', { package: 'com.test.app' }, {}, workflow);

      expect(mockExecute).toHaveBeenCalledWith('d1', 'shell am start com.test.app');
    });
  });

  // ================================================================
  // Cancellation
  // ================================================================

  describe('cancelWorkflow', () => {
    it('should cancel a running workflow', async () => {
      // Use a multi-step workflow where cancellation is checked between steps
      const workflow = createWorkflow([
        createStep({ id: 's1', action: 'adb', command: 'shell echo step1' }),
        createStep({ id: 's2', action: 'adb', command: 'shell echo step2' }),
        createStep({ id: 's3', action: 'adb', command: 'shell echo step3' }),
      ]);

      let stepCount = 0;
      mockExecute.mockImplementation(async () => {
        stepCount++;
        if (stepCount === 1) {
          // After first step completes, cancel the workflow
          runner.cancelWorkflow('exec-1');
        }
        return 'ok';
      });

      await expect(
        runner.executeWorkflow('wf-1', 'd1', {}, {}, workflow, 'exec-1')
      ).rejects.toThrow('Workflow cancelled');

      // Should have only executed the first step
      expect(stepCount).toBe(1);
    });

    it('should return false for unknown execution', () => {
      expect(runner.cancelWorkflow('unknown')).toBe(false);
    });
  });

  // ================================================================
  // Cleanup
  // ================================================================

  describe('cleanup', () => {
    it('should clear running workflows', async () => {
      await runner.cleanup();
      expect(runner.getRunningWorkflows()).toHaveLength(0);
    });
  });
});
