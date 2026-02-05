/**
 * Workflow YAML Parser
 * 
 * YAML 파일을 WorkflowDefinition으로 파싱하고 유효성 검사
 */

import * as yaml from 'yaml';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { 
  WorkflowDefinition, 
  WorkflowStep, 
  WorkflowParam,
  StepAction,
  OnErrorAction,
  StepRetry,
  RetryPolicy,
  WorkflowValidationError,
  parseTimeString
} from './types';

/**
 * 유효한 액션 타입
 */
const VALID_ACTIONS: StepAction[] = ['adb', 'autox', 'wait', 'condition', 'system', 'loop'];

/**
 * 유효한 에러 처리 방식
 */
const VALID_ON_ERROR: OnErrorAction[] = ['stop', 'fail', 'continue', 'skip', 'retry'];

/**
 * 유효한 파라미터 타입
 */
const VALID_PARAM_TYPES = ['string', 'number', 'boolean', 'array', 'object'];

/**
 * 워크플로우 파서 클래스
 */
export class WorkflowParser {
  private workflowDir: string;

  constructor(workflowDir: string = './workflows') {
    this.workflowDir = workflowDir;
  }

  // ============================================
  // 파싱 메서드
  // ============================================

  /**
   * YAML 문자열을 WorkflowDefinition으로 파싱
   */
  parse(yamlContent: string): WorkflowDefinition {
    let raw: Record<string, unknown>;
    
    try {
      raw = yaml.parse(yamlContent) as Record<string, unknown>;
    } catch (e) {
      throw new WorkflowValidationError(
        `YAML 파싱 실패: ${(e as Error).message}`
      );
    }

    return this.validate(raw);
  }

  /**
   * 파일에서 워크플로우 로드
   */
  loadFromFile(filename: string): WorkflowDefinition {
    const filePath = path.isAbsolute(filename) 
      ? filename 
      : path.join(this.workflowDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new WorkflowValidationError(
        `워크플로우 파일을 찾을 수 없습니다: ${filePath}`,
        'file',
        filename
      );
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return this.parse(content);
  }

  /**
   * 디렉토리의 모든 워크플로우 로드
   */
  loadAll(): Map<string, WorkflowDefinition> {
    const workflows = new Map<string, WorkflowDefinition>();

    if (!fs.existsSync(this.workflowDir)) {
      console.warn(`워크플로우 디렉토리가 없습니다: ${this.workflowDir}`);
      return workflows;
    }

    const files = fs.readdirSync(this.workflowDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    for (const file of files) {
      try {
        const workflow = this.loadFromFile(file);
        workflows.set(workflow.id, workflow);
      } catch (e) {
        console.error(`워크플로우 로드 실패: ${file}`, e);
      }
    }

    return workflows;
  }

  /**
   * 워크플로우 ID로 로드 (동기)
   * @deprecated Use loadByIdAsync for non-blocking file operations
   */
  loadById(id: string): WorkflowDefinition | null {
    const possibleFiles = [`${id}.yml`, `${id}.yaml`];

    for (const file of possibleFiles) {
      const filePath = path.join(this.workflowDir, file);
      if (fs.existsSync(filePath)) {
        return this.loadFromFile(file);
      }
    }

    // 모든 파일에서 ID 검색
    const all = this.loadAll();
    return all.get(id) || null;
  }

  /**
   * 파일에서 워크플로우 로드 (비동기)
   */
  async loadFromFileAsync(filename: string): Promise<WorkflowDefinition> {
    const filePath = path.isAbsolute(filename) 
      ? filename 
      : path.join(this.workflowDir, filename);

    try {
      await fsPromises.access(filePath);
    } catch {
      throw new WorkflowValidationError(
        `워크플로우 파일을 찾을 수 없습니다: ${filePath}`,
        'file',
        filename
      );
    }

    const content = await fsPromises.readFile(filePath, 'utf-8');
    return this.parse(content);
  }

  /**
   * 디렉토리의 모든 워크플로우 로드 (비동기)
   */
  async loadAllAsync(): Promise<Map<string, WorkflowDefinition>> {
    const workflows = new Map<string, WorkflowDefinition>();

    try {
      await fsPromises.access(this.workflowDir);
    } catch {
      console.warn(`워크플로우 디렉토리가 없습니다: ${this.workflowDir}`);
      return workflows;
    }

    const entries = await fsPromises.readdir(this.workflowDir);
    const files = entries.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    for (const file of files) {
      try {
        const workflow = await this.loadFromFileAsync(file);
        workflows.set(workflow.id, workflow);
      } catch (e) {
        console.error(`워크플로우 로드 실패: ${file}`, e);
      }
    }

    return workflows;
  }

  /**
   * 워크플로우 ID로 로드 (비동기)
   */
  async loadByIdAsync(id: string): Promise<WorkflowDefinition | null> {
    const possibleFiles = [`${id}.yml`, `${id}.yaml`];

    for (const file of possibleFiles) {
      const filePath = path.join(this.workflowDir, file);
      try {
        await fsPromises.access(filePath);
        return await this.loadFromFileAsync(file);
      } catch {
        // File doesn't exist, try next
      }
    }

    // 모든 파일에서 ID 검색
    const all = await this.loadAllAsync();
    return all.get(id) || null;
  }

  // ============================================
  // 유효성 검증
  // ============================================

  /**
   * 원시 객체를 WorkflowDefinition으로 변환 및 검증
   */
  private validate(raw: Record<string, unknown>): WorkflowDefinition {
    // 필수 필드 검증
    if (!raw.id || typeof raw.id !== 'string') {
      throw new WorkflowValidationError(
        '워크플로우 ID가 필요합니다',
        'id'
      );
    }

    if (!raw.steps || !Array.isArray(raw.steps)) {
      throw new WorkflowValidationError(
        'steps 배열이 필요합니다',
        'steps'
      );
    }

    if (raw.steps.length === 0) {
      throw new WorkflowValidationError(
        '최소 1개 이상의 스텝이 필요합니다',
        'steps'
      );
    }

    // 타임아웃 파싱
    let timeout = 300000; // 기본 5분
    if (raw.timeout) {
      timeout = parseTimeString(raw.timeout as string | number);
    }

    // 재시도 정책 파싱
    let retryPolicy: RetryPolicy | undefined;
    if (raw.retry_policy) {
      retryPolicy = this.validateRetryPolicy(raw.retry_policy as Record<string, unknown>);
    }

    // 파라미터 검증
    const params: WorkflowParam[] = [];
    if (raw.params) {
      if (Array.isArray(raw.params)) {
        // 배열 형태
        for (const p of raw.params) {
          params.push(this.validateParam(p as Record<string, unknown>));
        }
      } else if (typeof raw.params === 'object') {
        // 객체 형태 (키가 파라미터 이름)
        for (const [name, def] of Object.entries(raw.params as Record<string, unknown>)) {
          const paramDef = typeof def === 'object' ? def as Record<string, unknown> : { type: 'string' };
          params.push(this.validateParam({ name, ...paramDef }));
        }
      }
    }

    // 스텝 검증 (ID 중복 체크)
    const stepIds = new Set<string>();
    const steps: WorkflowStep[] = [];
    
    for (const s of raw.steps as unknown[]) {
      const step = this.validateStep(s as Record<string, unknown>);
      
      if (stepIds.has(step.id)) {
        throw new WorkflowValidationError(
          `중복된 스텝 ID: ${step.id}`,
          'steps',
          step.id
        );
      }
      
      stepIds.add(step.id);
      steps.push(step);
    }

    // on_error 스텝 검증
    let onError: WorkflowStep[] | undefined;
    if (raw.on_error && Array.isArray(raw.on_error)) {
      onError = (raw.on_error as unknown[]).map(s => 
        this.validateStep(s as Record<string, unknown>)
      );
    }

    return {
      id: raw.id as string,
      name: (raw.name as string) || raw.id as string,
      description: raw.description as string | undefined,
      version: (raw.version as number) || 1,
      timeout,
      params: params.length > 0 ? params : undefined,
      steps,
      retry_policy: retryPolicy,
      on_error: onError,
      tags: raw.tags as string[] | undefined,
      category: raw.category as string | undefined,
    };
  }

  /**
   * 파라미터 정의 검증
   */
  private validateParam(raw: Record<string, unknown>): WorkflowParam {
    if (!raw.name || typeof raw.name !== 'string') {
      throw new WorkflowValidationError(
        '파라미터 이름이 필요합니다',
        'params'
      );
    }

    const type = (raw.type as string) || 'string';
    if (!VALID_PARAM_TYPES.includes(type)) {
      throw new WorkflowValidationError(
        `유효하지 않은 파라미터 타입: ${type}`,
        'params.type',
        type
      );
    }

    return {
      name: raw.name as string,
      type: type as WorkflowParam['type'],
      required: raw.required as boolean | undefined,
      default: raw.default,
      description: raw.description as string | undefined,
      validation: raw.validation as string | string[] | undefined,
    };
  }

  /**
   * 재시도 정책 검증
   */
  private validateRetryPolicy(raw: Record<string, unknown>): RetryPolicy {
    const policy: RetryPolicy = {};

    if (raw.default_attempts !== undefined) {
      policy.default_attempts = raw.default_attempts as number;
    }

    if (raw.default_delay !== undefined) {
      policy.default_delay = parseTimeString(raw.default_delay as string | number);
    }

    if (raw.backoff !== undefined) {
      const backoff = raw.backoff as string;
      if (!['linear', 'exponential', 'none'].includes(backoff)) {
        throw new WorkflowValidationError(
          `유효하지 않은 백오프 전략: ${backoff}`,
          'retry_policy.backoff',
          backoff
        );
      }
      policy.backoff = backoff as RetryPolicy['backoff'];
    }

    if (raw.max_delay !== undefined) {
      policy.max_delay = parseTimeString(raw.max_delay as string | number);
    }

    return policy;
  }

  /**
   * 스텝 검증
   */
  private validateStep(raw: Record<string, unknown>): WorkflowStep {
    if (!raw.id || typeof raw.id !== 'string') {
      throw new WorkflowValidationError(
        '스텝 ID가 필요합니다',
        'step.id'
      );
    }

    if (!raw.action || typeof raw.action !== 'string') {
      throw new WorkflowValidationError(
        `스텝 ${raw.id}: action이 필요합니다`,
        'step.action'
      );
    }

    const action = raw.action as string;
    if (!VALID_ACTIONS.includes(action as StepAction)) {
      throw new WorkflowValidationError(
        `스텝 ${raw.id}: 유효하지 않은 action "${action}"`,
        'step.action',
        action
      );
    }

    // 액션별 필수 필드 검증
    this.validateStepFields(raw.id as string, action as StepAction, raw);

    // on_error 검증
    if (raw.on_error !== undefined) {
      const onError = raw.on_error as string;
      if (!VALID_ON_ERROR.includes(onError as OnErrorAction)) {
        throw new WorkflowValidationError(
          `스텝 ${raw.id}: 유효하지 않은 on_error "${onError}"`,
          'step.on_error',
          onError
        );
      }
    }

    // 타임아웃 파싱
    let timeout: number | undefined;
    if (raw.timeout !== undefined) {
      timeout = parseTimeString(raw.timeout as string | number);
    }

    // 대기 시간 파싱
    let duration: number | undefined;
    if (raw.duration !== undefined) {
      duration = parseTimeString(raw.duration as string | number);
    }

    // 재시도 설정 파싱
    let retry: StepRetry | undefined;
    if (raw.retry !== undefined) {
      retry = this.validateStepRetry(raw.id as string, raw.retry);
    }

    // 조건부 스텝 검증
    // Note: Support both 'then' and 'then_steps' for the true branch
    // 'then' is a reserved keyword in some contexts, so 'then_steps' is preferred
    let thenSteps: WorkflowStep[] | undefined;
    let elseSteps: WorkflowStep[] | undefined;
    
    const thenSource = raw.then_steps || raw.then;
    if (thenSource && Array.isArray(thenSource)) {
      thenSteps = (thenSource as unknown[]).map(s => 
        this.validateStep(s as Record<string, unknown>)
      );
    }
    
    const elseSource = raw.else_steps || raw.else;
    if (elseSource && Array.isArray(elseSource)) {
      elseSteps = (elseSource as unknown[]).map(s => 
        this.validateStep(s as Record<string, unknown>)
      );
    }

    // 루프 스텝 검증
    let bodySteps: WorkflowStep[] | undefined;
    if (raw.body && Array.isArray(raw.body)) {
      bodySteps = (raw.body as unknown[]).map(s => 
        this.validateStep(s as Record<string, unknown>)
      );
    }

    // Use then_steps/else_steps to avoid thenable conflict
    // (Objects with 'then' property can be mistakenly treated as Promises)
    return {
      id: raw.id as string,
      name: raw.name as string | undefined,
      action: action as StepAction,
      command: raw.command as string | undefined,
      script: raw.script as string | undefined,
      scriptFile: raw.scriptFile as string | undefined,
      duration,
      condition: raw.condition as string | undefined,
      then_steps: thenSteps,
      else_steps: elseSteps,
      count: raw.count as number | undefined,
      body: bodySteps,
      systemCommand: raw.systemCommand as string | undefined,
      timeout,
      retry,
      on_error: raw.on_error as OnErrorAction | undefined,
      depends_on: raw.depends_on as string[] | undefined,
      enabled: raw.enabled !== false,
      metadata: raw.metadata as Record<string, unknown> | undefined,
    };
  }

  /**
   * 액션별 필수 필드 검증
   */
  private validateStepFields(
    stepId: string, 
    action: StepAction, 
    raw: Record<string, unknown>
  ): void {
    switch (action) {
      case 'adb':
        if (!raw.command) {
          throw new WorkflowValidationError(
            `스텝 ${stepId}: adb 액션에는 command가 필요합니다`,
            'step.command'
          );
        }
        break;

      case 'autox':
        if (!raw.script && !raw.scriptFile) {
          throw new WorkflowValidationError(
            `스텝 ${stepId}: autox 액션에는 script 또는 scriptFile이 필요합니다`,
            'step.script'
          );
        }
        break;

      case 'wait':
        if (raw.duration === undefined) {
          throw new WorkflowValidationError(
            `스텝 ${stepId}: wait 액션에는 duration이 필요합니다`,
            'step.duration'
          );
        }
        break;

      case 'condition':
        if (!raw.condition) {
          throw new WorkflowValidationError(
            `스텝 ${stepId}: condition 액션에는 condition이 필요합니다`,
            'step.condition'
          );
        }
        break;

      case 'loop':
        if (!raw.body || !Array.isArray(raw.body)) {
          throw new WorkflowValidationError(
            `스텝 ${stepId}: loop 액션에는 body가 필요합니다`,
            'step.body'
          );
        }
        break;
    }
  }

  /**
   * 스텝 재시도 설정 검증
   */
  private validateStepRetry(stepId: string, raw: unknown): StepRetry {
    // 숫자만 전달된 경우
    if (typeof raw === 'number') {
      return {
        attempts: raw,
        delay: 1000,
      };
    }

    if (typeof raw !== 'object' || raw === null) {
      throw new WorkflowValidationError(
        `스텝 ${stepId}: 유효하지 않은 retry 설정`,
        'step.retry',
        raw
      );
    }

    const retryObj = raw as Record<string, unknown>;

    return {
      attempts: (retryObj.attempts as number) || 1,
      delay: retryObj.delay 
        ? parseTimeString(retryObj.delay as string | number)
        : 1000,
      backoff: retryObj.backoff as StepRetry['backoff'] | undefined,
      retryOn: retryObj.retryOn as string[] | undefined,
      noRetryOn: retryObj.noRetryOn as string[] | undefined,
    };
  }

  // ============================================
  // 유틸리티
  // ============================================

  /**
   * 워크플로우 디렉토리 설정
   */
  setWorkflowDir(dir: string): void {
    this.workflowDir = dir;
  }

  /**
   * 워크플로우 디렉토리 반환
   */
  getWorkflowDir(): string {
    return this.workflowDir;
  }

  /**
   * 사용 가능한 워크플로우 ID 목록
   */
  listWorkflowIds(): string[] {
    const workflows = this.loadAll();
    return Array.from(workflows.keys());
  }
}

// 싱글톤 인스턴스
let instance: WorkflowParser | null = null;

export function getWorkflowParser(workflowDir?: string): WorkflowParser {
  if (!instance) {
    instance = new WorkflowParser(workflowDir);
  } else if (workflowDir) {
    instance.setWorkflowDir(workflowDir);
  }
  return instance;
}
