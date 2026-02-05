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
  DeviceStatus,
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
   * PC ID로 디바이스 목록 조회
   */
  async findByPcId(pcId: string): Promise<Device[]> {
    const { data, error } = await this.db
      .from('devices')
      .select('*')
      .eq('pc_id', pcId)
      .order('device_number');

    if (error) throw error;
    return data || [];
  }

  /**
   * 상태로 디바이스 목록 조회
   */
  async findByStatus(status: DeviceStatus): Promise<Device[]> {
    const { data, error } = await this.db
      .from('devices')
      .select('*')
      .eq('status', status);

    if (error) throw error;
    return data || [];
  }

  /**
   * 여러 상태로 디바이스 목록 조회
   */
  async findByStatuses(statuses: DeviceStatus[]): Promise<Device[]> {
    const { data, error } = await this.db
      .from('devices')
      .select('*')
      .in('status', statuses);

    if (error) throw error;
    return data || [];
  }

  /**
   * 모든 디바이스 조회
   */
  private static readonly DEFAULT_LIMIT = 100;
  
  async findAll(options?: { limit?: number; offset?: number }): Promise<Device[]> {
    let query = this.db.from('devices').select('*').order('device_number');

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
   * online 상태 디바이스 조회 (작업 할당용)
   */
  async findOnlineDevices(pcId?: string, limit?: number): Promise<Device[]> {
    let query = this.db
      .from('devices')
      .select('*')
      .eq('status', 'online')
      .order('last_heartbeat', { ascending: false });

    if (pcId) {
      query = query.eq('pc_id', pcId);
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
  async updateStatus(
    id: string,
    status: DeviceStatus,
    extra?: Partial<DeviceUpdate>
  ): Promise<void> {
    // For online/busy states, reset error count with direct update
    if (status === 'online' || status === 'busy') {
      const { error } = await this.db
        .from('devices')
        .update({
          status,
          last_heartbeat: new Date().toISOString(),
          error_count: 0,
          ...extra,
        })
        .eq('id', id);

      if (error) throw error;
      return;
    }

    // For error status, use atomic increment
    if (status === 'error') {
      try {
        const { error } = await this.db.rpc('update_device_status_with_error', {
          p_device_id: id,
          p_last_error: extra?.last_error || null,
        });

        if (error) {
          if (error.code === '42883') {
            const { error: incrementError } = await this.db.rpc('increment_device_error_count', { device_id: id });

            if (incrementError) {
              console.error(`[DeviceRepository] Failed to atomically increment error_count for device ${id}:`, incrementError.message);
              throw new Error(`Atomic error increment failed: ${incrementError.message}.`);
            }

            await this.db
              .from('devices')
              .update({
                last_error: extra?.last_error,
                last_error_at: new Date().toISOString(),
              })
              .eq('id', id);
          } else {
            throw error;
          }
        }
      } catch (e) {
        throw e;
      }
      return;
    }

    // For offline and other states, direct update
    const { error } = await this.db
      .from('devices')
      .update({
        status,
        last_heartbeat: new Date().toISOString(),
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
  async updateManyStatuses(ids: string[], status: DeviceStatus): Promise<void> {
    const { error } = await this.db
      .from('devices')
      .update({
        status,
        last_heartbeat: new Date().toISOString()
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
   * PC의 모든 디바이스 연결 해제
   */
  async disconnectByPc(pcId: string): Promise<void> {
    const { error } = await this.db
      .from('devices')
      .update({
        status: 'offline',
        last_heartbeat: new Date().toISOString(),
      })
      .eq('pc_id', pcId);

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
      .select('status');

    if (error) throw error;

    const stats: DeviceStats = {
      total: 0,
      online: 0,
      offline: 0,
      busy: 0,
      error: 0,
    };

    (data || []).forEach((d) => {
      stats.total++;
      const status = d.status as DeviceStatus;
      if (status in stats) {
        stats[status]++;
      }
    });

    return stats;
  }

  /**
   * PC별 디바이스 수
   */
  async countByPc(): Promise<Record<string, number>> {
    const { data, error } = await this.db
      .from('devices')
      .select('pc_id');

    if (error) throw error;

    const counts: Record<string, number> = {};
    (data || []).forEach((d) => {
      const pcId = d.pc_id || 'unassigned';
      counts[pcId] = (counts[pcId] || 0) + 1;
    });

    return counts;
  }

  // ============================================
  // 디바이스 상태 테이블 (실시간)
  // ============================================

  /**
   * 디바이스 상태 레코드 upsert
   */
  async upsertDeviceState(state: Partial<DeviceStateRecord> & { device_id: string }): Promise<void> {
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
  async getDeviceState(deviceId: string): Promise<DeviceStateRecord | null> {
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
  async getAllDeviceStates(): Promise<DeviceStateRecord[]> {
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
