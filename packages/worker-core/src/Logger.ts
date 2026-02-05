// ============================================
// DoAi.Me Worker Core - Logger
// 구조화된 로깅 시스템
// ============================================

/**
 * 로그 레벨 정의
 * debug < info < warn < error
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 로그 레벨 우선순위 매핑
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * 로그 레벨별 콘솔 색상 코드
 */
const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

/**
 * Logger 설정 인터페이스
 */
export interface LoggerOptions {
  /** 최소 로그 레벨 (기본값: 'info') */
  minLevel?: LogLevel;
  /** 로거 이름/컨텍스트 (기본값: 'app') */
  context?: string;
  /** 컬러 출력 활성화 (기본값: true) */
  colorize?: boolean;
  /** 타임스탬프 포맷 함수 */
  timestampFormat?: () => string;
}

/**
 * 로그 메시지 포맷 인터페이스
 */
export interface LogMessage {
  level: LogLevel;
  context: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/**
 * 구조화된 로깅 클래스
 * 
 * @example
 * ```typescript
 * const logger = new Logger({ context: 'DeviceManager', minLevel: 'debug' });
 * logger.info('Device connected', { deviceId: 'abc123' });
 * 
 * const childLogger = logger.child('AdbController');
 * childLogger.debug('Executing shell command');
 * ```
 */
export class Logger {
  private minLevel: LogLevel;
  private context: string;
  private colorize: boolean;
  private timestampFormat: () => string;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.context = options.context ?? 'app';
    this.colorize = options.colorize ?? true;
    this.timestampFormat = options.timestampFormat ?? Logger.defaultTimestampFormat;
  }

  /**
   * 기본 타임스탬프 포맷 (ISO 8601)
   */
  private static defaultTimestampFormat(): string {
    return new Date().toISOString();
  }

  /**
   * 로그 레벨이 현재 설정된 최소 레벨 이상인지 확인
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * 로그 메시지 포맷팅
   */
  private formatMessage(level: LogLevel, message: string, data?: Record<string, unknown>): string {
    const timestamp = this.timestampFormat();
    const levelStr = level.toUpperCase().padEnd(5);
    const contextStr = `[${this.context}]`;
    
    let formattedMessage = `${timestamp} ${levelStr} ${contextStr} ${message}`;
    
    if (data && Object.keys(data).length > 0) {
      formattedMessage += ` ${JSON.stringify(data)}`;
    }

    if (this.colorize) {
      const color = LOG_COLORS[level];
      formattedMessage = `${color}${formattedMessage}${RESET_COLOR}`;
    }

    return formattedMessage;
  }

  /**
   * 로그 출력 실행
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, data);

    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'debug':
        console.debug(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * Debug 레벨 로그
   * @param message 로그 메시지
   * @param data 추가 데이터 (선택)
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Info 레벨 로그
   * @param message 로그 메시지
   * @param data 추가 데이터 (선택)
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Warn 레벨 로그
   * @param message 로그 메시지
   * @param data 추가 데이터 (선택)
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Error 레벨 로그
   * @param message 로그 메시지
   * @param data 추가 데이터 (선택)
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Error 객체와 함께 에러 로그
   * @param message 로그 메시지
   * @param error Error 객체
   * @param data 추가 데이터 (선택)
   */
  errorWithStack(message: string, error: Error, data?: Record<string, unknown>): void {
    this.log('error', message, {
      ...data,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }

  /**
   * 자식 로거 생성
   * 부모의 설정을 상속하면서 새로운 컨텍스트를 가진 로거 생성
   * 
   * @param childContext 자식 로거의 컨텍스트 이름
   * @returns 새로운 Logger 인스턴스
   * 
   * @example
   * ```typescript
   * const parentLogger = new Logger({ context: 'Worker' });
   * const childLogger = parentLogger.child('AdbController');
   * // childLogger의 context는 'Worker:AdbController'
   * ```
   */
  child(childContext: string): Logger {
    return new Logger({
      minLevel: this.minLevel,
      context: `${this.context}:${childContext}`,
      colorize: this.colorize,
      timestampFormat: this.timestampFormat,
    });
  }

  /**
   * 최소 로그 레벨 변경
   * @param level 새로운 최소 로그 레벨
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * 현재 최소 로그 레벨 반환
   */
  getMinLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * 현재 컨텍스트 반환
   */
  getContext(): string {
    return this.context;
  }
}

/**
 * 기본 로거 인스턴스
 * 환경변수 LOG_LEVEL로 레벨 설정 가능
 */
export const defaultLogger = new Logger({
  minLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
  context: 'worker-core',
});

export default Logger;
