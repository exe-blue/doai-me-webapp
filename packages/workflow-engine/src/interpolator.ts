/**
 * Template Interpolator
 * 
 * {{variable}} 패턴을 실제 값으로 치환
 */

/**
 * 템플릿 변수 패턴
 * - {{variable}} - 기본 변수
 * - {{variable.property}} - 중첩 프로퍼티 (dot notation)
 * - {{variable|default:값}} - 기본값 지정
 * - {{variable|upper}} - 대문자 변환
 * - {{variable|lower}} - 소문자 변환
 * - {{variable|trim}} - 공백 제거
 * 
 * Note: Using a factory function to avoid global flag state issues.
 * RegExp with 'g' flag is stateful - calling test() or exec() modifies lastIndex.
 */
function createTemplatePattern(): RegExp {
  return /\{\{([^}]+)\}\}/g;
}

/**
 * 필터 함수 타입
 */
type FilterFunction = (value: unknown, ...args: string[]) => unknown;

/**
 * 내장 필터
 */
const BUILT_IN_FILTERS: Record<string, FilterFunction> = {
  // 기본값
  default: (value, defaultValue) => {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    return value;
  },

  // 문자열 변환
  upper: (value) => String(value).toUpperCase(),
  lower: (value) => String(value).toLowerCase(),
  trim: (value) => String(value).trim(),
  capitalize: (value) => {
    const str = String(value);
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  // 숫자 변환
  number: (value) => Number(value),
  int: (value) => parseInt(String(value), 10),
  float: (value) => parseFloat(String(value)),
  round: (value, decimals = '0') => {
    const num = Number(value);
    const dec = parseInt(decimals, 10);
    return Math.round(num * Math.pow(10, dec)) / Math.pow(10, dec);
  },

  // JSON
  json: (value) => JSON.stringify(value),
  parse: (value) => {
    try {
      return JSON.parse(String(value));
    } catch {
      return value;
    }
  },

  // 배열
  first: (value) => Array.isArray(value) ? value[0] : value,
  last: (value) => Array.isArray(value) ? value[value.length - 1] : value,
  join: (value, separator = ',') => {
    return Array.isArray(value) ? value.join(separator) : String(value);
  },
  length: (value) => {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') return value.length;
    if (typeof value === 'object' && value !== null) return Object.keys(value).length;
    return 0;
  },

  // 날짜/시간
  timestamp: () => Date.now(),
  date: (value) => {
    const d = value ? new Date(value as string | number) : new Date();
    return d.toISOString().split('T')[0];
  },
  time: (value) => {
    const d = value ? new Date(value as string | number) : new Date();
    return d.toISOString().split('T')[1].split('.')[0];
  },
  datetime: (value) => {
    const d = value ? new Date(value as string | number) : new Date();
    return d.toISOString();
  },

  // 인코딩
  urlencode: (value) => encodeURIComponent(String(value)),
  urldecode: (value) => decodeURIComponent(String(value)),
  base64: (value) => Buffer.from(String(value)).toString('base64'),
  base64decode: (value) => Buffer.from(String(value), 'base64').toString('utf-8'),

  // 문자열 조작
  slice: (value, start = '0', end = '') => {
    const str = String(value);
    const startIdx = parseInt(start, 10);
    const endIdx = end ? parseInt(end, 10) : undefined;
    return str.slice(startIdx, endIdx);
  },
  replace: (value, search = '', replacement = '') => {
    // Escape regex special characters to prevent ReDoS attacks
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(value).replace(new RegExp(escapedSearch, 'g'), replacement);
  },
  pad: (value, length = '0', char = ' ') => {
    const str = String(value);
    const len = parseInt(length, 10);
    return str.padStart(len, char);
  },
  padEnd: (value, length = '0', char = ' ') => {
    const str = String(value);
    const len = parseInt(length, 10);
    return str.padEnd(len, char);
  },
};

/**
 * 템플릿 인터폴레이터 클래스
 */
export class TemplateInterpolator {
  private customFilters: Map<string, FilterFunction> = new Map();
  private strictMode: boolean;

  constructor(options?: { strictMode?: boolean }) {
    this.strictMode = options?.strictMode ?? false;
  }

  // ============================================
  // 주요 메서드
  // ============================================

  /**
   * 템플릿 문자열의 변수를 실제 값으로 치환
   */
  interpolate(template: string, context: Record<string, unknown>): string {
    // Create fresh pattern instance to avoid global flag state issues
    return template.replace(createTemplatePattern(), (match, expression) => {
      try {
        const result = this.evaluateExpression(expression.trim(), context);
        return result !== undefined ? String(result) : match;
      } catch (e) {
        if (this.strictMode) {
          throw e;
        }
        console.warn(`템플릿 변수 치환 실패: ${match} - ${(e as Error).message}`);
        return match;
      }
    });
  }

  /**
   * 객체 내 모든 문자열 템플릿 치환 (재귀)
   */
  interpolateObject<T>(obj: T, context: Record<string, unknown>): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.interpolate(obj, context) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateObject(item, context)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        // 키도 치환 가능
        const interpolatedKey = this.interpolate(key, context);
        result[interpolatedKey] = this.interpolateObject(value, context);
      }
      
      return result as T;
    }

    return obj;
  }

  /**
   * 템플릿에서 사용된 변수 목록 추출
   */
  extractVariables(template: string): string[] {
    const variables: Set<string> = new Set();
    
    let match;
    // Create fresh pattern instance for this extraction
    const pattern = createTemplatePattern();
    
    while ((match = pattern.exec(template)) !== null) {
      const expression = match[1].trim();
      const varName = expression.split('|')[0].split('.')[0].trim();
      variables.add(varName);
    }
    
    return Array.from(variables);
  }

  /**
   * 템플릿에 변수가 포함되어 있는지 확인
   */
  hasVariables(template: string): boolean {
    // Create fresh pattern instance to avoid lastIndex state issues
    return createTemplatePattern().test(template);
  }

  // ============================================
  // 필터 관리
  // ============================================

  /**
   * 커스텀 필터 등록
   */
  registerFilter(name: string, fn: FilterFunction): void {
    this.customFilters.set(name, fn);
  }

  /**
   * 커스텀 필터 제거
   */
  removeFilter(name: string): void {
    this.customFilters.delete(name);
  }

  /**
   * 사용 가능한 필터 목록
   */
  getAvailableFilters(): string[] {
    return [
      ...Object.keys(BUILT_IN_FILTERS),
      ...Array.from(this.customFilters.keys()),
    ];
  }

  // ============================================
  // 내부 메서드
  // ============================================

  /**
   * 표현식 평가
   * 예: "variable.property|filter:arg1:arg2"
   */
  private evaluateExpression(
    expression: string, 
    context: Record<string, unknown>
  ): unknown {
    // 파이프로 분리 (필터 체인)
    const parts = expression.split('|').map(p => p.trim());
    const varPath = parts[0];
    const filters = parts.slice(1);

    // 변수 값 가져오기
    let value = this.getNestedValue(context, varPath);

    // 필터 체인 적용
    for (const filterExpr of filters) {
      value = this.applyFilter(filterExpr, value);
    }

    return value;
  }

  /**
   * 중첩 프로퍼티 값 가져오기 (dot notation)
   */
  private getNestedValue(
    obj: Record<string, unknown>, 
    path: string
  ): unknown {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        if (this.strictMode) {
          throw new Error(`변수를 찾을 수 없습니다: ${path}`);
        }
        return undefined;
      }

      // 배열 인덱스 지원: items[0]
      const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const arrKey = arrayMatch[1];
        const index = parseInt(arrayMatch[2], 10);
        const arr = (current as Record<string, unknown>)[arrKey];
        current = Array.isArray(arr) ? arr[index] : undefined;
      } else {
        current = (current as Record<string, unknown>)[key];
      }
    }

    return current;
  }

  /**
   * 필터 적용
   * 예: "filter:arg1:arg2"
   */
  private applyFilter(filterExpr: string, value: unknown): unknown {
    // 필터 이름과 인자 분리
    const colonIndex = filterExpr.indexOf(':');
    let filterName: string;
    let args: string[];

    if (colonIndex === -1) {
      filterName = filterExpr;
      args = [];
    } else {
      filterName = filterExpr.substring(0, colonIndex);
      // 콜론으로 인자 분리 (따옴표 내부 콜론 무시)
      args = this.parseFilterArgs(filterExpr.substring(colonIndex + 1));
    }

    // 필터 함수 찾기
    const filterFn = this.customFilters.get(filterName) || BUILT_IN_FILTERS[filterName];

    if (!filterFn) {
      if (this.strictMode) {
        throw new Error(`알 수 없는 필터: ${filterName}`);
      }
      console.warn(`알 수 없는 필터: ${filterName}`);
      return value;
    }

    return filterFn(value, ...args);
  }

  /**
   * 필터 인자 파싱
   */
  private parseFilterArgs(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && char === ':') {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      args.push(current.trim());
    }

    return args;
  }
}

// 싱글톤 인스턴스
let instance: TemplateInterpolator | null = null;
let instanceOptions: { strictMode?: boolean } | undefined = undefined;

export function getTemplateInterpolator(
  options?: { strictMode?: boolean }
): TemplateInterpolator {
  if (!instance) {
    instance = new TemplateInterpolator(options);
    instanceOptions = options;
  } else if (options !== undefined) {
    // Check for options mismatch and warn
    const currentStrictMode = instanceOptions?.strictMode ?? false;
    const requestedStrictMode = options.strictMode ?? false;
    
    if (currentStrictMode !== requestedStrictMode) {
      console.warn(
        `TemplateInterpolator singleton already initialized with strictMode=${currentStrictMode}, ` +
        `but requested strictMode=${requestedStrictMode}. Using existing instance. ` +
        `Create a new instance directly if different options are needed.`
      );
    }
  }
  return instance;
}

// 편의 함수
export function interpolate(
  template: string, 
  context: Record<string, unknown>
): string {
  return getTemplateInterpolator().interpolate(template, context);
}

export function interpolateObject<T>(
  obj: T, 
  context: Record<string, unknown>
): T {
  return getTemplateInterpolator().interpolateObject(obj, context);
}
