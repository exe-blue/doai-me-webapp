#!/usr/bin/env node
// ============================================
// DoAi.Me Install Bot - Entry Point
// Command-line executable for install worker
// ============================================

import * as dotenv from 'dotenv';
import { Logger, defaultLogger } from '@doai/worker-core';
import { InstallWorker, InstallWorkerConfig } from './InstallWorker';

// Load environment variables
dotenv.config();

// Parse configuration from environment
function parseConfig(): InstallWorkerConfig {
  const workerId = process.env.WORKER_ID || `install-${Date.now()}`;
  const managerUrl = process.env.MANAGER_URL || 'http://localhost:3001';

  return {
    workerId,
    managerUrl,
    heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),
    connectionTimeoutMs: parseInt(process.env.CONNECTION_TIMEOUT_MS || '10000', 10),
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '5', 10),
    adbHost: process.env.ADB_HOST || 'localhost',
    adbPort: parseInt(process.env.ADB_PORT || '5037', 10),
  };
}

// Create logger
const logger = defaultLogger.child('InstallBot');

// Main function
async function main(): Promise<void> {
  logger.info('Starting Install Bot Worker...');

  // Parse configuration
  const config = parseConfig();
  logger.info('Configuration loaded', {
    workerId: config.workerId,
    managerUrl: config.managerUrl,
    maxConcurrentJobs: config.maxConcurrentJobs,
  });

  // Create worker instance
  const worker = new InstallWorker(config);

  // Set up event listeners
  worker.on('connected', () => {
    logger.info('Connected to manager server');
  });

  worker.on('disconnected', (reason: string) => {
    logger.warn('Disconnected from manager server', { reason });
  });

  worker.on('reconnecting', (attempt: number) => {
    logger.info('Reconnecting to manager server', { attempt });
  });

  // Graceful shutdown handler
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}, initiating graceful shutdown...`);

    try {
      // Disconnect worker
      await worker.disconnect();

      // Dispose resources
      worker.dispose();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
      process.exit(1);
    }
  }

  // Register signal handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
    shutdown('unhandledRejection');
  });

  try {
    // Connect to manager
    await worker.connect();

    logger.info('Install Bot Worker is running', {
      workerId: config.workerId,
      devices: worker.getDeviceManager().getOnlineDevices().length,
    });

    // Keep the process running
    // The event loop will be kept alive by the socket connection and timers
  } catch (error) {
    logger.error('Failed to start worker', { error: String(error) });
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  logger.error('Fatal error', { error: String(error) });
  process.exit(1);
});

// Export for programmatic usage
export { InstallWorker, InstallWorkerConfig } from './InstallWorker';
export { InstallHandler, UninstallHandler } from './handlers';
export type { InstallJobParams, InstallJobResultData, UninstallJobParams, UninstallJobResultData } from './handlers';
