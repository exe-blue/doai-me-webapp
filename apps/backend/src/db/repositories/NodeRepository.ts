/**
 * NodeRepository
 * 
 * 노드(PC) CRUD 및 상태 관리
 */

import { getSupabase } from '../supabase';
import type { 
  Node, 
  NodeInsert, 
  NodeUpdate, 
  NodeStatus,
  NodeDeviceSummary 
} from '../types';

export class NodeRepository {
  private get db() {
    return getSupabase();
  }

  // ============================================
  // 조회
  // ============================================

  /**
   * ID로 노드 조회
   */
  async findById(id: string): Promise<Node | null> {
    const { data, error } = await this.db
      .from('nodes')
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
   * 상태로 노드 목록 조회
   */
  async findByStatus(status: NodeStatus): Promise<Node[]> {
    const { data, error } = await this.db
      .from('nodes')
      .select('*')
      .eq('status', status)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * 온라인 노드 목록 조회
   */
  async findOnlineNodes(): Promise<Node[]> {
    return this.findByStatus('online');
  }

  /**
   * 모든 노드 조회
   */
  async findAll(): Promise<Node[]> {
    const { data, error } = await this.db
      .from('nodes')
      .select('*')
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * 디바이스 용량이 남은 노드 조회
   */
  async findAvailableNodes(): Promise<Node[]> {
    const { data, error } = await this.db
      .from('nodes')
      .select('*')
      .eq('status', 'online')
      .order('connected_devices');

    if (error) throw error;

    // 용량이 남은 노드만 필터링
    return (data || []).filter(
      (node) => node.connected_devices < node.device_capacity
    );
  }

  // ============================================
  // 생성/수정
  // ============================================

  /**
   * 노드 생성 또는 업데이트 (upsert)
   */
  async upsert(node: NodeInsert): Promise<Node> {
    const { data, error } = await this.db
      .from('nodes')
      .upsert(node, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 노드 상태 업데이트
   */
  async updateStatus(id: string, status: NodeStatus): Promise<void> {
    const { error } = await this.db
      .from('nodes')
      .update({ 
        status, 
        last_seen: new Date().toISOString() 
      })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 노드 정보 업데이트
   */
  async update(id: string, update: NodeUpdate): Promise<void> {
    const { error } = await this.db
      .from('nodes')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 노드 하트비트 업데이트
   */
  async heartbeat(
    id: string, 
    metrics?: { cpu_usage?: number; memory_usage?: number; connected_devices?: number }
  ): Promise<void> {
    const update: NodeUpdate = {
      status: 'online',
      last_seen: new Date().toISOString(),
      ...metrics,
    };

    const { error } = await this.db
      .from('nodes')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 노드 등록 (첫 연결)
   */
  async register(node: NodeInsert): Promise<Node> {
    const nodeData: NodeInsert = {
      ...node,
      status: 'online',
      last_seen: new Date().toISOString(),
    };

    return this.upsert(nodeData);
  }

  // ============================================
  // 삭제
  // ============================================

  /**
   * 노드 삭제
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from('nodes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 노드 오프라인 처리
   */
  async setOffline(id: string): Promise<void> {
    await this.updateStatus(id, 'offline');
  }

  /**
   * 오래된 노드 오프라인 처리
   * Uses atomic update to avoid TOCTOU race condition
   * 
   * @param timeoutMs 타임아웃 (기본 60초)
   */
  async markStaleNodesOffline(timeoutMs: number = 60000): Promise<string[]> {
    const threshold = new Date(Date.now() - timeoutMs).toISOString();

    // Single atomic update that filters and returns affected ids
    const { data: updatedNodes, error } = await this.db
      .from('nodes')
      .update({ status: 'offline' })
      .eq('status', 'online')
      .lt('last_seen', threshold)
      .select('id');

    if (error) throw error;
    
    return (updatedNodes || []).map((n) => n.id);
  }

  // ============================================
  // 통계
  // ============================================

  /**
   * 노드 상태 카운트
   */
  async getStatusCounts(): Promise<Record<NodeStatus, number>> {
    const { data, error } = await this.db
      .from('nodes')
      .select('status');

    if (error) throw error;

    const counts: Record<NodeStatus, number> = {
      online: 0,
      offline: 0,
      error: 0,
    };

    (data || []).forEach((n) => {
      const status = n.status as NodeStatus;
      if (status in counts) {
        counts[status]++;
      }
    });

    return counts;
  }

  /**
   * 노드별 디바이스 요약 (RPC 함수 사용)
   */
  async getNodeDeviceSummary(nodeId?: string): Promise<NodeDeviceSummary[]> {
    const { data, error } = await this.db.rpc('get_node_device_summary', {
      p_pc_id: nodeId || null,
    });

    if (error) throw error;
    return data || [];
  }

  /**
   * 전체 노드 수
   */
  async count(): Promise<number> {
    const { count, error } = await this.db
      .from('nodes')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  }

  /**
   * 온라인 노드 수
   */
  async countOnline(): Promise<number> {
    const { count, error } = await this.db
      .from('nodes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'online');

    if (error) throw error;
    return count || 0;
  }
}

// 싱글톤 인스턴스
let instance: NodeRepository | null = null;

export function getNodeRepository(): NodeRepository {
  if (!instance) {
    instance = new NodeRepository();
  }
  return instance;
}
