/**
 * AppConfig — 런타임 설정 로더
 *
 * Load priority:
 *  1. config.json in app.getPath('userData')  (%APPDATA%/DoAi.Me Agent/)
 *  2. Environment variables (NODE_ID, SERVER_URL, …)
 *  3. Hard-coded defaults
 *
 * 모든 노드는 Manager + Bot 기능을 동시에 실행합니다 (역할 분리 없음).
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

export interface AppConfig {
  backendBaseUrl: string;
  nodeId?: string;
  workerServerPort?: number;
  logLevel?: string;
}

const DEFAULTS: AppConfig = {
  backendBaseUrl: 'https://api.doai.me',
};

let cached: AppConfig | null = null;

/**
 * Load config.json from the user-data directory.
 */
function loadJsonConfig(): Partial<AppConfig> {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (!fs.existsSync(configPath)) {
      logger.info('[AppConfig] No config.json found at', { path: configPath });
      return {};
    }
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    logger.info('[AppConfig] Loaded config.json', { path: configPath });
    return parsed;
  } catch (err) {
    logger.error('[AppConfig] Failed to read config.json', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * Build config from environment variables.
 */
function loadEnvConfig(): Partial<AppConfig> {
  const env: Partial<AppConfig> = {};

  const serverUrl = process.env.SERVER_URL || process.env.DOAIME_SERVER_URL;
  if (serverUrl) env.backendBaseUrl = serverUrl;

  const nodeId = process.env.NODE_ID || process.env.DOAIME_NODE_ID;
  if (nodeId) env.nodeId = nodeId;

  const port = process.env.WORKER_SERVER_PORT;
  if (port) env.workerServerPort = parseInt(port, 10);

  const logLevel = process.env.LOG_LEVEL;
  if (logLevel) env.logLevel = logLevel;

  return env;
}

/**
 * Merge sources: defaults ← json ← env (later wins).
 */
export function loadAppConfig(): AppConfig {
  const json = loadJsonConfig();
  const env = loadEnvConfig();

  const config: AppConfig = {
    ...DEFAULTS,
    ...json,
    ...env,
  };

  cached = config;

  logger.info('[AppConfig] Resolved config', {
    backendBaseUrl: config.backendBaseUrl,
    nodeId: config.nodeId,
    workerServerPort: config.workerServerPort,
  });

  return config;
}

/**
 * Get the currently loaded config (throws if loadAppConfig hasn't been called).
 */
export function getAppConfig(): AppConfig {
  if (!cached) {
    throw new Error('AppConfig not loaded yet — call loadAppConfig() first');
  }
  return cached;
}
