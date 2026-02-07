import { describe, it, expect } from 'vitest';
import type { WorkflowStep } from './database';

describe('database — WorkflowStep', () => {
  it('scrcpy_control 액션을 지원', () => {
    const step: WorkflowStep = {
      id: 'test-scrcpy',
      action: 'scrcpy_control',
      params: { type: 'youtube_search', keyword: '테스트' },
    };
    expect(step.action).toBe('scrcpy_control');
    expect(step.params).toBeDefined();
  });

  it('기존 액션 타입 모두 유효', () => {
    const actions: WorkflowStep['action'][] = [
      'adb', 'system', 'wait', 'condition', 'celery', 'appium', 'scrcpy_control',
    ];
    expect(actions).toHaveLength(7);
    for (const action of actions) {
      const step: WorkflowStep = { id: `test-${action}`, action };
      expect(step.action).toBe(action);
    }
  });

  it('WorkflowStep의 optional 필드가 생략 가능', () => {
    const step: WorkflowStep = {
      id: 'minimal',
      action: 'adb',
    };
    expect(step.script).toBeUndefined();
    expect(step.command).toBeUndefined();
    expect(step.params).toBeUndefined();
    expect(step.timeout).toBeUndefined();
    expect(step.retry).toBeUndefined();
    expect(step.onError).toBeUndefined();
  });

  it('WorkflowStep에 모든 필드를 포함할 수 있음', () => {
    const step: WorkflowStep = {
      id: 'full',
      action: 'adb',
      script: 'test.sh',
      command: 'shell ls',
      params: { key: 'value' },
      timeout: 30000,
      retry: { attempts: 3, delay: 1000, backoff: 'exponential' },
      onError: 'skip',
      nextOnError: 'fallback-step',
    };
    expect(step.retry!.attempts).toBe(3);
    expect(step.onError).toBe('skip');
  });
});
