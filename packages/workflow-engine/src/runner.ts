/**
 * Workflow Runner
 * 
 * 워크플로우 정의를 실행하는 엔진
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  WorkflowDefinition, 
  WorkflowStep, 
  ExecutionContext, 
  StepResult,
  WorkflowResult,
  WorkflowRunnerOptions,
  WorkflowExecutionError,
  parseTimeString,
  StepEvent,
  WorkflowEvent
} from './types';
import { TemplateInterpolator } from './interpolator';

/**
 * 워크플로우 실행기
 */
export class WorkflowRunner extends EventEmitter {
  private interpolator = new TemplateInterpolator();
  private options: WorkflowRunnerOptions;
  private aborted = false;
  private currentExecution: ExecutionContext | null = null;

  constructor(options: WorkflowRunnerOptions) {
    super();
    this.options = {
      scriptBasePath: './scripts',
      defaultTimeout: 30000,
      debug: false,
      ...options,
    };
  }

  // ============================================
  // 실행 메서드
  // ============================================

  /**
   * 워크플로우 실행
   */
  async run(
    workflow: WorkflowDefinition,
    context: ExecutionContext
  ): Promise<WorkflowResult> {
    this.aborted = false;
    this.currentExecution = context;
    
    const results = new Map<string, StepResult>();
    const startTime = Date.now();
    
    // 파라미터와 변수 합치기
    const allContext = { 
      ...context.params, 
      ...context.variables,
      device_id: context.deviceId,
      node_id: context.nodeId,
      execution_id: context.executionId,
      workflow_id: context.workflowId,
      timestamp: Date.now(),
    };

    this.emitEvent('start', {
      type: 'start',
      workflowId: workflow.id,
      executionId: context.executionId,
      timestamp: startTime,
      data: { context },
    });

    // Track timeout timer for proper cleanup
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    try {
      // 전체 타임아웃 설정
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new WorkflowExecutionError('Workflow timeout')),
          workflow.timeout
        );
      });

      // 스텝 실행
      const executionPromise = this.executeSteps(
        workflow.steps,
        context,
        allContext,
        results
      );

      await Promise.race([executionPromise, timeoutPromise]);
      
      // Clear timeout on success
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const duration = Date.now() - startTime;

      this.emitEvent('complete', {
        type: 'complete',
        workflowId: workflow.id,
        executionId: context.executionId,
        timestamp: Date.now(),
        data: { success: true, duration, results: Object.fromEntries(results) },
      });

      return {
        success: true,
        duration,
        steps: results,
        context,
      };

    } catch (error) {
      const err = error as Error;
      const duration = Date.now() - startTime;

      this.emitEvent('error', {
        type: 'error',
        workflowId: workflow.id,
        executionId: context.executionId,
        timestamp: Date.now(),
        data: { error: err.message },
      });

      // on_error 스텝 실행
      if (workflow.on_error && workflow.on_error.length > 0) {
        try {
          await this.executeSteps(
            workflow.on_error,
            context,
            allContext,
            new Map()
          );
        } catch (onErrorError) {
          console.error('on_error 핸들러 실행 실패:', onErrorError);
        }
      }

      return {
        success: false,
        duration,
        steps: results,
        error: err.message,
        context,
      };

    } finally {
      // Ensure timeout is always cleared
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.currentExecution = null;
    }
  }

  /**
   * 실행 중단
   */
  abort(): void {
    this.aborted = true;
    
    if (this.currentExecution) {
      this.emitEvent('abort', {
        type: 'abort',
        workflowId: this.currentExecution.workflowId,
        executionId: this.currentExecution.executionId,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 실행 중 여부
   */
  isRunning(): boolean {
    return this.currentExecution !== null;
  }

  // ============================================
  // 스텝 실행
  // ============================================

  /**
   * 스텝 배열 순차 실행
   */
  private async executeSteps(
    steps: WorkflowStep[],
    context: ExecutionContext,
    allContext: Record<string, unknown>,
    results: Map<string, StepResult>
  ): Promise<void> {
    for (const step of steps) {
      if (this.aborted) {
        throw new WorkflowExecutionError('Workflow aborted');
      }

      // 비활성화된 스텝 스킵
      if (step.enabled === false) {
        results.set(step.id, {
          success: true,
          skipped: true,
          skipReason: 'Step disabled',
          duration: 0,
        });
        continue;
      }

      // 의존성 체크
      if (step.depends_on && step.depends_on.length > 0) {
        const unmetDeps = step.depends_on.filter(depId => {
          const depResult = results.get(depId);
          return !depResult || !depResult.success;
        });

        if (unmetDeps.length > 0) {
          results.set(step.id, {
            success: false,
            skipped: true,
            skipReason: `Unmet dependencies: ${unmetDeps.join(', ')}`,
            duration: 0,
          });
          continue;
        }
      }

      context.currentStep = step.id;

      this.emitStepEvent('step:start', {
        type: 'step:start',
        workflowId: context.workflowId,
        executionId: context.executionId,
        stepId: step.id,
        stepName: step.name,
        timestamp: Date.now(),
      });

      const result = await this.executeStep(step, context, allContext);
      results.set(step.id, result);

      this.emitStepEvent('step:complete', {
        type: 'step:complete',
        workflowId: context.workflowId,
        executionId: context.executionId,
        stepId: step.id,
        stepName: step.name,
        timestamp: Date.now(),
        result,
      });

      // 에러 처리
      if (!result.success) {
        const onError = step.on_error || 'stop';

        switch (onError) {
          case 'stop':
          case 'fail':
            throw new WorkflowExecutionError(
              `Step ${step.id} failed: ${result.error}`,
              step.id
            );
          case 'skip':
          case 'continue':
            // 계속 진행
            break;
          case 'retry':
            // retry 설정이 있으면 이미 재시도됨
            break;
        }
      }

      // 결과를 컨텍스트에 추가
      if (result.output !== undefined) {
        allContext[`${step.id}_result`] = result.output;
        allContext[`${step.id}_success`] = result.success;
      }
    }
  }

  /**
   * 단일 스텝 실행 (재시도 포함)
   */
  private async executeStep(
    step: WorkflowStep,
    context: ExecutionContext,
    allContext: Record<string, unknown>
  ): Promise<StepResult> {
    const startTime = Date.now();
    
    // 템플릿 치환
    const interpolatedStep = this.interpolator.interpolateObject(step, allContext);

    // 재시도 설정
    let maxAttempts = 1;
    let retryDelay = 1000;
    let backoff: 'linear' | 'exponential' | 'none' = 'linear';

    if (interpolatedStep.retry) {
      if (typeof interpolatedStep.retry === 'number') {
        maxAttempts = interpolatedStep.retry;
      } else {
        maxAttempts = interpolatedStep.retry.attempts || 1;
        retryDelay = interpolatedStep.retry.delay || 1000;
        backoff = interpolatedStep.retry.backoff || 'linear';
      }
    }

    let lastError: string | undefined;
    let retries = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output = await this.executeAction(interpolatedStep, context);
        
        return {
          success: true,
          output,
          duration: Date.now() - startTime,
          retries,
        };

      } catch (error) {
        lastError = (error as Error).message;
        retries++;

        if (attempt < maxAttempts) {
          const delay = this.calculateDelay(retryDelay, attempt, backoff);

          this.emitStepEvent('step:retry', {
            type: 'step:retry',
            workflowId: context.workflowId,
            executionId: context.executionId,
            stepId: step.id,
            stepName: step.name,
            timestamp: Date.now(),
            attempt,
            delay,
          });

          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      duration: Date.now() - startTime,
      retries,
    };
  }

  /**
   * 액션 실행
   */
  private async executeAction(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<unknown> {
    const timeout = step.timeout 
      ? parseTimeString(step.timeout)
      : this.options.defaultTimeout!;

    switch (step.action) {
      case 'adb':
        return this.executeAdb(step, context, timeout);

      case 'autox':
        return this.executeAutox(step, context, timeout);

      case 'wait':
        return this.executeWait(step);

      case 'condition':
        return this.executeCondition(step, context);

      case 'system':
        return this.executeSystem(step, context);

      case 'loop':
        return this.executeLoop(step, context);

      default:
        throw new WorkflowExecutionError(
          `Unknown action: ${step.action}`,
          step.id
        );
    }
  }

  // ============================================
  // 액션 구현
  // ============================================

  /**
   * ADB 명령 실행
   */
  private async executeAdb(
    step: WorkflowStep,
    context: ExecutionContext,
    timeout: number
  ): Promise<string> {
    if (!step.command) {
      throw new WorkflowExecutionError('ADB command required', step.id);
    }

    if (this.options.debug) {
      console.log(`[ADB] ${context.deviceId}: ${step.command}`);
    }

    return this.withTimeout(
      this.options.adbExecutor(context.deviceId, step.command),
      timeout,
      `ADB command timeout: ${step.command}`
    );
  }

  /**
   * AutoX.js 스크립트 실행
   */
  private async executeAutox(
    step: WorkflowStep,
    context: ExecutionContext,
    timeout: number
  ): Promise<unknown> {
    let script: string;

    if (step.script) {
      script = step.script;
    } else if (step.scriptFile) {
      script = await this.loadScriptFile(step.scriptFile);
    } else {
      throw new WorkflowExecutionError(
        'AutoX script or scriptFile required',
        step.id
      );
    }

    if (this.options.debug) {
      console.log(`[AutoX] ${context.deviceId}: ${script.substring(0, 100)}...`);
    }

    return this.withTimeout(
      this.options.autoxExecutor(context.deviceId, script),
      timeout,
      'AutoX script timeout'
    );
  }

  /**
   * 대기 실행
   */
  private async executeWait(step: WorkflowStep): Promise<{ waited: number }> {
    const duration = step.duration
      ? parseTimeString(step.duration)
      : 1000;

    if (this.options.debug) {
      console.log(`[Wait] ${duration}ms`);
    }

    await this.sleep(duration);
    return { waited: duration };
  }

  /**
   * Safe condition evaluator - supports basic comparisons without code execution
   * Supports: ==, !=, >, <, >=, <=, &&, ||, !, true, false, numbers, strings, variable references
   */
  private evaluateConditionSafely(
    condition: string,
    context: Record<string, unknown>
  ): boolean {
    // Trim and normalize whitespace
    const expr = condition.trim();
    
    // Handle simple boolean values
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    
    // Handle negation
    if (expr.startsWith('!')) {
      return !this.evaluateConditionSafely(expr.slice(1), context);
    }
    
    // Handle parentheses
    if (expr.startsWith('(') && expr.endsWith(')')) {
      return this.evaluateConditionSafely(expr.slice(1, -1), context);
    }
    
    // Handle && and || (lowest precedence)
    const orParts = this.splitByOperator(expr, '||');
    if (orParts.length > 1) {
      return orParts.some(part => this.evaluateConditionSafely(part, context));
    }
    
    const andParts = this.splitByOperator(expr, '&&');
    if (andParts.length > 1) {
      return andParts.every(part => this.evaluateConditionSafely(part, context));
    }
    
    // Handle comparison operators
    const comparisonOps = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'];
    for (const op of comparisonOps) {
      const parts = this.splitByOperator(expr, op);
      if (parts.length === 2) {
        const left = this.resolveValue(parts[0].trim(), context);
        const right = this.resolveValue(parts[1].trim(), context);
        
        switch (op) {
          case '===':
          case '==': return left === right;
          case '!==':
          case '!=': return left !== right;
          case '>': return (left as number) > (right as number);
          case '<': return (left as number) < (right as number);
          case '>=': return (left as number) >= (right as number);
          case '<=': return (left as number) <= (right as number);
        }
      }
    }
    
    // Treat as a variable reference that should be truthy
    const value = this.resolveValue(expr, context);
    return !!value;
  }
  
  /**
   * Split expression by operator, respecting parentheses
   */
  private splitByOperator(expr: string, op: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    let i = 0;
    
    while (i < expr.length) {
      if (expr[i] === '(') {
        depth++;
        current += expr[i];
      } else if (expr[i] === ')') {
        depth--;
        current += expr[i];
      } else if (depth === 0 && expr.slice(i, i + op.length) === op) {
        parts.push(current);
        current = '';
        i += op.length - 1;
      } else {
        current += expr[i];
      }
      i++;
    }
    
    if (current) {
      parts.push(current);
    }
    
    return parts;
  }
  
  /**
   * Resolve a value from the expression
   */
  private resolveValue(
    token: string,
    context: Record<string, unknown>
  ): unknown {
    token = token.trim();
    
    // Number
    if (/^-?\d+(\.\d+)?$/.test(token)) {
      return parseFloat(token);
    }
    
    // String literal (single or double quotes)
    if ((token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1);
    }
    
    // Boolean
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    if (token === 'undefined') return undefined;
    
    // Variable reference (support dot notation)
    const parts = token.split('.');
    let value: unknown = context;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  /**
   * 조건부 실행
   */
  private async executeCondition(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<{ condition: boolean; branch: string }> {
    if (!step.condition) {
      throw new WorkflowExecutionError('Condition expression required', step.id);
    }

    // 조건식 평가 (안전한 평가자 사용)
    const allContext = { ...context.params, ...context.variables };
    let conditionResult: boolean;

    try {
      // Use safe condition evaluator instead of new Function()
      conditionResult = this.evaluateConditionSafely(step.condition, allContext);
    } catch (e) {
      throw new WorkflowExecutionError(
        `Invalid condition: ${(e as Error).message}`,
        step.id
      );
    }

    // 분기 실행
    const branchSteps = conditionResult ? step.then : step.else;
    
    if (branchSteps && branchSteps.length > 0) {
      const results = new Map<string, StepResult>();
      await this.executeSteps(branchSteps, context, allContext, results);
    }

    return {
      condition: conditionResult,
      branch: conditionResult ? 'then' : 'else',
    };
  }

  /**
   * 시스템 명령 실행
   */
  private async executeSystem(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<unknown> {
    const script = step.script || step.systemCommand;
    
    if (!script) {
      throw new WorkflowExecutionError('System script required', step.id);
    }

    // 시스템 명령 해석
    if (script.startsWith('report_completion')) {
      return {
        type: 'completion',
        executionId: context.executionId,
        deviceId: context.deviceId,
        timestamp: Date.now(),
      };
    }

    if (script.startsWith('log(')) {
      const match = script.match(/log\(['"](.+)['"]\)/);
      if (match) {
        console.log(`[Workflow Log] ${match[1]}`);
        return { logged: match[1] };
      }
    }

    if (script.startsWith('skip(')) {
      const match = script.match(/skip\(['"](.+)['"]\)/);
      const reason = match ? match[1] : 'Skipped by system command';
      return { skipped: true, reason };
    }

    if (script.startsWith('fail(')) {
      const match = script.match(/fail\(['"](.+)['"]\)/);
      const message = match ? match[1] : 'Failed by system command';
      throw new WorkflowExecutionError(message, step.id);
    }

    return { executed: script };
  }

  /**
   * 루프 실행
   */
  private async executeLoop(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<{ iterations: number; results: Record<string, StepResult> }> {
    if (!step.body || !Array.isArray(step.body)) {
      throw new WorkflowExecutionError('Loop body required', step.id);
    }

    const count = step.count || 1;
    const allContext = { ...context.params, ...context.variables };
    // Use a fresh results map for each loop execution to properly track results
    const loopResults = new Map<string, StepResult>();
    let completedIterations = 0;

    for (let i = 0; i < count; i++) {
      if (this.aborted) break;

      // 루프 인덱스를 컨텍스트에 추가
      allContext.loop_index = i;
      allContext.loop_count = count;

      // Clear results for this iteration (or track per-iteration)
      const iterationResults = new Map<string, StepResult>();
      await this.executeSteps(step.body, context, allContext, iterationResults);
      
      // Merge iteration results into loop results (prefix with iteration number)
      for (const [stepId, result] of iterationResults) {
        loopResults.set(`${stepId}_iter_${i}`, result);
      }
      
      completedIterations++;
    }

    return { 
      iterations: completedIterations,
      results: Object.fromEntries(loopResults)
    };
  }

  // ============================================
  // 유틸리티
  // ============================================

  /**
   * 타임아웃 래퍼 (with proper timer cleanup)
   */
  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string = 'Operation timeout'
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });
    
    // Clean up timeout when promise resolves or rejects
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * 지연
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 재시도 지연 계산
   */
  private calculateDelay(
    base: number,
    attempt: number,
    backoff: 'linear' | 'exponential' | 'none'
  ): number {
    switch (backoff) {
      case 'exponential':
        return base * Math.pow(2, attempt - 1);
      case 'linear':
        return base * attempt;
      case 'none':
      default:
        return base;
    }
  }

  /**
   * 스크립트 파일 로드
   */
  private async loadScriptFile(filename: string): Promise<string> {
    const filePath = path.isAbsolute(filename)
      ? filename
      : path.join(this.options.scriptBasePath!, filename);

    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      throw new WorkflowExecutionError(
        `Failed to load script file: ${filePath}`,
        undefined,
        e as Error
      );
    }
  }

  /**
   * 워크플로우 이벤트 발행
   */
  private emitEvent(type: string, event: WorkflowEvent): void {
    this.emit(type, event);
    this.emit('event', event);
  }

  /**
   * 스텝 이벤트 발행
   */
  private emitStepEvent(type: string, event: StepEvent): void {
    this.emit(type, event);
    this.emit('step', event);
    this.emit('event', event);
  }
}

// 팩토리 함수
export function createWorkflowRunner(
  options: WorkflowRunnerOptions
): WorkflowRunner {
  return new WorkflowRunner(options);
}
