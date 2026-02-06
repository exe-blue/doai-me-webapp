/**
 * AlertRepository
 * 
 * 알림 기록 관리
 */

import { getSupabase } from '../supabase';
import type { Alert, AlertInsert, AlertLevel } from '../types';

export class AlertRepository {
  private get db() {
    return getSupabase();
  }

  // ============================================
  // 조회
  // ============================================

  /**
   * ID로 알림 조회
   */
  async findById(id: number): Promise<Alert | null> {
    const { data, error } = await this.db
      .from('alerts')
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
   * 미확인 알림 목록 조회
   */
  async findUnacknowledged(limit: number = 100): Promise<Alert[]> {
    const { data, error } = await this.db
      .from('alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * 레벨별 알림 조회
   */
  async findByLevel(level: AlertLevel, limit: number = 50): Promise<Alert[]> {
    const { data, error } = await this.db
      .from('alerts')
      .select('*')
      .eq('level', level)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * 최근 알림 목록 조회
   */
  async getRecent(limit: number = 100): Promise<Alert[]> {
    const { data, error } = await this.db
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * 기간별 알림 조회
   */
  async findByDateRange(from: Date, to: Date): Promise<Alert[]> {
    const { data, error } = await this.db
      .from('alerts')
      .select('*')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ============================================
  // 생성
  // ============================================

  /**
   * 알림 생성
   */
  async create(alert: AlertInsert): Promise<Alert> {
    const { data, error } = await this.db
      .from('alerts')
      .insert(alert)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 배치 알림 생성
   */
  async createMany(alerts: AlertInsert[]): Promise<Alert[]> {
    const { data, error } = await this.db
      .from('alerts')
      .insert(alerts)
      .select();

    if (error) throw error;
    return data || [];
  }

  // ============================================
  // 확인 처리
  // ============================================

  /**
   * 알림 확인 처리
   */
  async acknowledge(id: number, userId?: string): Promise<void> {
    const { error } = await this.db
      .from('alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId || null,
      })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 여러 알림 일괄 확인
   */
  async acknowledgeMany(ids: number[], userId?: string): Promise<void> {
    const { error } = await this.db
      .from('alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId || null,
      })
      .in('id', ids);

    if (error) throw error;
  }

  /**
   * 모든 미확인 알림 확인
   */
  async acknowledgeAll(userId?: string): Promise<number> {
    const { data, error } = await this.db
      .from('alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId || null,
      })
      .eq('acknowledged', false)
      .select('id');

    if (error) throw error;
    return data?.length || 0;
  }

  // ============================================
  // 삭제
  // ============================================

  /**
   * 알림 삭제
   */
  async delete(id: number): Promise<void> {
    const { error } = await this.db
      .from('alerts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 오래된 알림 삭제 (확인된 것만)
   */
  async deleteOld(daysOld: number = 30): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - daysOld);

    const { data, error } = await this.db
      .from('alerts')
      .delete()
      .eq('acknowledged', true)
      .lt('created_at', threshold.toISOString())
      .select('id');

    if (error) throw error;
    return data?.length || 0;
  }

  // ============================================
  // 통계
  // ============================================

  /**
   * 미확인 알림 수
   */
  async countUnacknowledged(): Promise<number> {
    const { count, error } = await this.db
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('acknowledged', false);

    if (error) throw error;
    return count || 0;
  }

  /**
   * 레벨별 미확인 알림 수
   */
  async countUnacknowledgedByLevel(): Promise<Record<AlertLevel, number>> {
    const { data, error } = await this.db
      .from('alerts')
      .select('level')
      .eq('acknowledged', false);

    if (error) throw error;

    const counts: Record<AlertLevel, number> = {
      critical: 0,
      warning: 0,
      info: 0,
    };

    (data || []).forEach((a) => {
      const level = a.level as AlertLevel;
      if (level && level in counts) {
        counts[level]++;
      }
    });

    return counts;
  }

  /**
   * 오늘 알림 통계
   */
  async getTodayStats(): Promise<{ total: number; critical: number; warning: number; info: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await this.db
      .from('alerts')
      .select('level')
      .gte('created_at', today.toISOString());

    if (error) throw error;

    const stats = { total: 0, critical: 0, warning: 0, info: 0 };
    (data || []).forEach((a) => {
      stats.total++;
      const level = a.level as AlertLevel;
      if (level && level in stats) {
        stats[level]++;
      }
    });

    return stats;
  }
}

// 싱글톤 인스턴스
let instance: AlertRepository | null = null;

export function getAlertRepository(): AlertRepository {
  if (!instance) {
    instance = new AlertRepository();
  }
  return instance;
}
