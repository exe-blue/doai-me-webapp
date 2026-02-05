/**
 * DeviceRepository
 * 
 * 디바이스 CRUD 및 상태 관리
 */

import { getSupabase } from '../supabase';
import type { 
  Device, 
  DeviceInsert, 
  DeviceUpdate, 
  DeviceState, 
  DeviceStats,
  DeviceStateRecord 
} from '../types';

export class DeviceRepository {
  private get db() {
    return getSupabase();
  }

  // ============================================
  // 조회
  // ============================================

  /**
   * ID로 디바이스 조회
   */
  async findById(id: string): Promise<Device | null> {
    const { data, error } = await this.db
      .from('devices')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data;
  }

  /**
   * 노드 ID로 디바이스 목록 조회
   */
  async findByNodeId(nodeId: string): Promise<Device[]> {
    const { data, error } = await this.db
      .from('devices')
      .select('*')
      .eq('node_id', nodeId)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * 상태로 디바이스 목록 조회
   */
  async findByState(state: DeviceState): Promise<Device[]> {
    const { data, error } = await this.db
      .from('devices')
      .select('*')
      .eq('state', state);

    if (error) throw error;
    return data || [];
  }

  /**
   * 여러 상태로 디바이스 목록 조회
   */
  async findByStates(states: DeviceState[]): Promise<Device[]> {
    const { data, error } = await this.db
      .from('devices')
      .select('*')
      .in('state', states);

    if (error) throw error;
    return data || [];
  }

  /**
   * 모든 디바이스 조회
   */
  private static readonly DEFAULT_LIMIT = 100;
  
  async findAll(options?: { limit?: number; offset?: number }): Promise<Device[]> {
    let query = this.db.from('devices').select('*').order('name');

    // Use range() when offset is provided, limit() otherwise
    // Don't mix both to avoid .range() overriding .limit()
    if (options?.offset !== undefined) {
      const limit = options.limit ?? DeviceRepository.DEFAULT_LIMIT;
      const end = options.offset + limit - 1;
      query = query.range(options.offset, end);
    } else if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * IDLE 상태 디바이스 조회 (작업 할당용)
   */
  async findIdleDevices(nodeId?: string, limit?: number): Promise<Device[]> {
    let query = this.db
      .from('devices')
      .select('*')
      .eq('state', 'IDLE')
      .order('last_seen', { ascending: false });

    if (nodeId) {
      query = query.eq('node_id', nodeId);
    }
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // ============================================
  // 생성/수정
  // ============================================

  /**
   * 디바이스 생성 또는 업데이트 (upsert)
   */
  async upsert(device: DeviceInsert): Promise<Device> {
    const { data, error } = await this.db
      .from('devices')
      .upsert(device, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 디바이스 상태 업데이트
   * Uses atomic DB-side increment for error_count to avoid race conditions
   */
  async updateState(
    id: string, 
    state: DeviceState, 
    extra?: Partial<DeviceUpdate>
  ): Promise<void> {
    // For IDLE/RUNNING states, reset error count with direct update
    if (state === 'IDLE' || state === 'RUNNING') {
      const { error } = await this.db
        .from('devices')
        .update({
          state,
          last_seen: new Date().toISOString(),
          error_count: 0,
          ...extra,
        })
        .eq('id', id);

      if (error) throw error;
      return;
    }

    // For ERROR state, use atomic increment and conditional state change
    if (state === 'ERROR') {
      // Use RPC for atomic increment with conditional quarantine
      // Fallback: Single UPDATE with CASE expression via raw SQL if RPC not available
      try {
        const { error } = await this.db.rpc('update_device_state_with_error', {
          p_device_id: id,
          p_last_error: extra?.last_error || null,
        });
        
        if (error) {
          // Fallback to two-step update if RPC doesn't exist
          if (error.code === '42883') { // function does not exist
            // Direct update with error_count + 1, but this still has a small race window
            const { data: device } = await this.db
              .from('devices')
              .select('error_count')
              .eq('id', id)
              .single();
            
            const newErrorCount = ((device?.error_count as number) || 0) + 1;
            const newState = newErrorCount >= 3 ? 'QUARANTINE' : 'ERROR';
            
            const { error: updateError } = await this.db
              .from('devices')
              .update({
                state: newState,
                last_seen: new Date().toISOString(),
                error_count: newErrorCount,
                last_error: extra?.last_error,
                ...extra,
              })
              .eq('id', id);
            
            if (updateError) throw updateError;
          } else {
            throw error;
          }
        }
      } catch (e) {
        throw e;
      }
      return;
    }

    // For other states, direct update
    const { error } = await this.db
      .from('devices')
      .update({
        state,
        last_seen: new Date().toISOString(),
        ...extra,
      })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 디바이스 정보 업데이트
   */
  async update(id: string, update: DeviceUpdate): Promise<void> {
    const { error } = await this.db
      .from('devices')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 배치 상태 업데이트
   */
  async updateManyStates(ids: string[], state: DeviceState): Promise<void> {
    const { error } = await this.db
      .from('devices')
      .update({ 
        state, 
        last_seen: new Date().toISOString() 
      })
      .in('id', ids);

    if (error) throw error;
  }

  // ============================================
  // 삭제
  // ============================================

  /**
   * 디바이스 삭제
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from('devices')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 노드의 모든 디바이스 연결 해제
   */
  async disconnectByNode(nodeId: string): Promise<void> {
    const { error } = await this.db
      .from('devices')
      .update({ 
        state: 'DISCONNECTED',
        last_seen: new Date().toISOString(),
      })
      .eq('node_id', nodeId);

    if (error) throw error;
  }

  // ============================================
  // 통계
  // ============================================

  /**
   * 디바이스 상태 통계
   */
  async getStats(): Promise<DeviceStats> {
    const { data, error } = await this.db
      .from('devices')
      .select('state');

    if (error) throw error;

    const stats: DeviceStats = {
      total: 0,
      DISCONNECTED: 0,
      IDLE: 0,
      QUEUED: 0,
      RUNNING: 0,
      ERROR: 0,
      QUARANTINE: 0,
    };

    (data || []).forEach((d) => {
      stats.total++;
      const state = d.state as DeviceState;
      if (state in stats) {
        stats[state]++;
      }
    });

    return stats;
  }

  /**
   * 노드별 디바이스 수
   */
  async countByNode(): Promise<Record<string, number>> {
    const { data, error } = await this.db
      .from('devices')
      .select('node_id');

    if (error) throw error;

    const counts: Record<string, number> = {};
    (data || []).forEach((d) => {
      const nodeId = d.node_id || 'unknown';
      counts[nodeId] = (counts[nodeId] || 0) + 1;
    });

    return counts;
  }

  // ============================================
  // 디바이스 상태 테이블 (실시간)
  // ============================================

  /**
   * 디바이스 상태 레코드 upsert
   */
  async upsertState(state: Partial<DeviceStateRecord> & { device_id: string }): Promise<void> {
    const { error } = await this.db
      .from('device_states')
      .upsert({
        ...state,
        last_heartbeat: new Date().toISOString(),
      }, { onConflict: 'device_id' });

    if (error) throw error;
  }

  /**
   * 디바이스 상태 레코드 조회
   */
  async getState(deviceId: string): Promise<DeviceStateRecord | null> {
    const { data, error } = await this.db
      .from('device_states')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /**
   * 모든 디바이스 상태 조회
   */
  async getAllStates(): Promise<DeviceStateRecord[]> {
    const { data, error } = await this.db
      .from('device_states')
      .select('*');

    if (error) throw error;
    return data || [];
  }
}

// 싱글톤 인스턴스
let instance: DeviceRepository | null = null;

export function getDeviceRepository(): DeviceRepository {
  if (!instance) {
    instance = new DeviceRepository();
  }
  return instance;
}
