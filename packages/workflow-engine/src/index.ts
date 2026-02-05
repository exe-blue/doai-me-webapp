/**
 * Workflow Engine
 * 
 * YAML 기반 워크플로우 정의 및 실행 엔진
 */

// Types
export * from './types';

// Parser
export { WorkflowParser, getWorkflowParser } from './parser';

// Interpolator
export { 
  TemplateInterpolator, 
  getTemplateInterpolator,
  interpolate,
  interpolateObject 
} from './interpolator';

// Runner
export { WorkflowRunner, createWorkflowRunner } from './runner';

// Convenience: 워크플로우 엔진 생성 함수
import { WorkflowParser, getWorkflowParser } from './parser';
import { WorkflowRunner, createWorkflowRunner } from './runner';
import { 
  WorkflowDefinition, 
  ExecutionContext, 
  WorkflowResult,
  WorkflowRunnerOptions 
} from './types';

/**
 * 워크플로우 엔진 생성 옵션
 */
export interface WorkflowEngineOptions extends WorkflowRunnerOptions {
  workflowDir?: string;
}

/**
 * 워크플로우 엔진 클래스
 * 
 * 파서와 러너를 통합한 고수준 API
 */
export class WorkflowEngine {
  private parser: WorkflowParser;
  private runner: WorkflowRunner;

  constructor(options: WorkflowEngineOptions) {
    this.parser = new WorkflowParser(options.workflowDir || './workflows');
    this.runner = createWorkflowRunner(options);
  }

  /**
   * 워크플로우 ID로 실행
   */
  async runById(
    workflowId: string,
    context: Omit<ExecutionContext, 'workflowId'>
  ): Promise<WorkflowResult> {
    const workflow = this.parser.loadById(workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    return this.run(workflow, { ...context, workflowId });
  }

  /**
   * 워크플로우 정의로 실행
   */
  async run(
    workflow: WorkflowDefinition,
    context: ExecutionContext
  ): Promise<WorkflowResult> {
    return this.runner.run(workflow, context);
  }

  /**
   * YAML 문자열로 실행
   */
  async runFromYaml(
    yamlContent: string,
    context: Omit<ExecutionContext, 'workflowId'>
  ): Promise<WorkflowResult> {
    const workflow = this.parser.parse(yamlContent);
    return this.run(workflow, { ...context, workflowId: workflow.id });
  }

  /**
   * 실행 중단
   */
  abort(): void {
    this.runner.abort();
  }

  /**
   * 실행 중 여부
   */
  isRunning(): boolean {
    return this.runner.isRunning();
  }

  /**
   * 사용 가능한 워크플로우 목록
   */
  listWorkflows(): Map<string, WorkflowDefinition> {
    return this.parser.loadAll();
  }

  /**
   * 워크플로우 로드
   */
  loadWorkflow(id: string): WorkflowDefinition | null {
    return this.parser.loadById(id);
  }

  /**
   * 이벤트 리스너 등록
   */
  on(event: string, listener: (...args: unknown[]) => void): this {
    this.runner.on(event, listener);
    return this;
  }

  /**
   * 이벤트 리스너 제거
   */
  off(event: string, listener: (...args: unknown[]) => void): this {
    this.runner.off(event, listener);
    return this;
  }

  /**
   * 파서 반환
   */
  getParser(): WorkflowParser {
    return this.parser;
  }

  /**
   * 러너 반환
   */
  getRunner(): WorkflowRunner {
    return this.runner;
  }
}

/**
 * 워크플로우 엔진 생성 함수
 */
export function createWorkflowEngine(
  options: WorkflowEngineOptions
): WorkflowEngine {
  return new WorkflowEngine(options);
}
