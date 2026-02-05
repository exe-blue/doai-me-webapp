/**
 * Workflow Loader Service
 * 
 * YAML 파일에서 워크플로우 정의를 로드합니다.
 * 규칙: workflow-yaml-definition.mdc
 * - 모든 워크플로우는 YAML 파일로 정의
 * - 하드코딩된 워크플로우 금지
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

// ============================================
// 설정
// ============================================

// 워크플로우 YAML 파일 디렉토리 (프로젝트 루트 기준)
const WORKFLOW_DIRS = [
  path.join(__dirname, '../../../workflows'),                    // /workflows (root)
  path.join(__dirname, '../../../packages/workflow-engine/src/workflows'), // packages/workflow-engine
];

// 워크플로우 캐시
const workflowCache = new Map();
let cacheInitialized = false;

// ============================================
// 로더 함수
// ============================================

/**
 * YAML 파일에서 워크플로우 로드
 * @param {string} filePath - YAML 파일 경로
 * @returns {Object|null} - 파싱된 워크플로우 또는 null
 */
function loadWorkflowFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const workflow = yaml.load(content);
    
    // 필수 필드 검증
    if (!workflow.id || !workflow.steps) {
      console.warn(`[WorkflowLoader] Invalid workflow file (missing id or steps): ${filePath}`);
      return null;
    }
    
    // 내부 형식으로 변환
    return normalizeWorkflow(workflow, filePath);
  } catch (error) {
    console.error(`[WorkflowLoader] Failed to load workflow: ${filePath}`, error.message);
    return null;
  }
}

/**
 * YAML 워크플로우를 내부 형식으로 정규화
 * @param {Object} raw - 원본 YAML 객체
 * @param {string} filePath - 소스 파일 경로
 * @returns {Object} - 정규화된 워크플로우
 */
function normalizeWorkflow(raw, filePath) {
  const workflow = {
    id: raw.id,
    name: raw.name || raw.id,
    description: raw.description || '',
    version: raw.version || 1,
    timeout: raw.timeout || 300000,
    category: raw.category || 'default',
    tags: raw.tags || [],
    params: raw.params || [],
    retryPolicy: raw.retry_policy || {
      default_attempts: 2,
      default_delay: 1000,
      backoff: 'fixed',
    },
    steps: normalizeSteps(raw.steps, raw.retry_policy),
    onError: raw.on_error ? normalizeSteps(raw.on_error, raw.retry_policy) : [],
    _source: filePath,
  };
  
  return workflow;
}

/**
 * Steps를 내부 형식으로 정규화
 * @param {Array} steps - 원본 steps
 * @param {Object} defaultRetryPolicy - 기본 재시도 정책
 * @returns {Array} - 정규화된 steps
 */
function normalizeSteps(steps, defaultRetryPolicy = {}) {
  if (!Array.isArray(steps)) return [];
  
  return steps.map(step => {
    // 재시도 정책 병합
    const retry = step.retry || {
      attempts: defaultRetryPolicy.default_attempts || 2,
      delay: defaultRetryPolicy.default_delay || 1000,
      backoff: defaultRetryPolicy.backoff || 'fixed',
    };
    
    // 에러 정책 변환 (on_error -> errorPolicy)
    let errorPolicy = 'fail';  // default
    let nextOnError = null;
    
    if (step.on_error === 'continue' || step.on_error === 'skip') {
      errorPolicy = 'skip';
    } else if (typeof step.on_error === 'object' && step.on_error.goto) {
      errorPolicy = 'goto';
      nextOnError = step.on_error.goto;
    }
    // else: keep default 'fail'
    
    return {
      id: step.id,
      name: step.name || step.id,
      action: step.action,
      script: step.script || null,
      command: step.command || null,
      params: extractParams(step),
      timeout: step.timeout || 30000,
      retry: {
        attempts: retry.attempts || 2,
        delay: retry.delay || 1000,
        backoff: retry.backoff || 'fixed',
      },
      errorPolicy,
      nextOnError,
    };
  });
}

/**
 * Step에서 params 추출
 * @param {Object} step - 원본 step
 * @returns {Object} - params 객체
 */
function extractParams(step) {
  const params = {};
  
  // duration (wait 액션용)
  if (step.duration !== undefined) {
    params.duration = step.duration;
  }
  
  // command (adb 액션용) - 이미 있으면 params에도 추가
  if (step.command) {
    params.command = step.command;
  }
  
  // script (autox 액션용)
  if (step.script && step.action === 'autox') {
    params.script = step.script;
  }
  
  // 명시적 params 필드가 있으면 병합
  if (step.params) {
    Object.assign(params, step.params);
  }
  
  return params;
}

/**
 * 모든 워크플로우 디렉토리에서 워크플로우 로드
 * @param {boolean} force - 캐시 무시하고 다시 로드
 * @returns {Map} - 워크플로우 캐시
 */
function loadAllWorkflows(force = false) {
  if (cacheInitialized && !force) {
    return workflowCache;
  }
  
  console.log('[WorkflowLoader] Loading workflows from YAML files...');
  workflowCache.clear();
  
  for (const dir of WORKFLOW_DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`[WorkflowLoader] Directory not found, skipping: ${dir}`);
      continue;
    }
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    
    for (const file of files) {
      // Skip non-workflow files using precise basename checks
      const basename = path.basename(file, path.extname(file));
      const excludedNames = ['deploy', 'claude', 'claude-code-review'];
      
      // Skip if basename exactly matches or starts with excluded patterns
      if (excludedNames.includes(basename) || 
          excludedNames.some(name => basename.startsWith(name + '-') || basename.startsWith(name + '.'))) {
        continue;
      }
      
      // Skip GitHub Actions workflow files (detected by parent directory)
      if (dir.includes('.github/workflows') || dir.includes('.github\\workflows')) {
        continue;
      }
      
      const filePath = path.join(dir, file);
      const workflow = loadWorkflowFromFile(filePath);
      
      if (workflow) {
        workflowCache.set(workflow.id, workflow);
        console.log(`[WorkflowLoader] Loaded: ${workflow.id} (${workflow.name}) from ${file}`);
      }
    }
  }
  
  cacheInitialized = true;
  console.log(`[WorkflowLoader] Total workflows loaded: ${workflowCache.size}`);
  
  return workflowCache;
}

/**
 * 워크플로우 ID로 로드
 * @param {string} workflowId - 워크플로우 ID
 * @returns {Object|null} - 워크플로우 또는 null
 */
function load(workflowId) {
  if (!cacheInitialized) {
    loadAllWorkflows();
  }
  
  const workflow = workflowCache.get(workflowId);
  
  if (!workflow) {
    console.warn(`[WorkflowLoader] Workflow not found: ${workflowId}`);
    return null;
  }
  
  return workflow;
}

/**
 * 워크플로우 이름으로 로드 (별칭)
 * @param {string} name - 워크플로우 이름
 * @returns {Object|null} - 워크플로우 또는 null
 */
function loadByName(name) {
  if (!cacheInitialized) {
    loadAllWorkflows();
  }
  
  // Search by name instead of ID
  for (const workflow of workflowCache.values()) {
    if (workflow.name === name) {
      return workflow;
    }
  }
  
  console.warn(`[WorkflowLoader] Workflow not found by name: ${name}`);
  return null;
}

/**
 * 모든 워크플로우 목록 조회
 * @returns {Array} - 워크플로우 목록
 */
function listWorkflows() {
  if (!cacheInitialized) {
    loadAllWorkflows();
  }
  
  return Array.from(workflowCache.values()).map(w => ({
    id: w.id,
    name: w.name,
    description: w.description,
    version: w.version,
    category: w.category,
    tags: w.tags,
  }));
}

/**
 * 캐시 새로고침
 */
function refresh() {
  loadAllWorkflows(true);
}

/**
 * 캐시 상태 확인
 * @returns {Object} - 캐시 상태
 */
function getCacheStatus() {
  return {
    initialized: cacheInitialized,
    count: workflowCache.size,
    workflows: Array.from(workflowCache.keys()),
  };
}

// ============================================
// Exports
// ============================================

module.exports = {
  load,
  loadByName,
  loadAllWorkflows,
  listWorkflows,
  refresh,
  getCacheStatus,
  // 하위 호환성
  loadWorkflowFromFile,
};
