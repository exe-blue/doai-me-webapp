/**
 * Database Module
 * 
 * Supabase 클라이언트 및 Repository 통합 내보내기
 */

// Supabase Client
export { getSupabase, testConnection, closeSupabase } from './supabase';

// Types
export * from './types';

// Repositories
export * from './repositories';

// Convenience: 모든 Repository 인스턴스 한 번에 가져오기
import { getDeviceRepository } from './repositories/DeviceRepository';
import { getNodeRepository } from './repositories/NodeRepository';
import { getWorkflowRepository } from './repositories/WorkflowRepository';
import { getWorkflowExecutionRepository } from './repositories/WorkflowExecutionRepository';
import { getAlertRepository } from './repositories/AlertRepository';

/**
 * 모든 Repository 인스턴스 반환
 */
export function getRepositories() {
  return {
    devices: getDeviceRepository(),
    nodes: getNodeRepository(),
    workflows: getWorkflowRepository(),
    executions: getWorkflowExecutionRepository(),
    alerts: getAlertRepository(),
  };
}

// Type for repositories object
export type Repositories = ReturnType<typeof getRepositories>;
