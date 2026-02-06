/**
 * WorkflowRepository
 * 
 * 워크플로우 정의 CRUD
 */

import { getSupabase } from '../supabase';
import type { 
  Workflow, 
  WorkflowInsert, 
  WorkflowUpdate 
} from '../types';

export class WorkflowRepository {
  private get db() {
    return getSupabase();
  }

  // ============================================
  // 조회
  // ============================================

  /**
   * ID로 워크플로우 조회
   */
  async findById(id: string): Promise<Workflow | null> {
    const { data, error } = await this.db
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /**
   * 활성 워크플로우 목록 조회
   */
  async findActive(): Promise<Workflow[]> {
    const { data, error } = await this.db
      .from('workflows')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * 카테고리별 워크플로우 조회
   */
  async findByCategory(category: string): Promise<Workflow[]> {
    const { data, error } = await this.db
      .from('workflows')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * 태그로 워크플로우 검색
   */
  async findByTag(tag: string): Promise<Workflow[]> {
    const { data, error } = await this.db
      .from('workflows')
      .select('*')
      .contains('tags', [tag])
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  }

  /**
   * 모든 워크플로우 조회
   */
  async findAll(includeInactive: boolean = false): Promise<Workflow[]> {
    let query = this.db.from('workflows').select('*').order('name');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * 카테고리 목록 조회
   */
  async getCategories(): Promise<string[]> {
    const { data, error } = await this.db
      .from('workflows')
      .select('category')
      .eq('is_active', true)
      .not('category', 'is', null);

    if (error) throw error;

    const categories = new Set<string>();
    (data || []).forEach((w) => {
      if (w.category) categories.add(w.category);
    });

    return Array.from(categories).sort();
  }

  // ============================================
  // 생성/수정
  // ============================================

  /**
   * 워크플로우 생성
   */
  async create(workflow: WorkflowInsert): Promise<Workflow> {
    const { data, error } = await this.db
      .from('workflows')
      .insert(workflow)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 워크플로우 upsert
   */
  async upsert(workflow: WorkflowInsert): Promise<Workflow> {
    const { data, error } = await this.db
      .from('workflows')
      .upsert(workflow, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 워크플로우 업데이트
   */
  async update(id: string, update: WorkflowUpdate): Promise<void> {
    const { error } = await this.db
      .from('workflows')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 워크플로우 활성화/비활성화
   */
  async setActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.db
      .from('workflows')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 워크플로우 버전 증가 (atomic operation)
   * Uses atomic DB increment to avoid read-modify-write race conditions
   */
  async incrementVersion(id: string): Promise<number> {
    // Try RPC first for atomic increment with RETURNING
    try {
      const { data, error: rpcError } = await this.db.rpc('increment_workflow_version', {
        workflow_id: id,
      });

      if (rpcError) {
        // Fallback if RPC doesn't exist
        if (rpcError.code === '42883') { // function does not exist
          return await this.incrementVersionFallback(id);
        }
        throw rpcError;
      }

      // RPC returns the new version
      return data as number;
    } catch {
      // If RPC call throws, try fallback
      return await this.incrementVersionFallback(id);
    }
  }

  /**
   * Fallback atomic increment using Supabase update with select
   * Note: This has a small race window but is acceptable for version increments
   * Uses bounded retries to prevent infinite recursion
   */
  private async incrementVersionFallback(id: string, maxRetries: number = 3): Promise<number> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // First, get current version
      const { data: current, error: selectError } = await this.db
        .from('workflows')
        .select('version')
        .eq('id', id)
        .single();

      if (selectError) {
        if (selectError.code === 'PGRST116') {
          throw new Error(`Workflow not found: ${id}`);
        }
        throw selectError;
      }

      const currentVersion = current?.version ?? 0;
      const newVersion = currentVersion + 1;

      // Update with optimistic locking to detect race conditions
      const { data, error: updateError } = await this.db
        .from('workflows')
        .update({ version: newVersion })
        .eq('id', id)
        .eq('version', currentVersion) // Optimistic lock
        .select('version')
        .single();

      if (updateError) {
        // If PGRST116 (no rows), it means race condition occurred
        if (updateError.code === 'PGRST116') {
          if (attempt < maxRetries) {
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 10 * attempt));
            continue; // Retry
          }
          throw new Error(`Concurrency error: failed to increment version after ${maxRetries} attempts`);
        }
        throw updateError;
      }

      return data?.version ?? newVersion;
    }

    // Should not reach here, but satisfy TypeScript
    throw new Error(`Failed to increment version after ${maxRetries} attempts`);
  }

  // ============================================
  // 삭제
  // ============================================

  /**
   * 워크플로우 삭제
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from('workflows')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 워크플로우 소프트 삭제 (비활성화)
   */
  async softDelete(id: string): Promise<void> {
    await this.setActive(id, false);
  }

  // ============================================
  // 통계
  // ============================================

  /**
   * 워크플로우 수
   */
  async count(activeOnly: boolean = true): Promise<number> {
    let query = this.db
      .from('workflows')
      .select('*', { count: 'exact', head: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }

  /**
   * 카테고리별 워크플로우 수
   */
  async countByCategory(): Promise<Record<string, number>> {
    const { data, error } = await this.db
      .from('workflows')
      .select('category')
      .eq('is_active', true);

    if (error) throw error;

    const counts: Record<string, number> = {};
    (data || []).forEach((w) => {
      const cat = w.category || 'uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    return counts;
  }
}

// 싱글톤 인스턴스
let instance: WorkflowRepository | null = null;

export function getWorkflowRepository(): WorkflowRepository {
  if (!instance) {
    instance = new WorkflowRepository();
  }
  return instance;
}
