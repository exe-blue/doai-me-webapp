/**
 * Logger 유틸리티
 * 
 * 구조화된 로깅을 위한 간단한 래퍼
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Validate and normalize LOG_LEVEL from environment
function getValidatedLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL;
  
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  
  // Fall back to 'info' for invalid or missing values
  if (envLevel) {
    console.warn(`[Logger] Invalid LOG_LEVEL '${envLevel}', falling back to 'info'`);
  }
  
  return 'info';
}

const MIN_LOG_LEVEL: LogLevel = getValidatedLogLevel();
const MIN_LOG_LEVEL_NUM: number = LOG_LEVELS[MIN_LOG_LEVEL];

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= MIN_LOG_LEVEL_NUM;
}

function formatLog(level: LogLevel, message: string, data?: LogData): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (data && Object.keys(data).length > 0) {
    return `${base} ${JSON.stringify(data)}`;
  }
  
  return base;
}

export const logger = {
  debug(message: string, data?: LogData): void {
    if (shouldLog('debug')) {
      console.debug(formatLog('debug', message, data));
    }
  },

  info(message: string, data?: LogData): void {
    if (shouldLog('info')) {
      console.info(formatLog('info', message, data));
    }
  },

  warn(message: string, data?: LogData): void {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', message, data));
    }
  },

  error(message: string, data?: LogData): void {
    if (shouldLog('error')) {
      console.error(formatLog('error', message, data));
    }
  },
};

export default logger;
