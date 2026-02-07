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
  backendBaseUrl: 'http://158.247.210.152:4000',
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
  if (port) {
    const parsedPort = parseInt(port, 10);
    if (Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
      env.workerServerPort = parsedPort;
    } else {
      logger.warn('[AppConfig] Invalid WORKER_SERVER_PORT, ignoring', { value: port });
    }
  }

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

/**
 * 번들된 리소스 경로를 반환합니다.
 *
 * - 패키징 후: process.resourcesPath (e.g. {설치폴더}/resources/)
 * - 개발 중:   패키지 로컬 → 모노레포 루트 순으로 탐색
 *
 * @param subpath  리소스 하위 경로 (e.g. 'platform-tools/adb.exe', 'apks')
 */
export function getResourcePath(subpath: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, subpath);
  }

  // 개발 모드: 패키지 로컬 우선, 모노레포 루트 폴백
  const localPath = path.join(app.getAppPath(), 'resources', subpath);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  const monoRepoPath = path.join(app.getAppPath(), '..', '..', 'resources', subpath);
  if (fs.existsSync(monoRepoPath)) {
    return monoRepoPath;
  }

  // 기본값: 로컬 경로 반환 (존재 여부는 호출측에서 판단)
  return localPath;
}
