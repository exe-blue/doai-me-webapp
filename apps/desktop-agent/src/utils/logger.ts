/**
 * Desktop Agent Logger
 * 
 * electron-log를 사용한 로깅 유틸리티
 */

import log from 'electron-log';
import { app } from 'electron';
import * as path from 'path';

// 로그 파일 경로 - lazy resolution to avoid accessing app.getPath() before app is ready
let _logPath: string | null = null;

function getLogPath(): string {
  if (_logPath === null) {
    // Check if app is ready before accessing getPath
    if (app?.isReady()) {
      _logPath = app.isPackaged
        ? path.join(app.getPath('userData'), 'logs')
        : path.join(process.cwd(), 'logs');
    } else {
      // Fallback to cwd before app is ready
      _logPath = path.join(process.cwd(), 'logs');
      // Re-resolve once app is ready (for packaged app)
      app?.whenReady().then(() => {
        _logPath = app.isPackaged
          ? path.join(app.getPath('userData'), 'logs')
          : path.join(process.cwd(), 'logs');
      });
    }
  }
  return _logPath;
}

// 기본 설정
log.transports.file.resolvePathFn = () => path.join(getLogPath(), 'main.log');
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// 콘솔 출력 설정
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';

// 로그 레벨 설정 (환경변수로 오버라이드 가능)
const logLevel = process.env.LOG_LEVEL || (app?.isPackaged ? 'info' : 'debug');
log.transports.file.level = logLevel as log.LogLevel;
log.transports.console.level = logLevel as log.LogLevel;

/**
 * 구조화된 로그 출력
 */
interface LogContext {
  [key: string]: unknown;
}

function formatMessage(message: string, context?: LogContext): string {
  if (context && Object.keys(context).length > 0) {
    return `${message} ${JSON.stringify(context)}`;
  }
  return message;
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    log.debug(formatMessage(message, context));
  },

  info: (message: string, context?: LogContext) => {
    log.info(formatMessage(message, context));
  },

  warn: (message: string, context?: LogContext) => {
    log.warn(formatMessage(message, context));
  },

  error: (message: string, context?: LogContext) => {
    log.error(formatMessage(message, context));
  },

  verbose: (message: string, context?: LogContext) => {
    log.verbose(formatMessage(message, context));
  },

  silly: (message: string, context?: LogContext) => {
    log.silly(formatMessage(message, context));
  },

  // 에러 객체 로깅
  logError: (error: Error, context?: LogContext) => {
    log.error(formatMessage(error.message, {
      ...context,
      stack: error.stack,
      name: error.name,
    }));
  },

  // 로그 파일 경로 반환
  getLogPath: () => getLogPath(),

  // electron-log 인스턴스 직접 접근
  raw: log,
};

// 전역 에러 핸들러
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', {
    reason: String(reason),
  });
});

export default logger;
