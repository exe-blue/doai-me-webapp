/**
 * 메트릭 수집기 (MetricsCollector)
 * 
 * 500대 디바이스 운영을 위한 메트릭 수집
 * - 1분마다 노드/디바이스/큐 상태 수집
 * - Redis List에 24시간(1440분) 히스토리 저장
 * - Redis Pub/Sub으로 실시간 메트릭 발행
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { SystemMetrics } from './types';

// ============================================
// 상수
// ============================================

const COLLECT_INTERVAL_MS = 60 * 1000; // 1분
const HISTORY_MAX_LENGTH = 1440; // 24시간 (분 단위)

const REDIS_KEYS = {
  METRICS_HISTORY: 'metrics:history',
  METRICS_CHANNEL: 'channel:metrics',
  NODE_PREFIX: 'node:',
  DEVICES_BY_STATE: 'stats:devices:by_state',
  QUEUE_WAIT: 'bull:workflow:wait',
  QUEUE_ACTIVE: 'bull:workflow:active',
  QUEUE_FAILED: 'bull:workflow:failed',
};

// ============================================
// MetricsCollector 클래스
// ============================================

export class MetricsCollector extends EventEmitter {
  private redis: Redis;
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // 캐시된 메트릭
  private currentMetrics: SystemMetrics | null = null;

  constructor(redis: Redis);
  constructor(config: { redisUrl: string });
  constructor(redisOrConfig: Redis | { redisUrl: string }) {
    super();
    
    if (redisOrConfig instanceof Redis) {
      this.redis = redisOrConfig;
    } else {
      this.redis = new Redis(redisOrConfig.redisUrl, {
        maxRetriesPerRequest: null,
      });
    }
  }

  /**
   * 1분마다 메트릭 수집 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[MetricsCollector] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[MetricsCollector] Starting (interval: 1 minute)');

    // 즉시 1회 실행 with proper error handling
    try {
      await this.collect();
    } catch (error) {
      console.error('[MetricsCollector] Initial collection failed:', (error as Error).message);
      // Continue to start interval even if initial collection fails
    }

    // 1분마다 수집
    this.interval = setInterval(() => {
      this.collect().catch((error) => {
        console.error('[MetricsCollector] Scheduled collection failed:', (error as Error).message);
      });
    }, COLLECT_INTERVAL_MS);
  }

  /**
   * 수집 중지
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('[MetricsCollector] Stopped');
  }

  /**
   * 메트릭 수집 실행
   */
  async collect(): Promise<SystemMetrics> {
    const startTime = Date.now();

    try {
      const metrics: SystemMetrics = {
        timestamp: Date.now(),
        nodes: await this.collectNodeMetrics(),
        devices: await this.collectDeviceMetrics(),
        queue: await this.collectQueueMetrics(),
        workflows: await this.collectWorkflowMetrics(),
      };

      // 캐시 업데이트
      this.currentMetrics = metrics;

      // Redis에 저장 (24시간 = 1440분 보관)
      await this.redis.lpush(REDIS_KEYS.METRICS_HISTORY, JSON.stringify(metrics));
      await this.redis.ltrim(REDIS_KEYS.METRICS_HISTORY, 0, HISTORY_MAX_LENGTH - 1);

      // 현재 메트릭 발행 (대시보드 실시간 업데이트용)
      await this.redis.publish(REDIS_KEYS.METRICS_CHANNEL, JSON.stringify(metrics));

      // 이벤트 발생
      this.emit('metrics:collected', metrics);

      const duration = Date.now() - startTime;
      if (duration > 5000) {
        console.warn(`[MetricsCollector] Collection took ${duration}ms`);
      }

      return metrics;
    } catch (error) {
      console.error('[MetricsCollector] Collection error:', (error as Error).message);
      throw error;
    }
  }

  /**
   * 노드 메트릭 수집
   * Uses SCAN and pipelined HGET for better performance
   */
  private async collectNodeMetrics(): Promise<SystemMetrics['nodes']> {
    let online = 0;
    let offline = 0;
    let total = 0;
    let cursor = '0';
    
    // Use SCAN to iterate without blocking Redis
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${REDIS_KEYS.NODE_PREFIX}*`,
        'COUNT',
        100
      );
      cursor = nextCursor;
      
      if (keys.length > 0) {
        // Use pipeline for bulk HGET
        const pipeline = this.redis.pipeline();
        for (const key of keys) {
          pipeline.hget(key, 'status');
        }
        
        const results = await pipeline.exec();
        
        if (results) {
          for (const [err, status] of results) {
            if (!err) {
              total++;
              if (status === 'online') {
                online++;
              } else {
                offline++;
              }
            }
          }
        }
      }
    } while (cursor !== '0');

    return { total, online, offline };
  }

  /**
   * 디바이스 메트릭 수집
   */
  private async collectDeviceMetrics(): Promise<SystemMetrics['devices']> {
    // Redis Sorted Set에서 상태별 카운트
    const states = ['IDLE', 'RUNNING', 'ERROR', 'DISCONNECTED', 'QUARANTINE'];
    
    const result: SystemMetrics['devices'] = {
      total: 0,
      idle: 0,
      running: 0,
      error: 0,
      disconnected: 0,
      quarantine: 0,
    };

    for (const state of states) {
      // 상태별 Sorted Set에서 디바이스 수 조회 (ZCARD는 집합의 전체 멤버 수 반환)
      const count = await this.redis.zcard(
        `${REDIS_KEYS.DEVICES_BY_STATE}:${state}`
      ).catch(() => 0);
      
      const key = state.toLowerCase() as keyof typeof result;
      if (key !== 'total') {
        result[key] = count;
        result.total += count;
      }
    }

    // Sorted Set이 없는 경우 device:* 키에서 직접 수집
    if (result.total === 0) {
      const deviceKeys = await this.redis.keys('device:*');
      result.total = deviceKeys.length;

      for (const key of deviceKeys) {
        const state = await this.redis.hget(key, 'state');
        switch (state) {
          case 'IDLE':
            result.idle++;
            break;
          case 'RUNNING':
            result.running++;
            break;
          case 'ERROR':
            result.error++;
            break;
          case 'DISCONNECTED':
            result.disconnected++;
            break;
          case 'QUARANTINE':
            result.quarantine++;
            break;
        }
      }
    }

    return result;
  }

  /**
   * 큐 메트릭 수집
   */
  private async collectQueueMetrics(): Promise<SystemMetrics['queue']> {
    // BullMQ 큐 상태 조회
    const [waiting, active, failed, completed] = await Promise.all([
      this.redis.llen(REDIS_KEYS.QUEUE_WAIT).catch(() => 0),
      this.redis.llen(REDIS_KEYS.QUEUE_ACTIVE).catch(() => 0),
      this.redis.zcard(REDIS_KEYS.QUEUE_FAILED).catch(() => 0),
      this.redis.zcard('bull:workflow:completed').catch(() => 0),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
    };
  }

  /**
   * 워크플로우 메트릭 수집
   */
  private async collectWorkflowMetrics(): Promise<SystemMetrics['workflows']> {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const stats: SystemMetrics['workflows'] = {
      running: 0,
      completedLast5m: 0,
      failedLast5m: 0,
      avgDurationMs: 0,
    };

    try {
      // 실행 중인 워크플로우 수
      const runningKeys = await this.redis.keys('workflow:running:*');
      stats.running = runningKeys.length;

      // 최근 5분간 완료/실패 수
      const [completedCount, failedCount] = await Promise.all([
        this.redis.zcount('workflow:completed', fiveMinutesAgo, '+inf').catch(() => 0),
        this.redis.zcount('workflow:failed', fiveMinutesAgo, '+inf').catch(() => 0),
      ]);

      stats.completedLast5m = completedCount;
      stats.failedLast5m = failedCount;

      // 평균 실행 시간
      const avgDuration = await this.redis.get('workflow:avg_duration');
      stats.avgDurationMs = avgDuration ? parseInt(avgDuration, 10) : 0;
    } catch (error) {
      console.warn('[MetricsCollector] Workflow metrics error:', (error as Error).message);
    }

    return stats;
  }

  /**
   * 현재 메트릭 조회
   */
  getCurrentMetrics(): SystemMetrics | null {
    return this.currentMetrics;
  }

  /**
   * 최근 N분 메트릭 히스토리 조회
   */
  async getHistory(minutes: number = 60): Promise<SystemMetrics[]> {
    const data = await this.redis.lrange(
      REDIS_KEYS.METRICS_HISTORY,
      0,
      minutes - 1
    );
    return data.map((d) => JSON.parse(d) as SystemMetrics);
  }

  /**
   * 메트릭 히스토리 조회 (timestamp 기반)
   */
  async getMetricsHistory(
    fromTimestamp: number,
    toTimestamp: number = Date.now()
  ): Promise<SystemMetrics[]> {
    // 전체 히스토리 가져온 후 필터링
    const allData = await this.redis.lrange(REDIS_KEYS.METRICS_HISTORY, 0, -1);
    
    return allData
      .map((d) => JSON.parse(d) as SystemMetrics)
      .filter((m) => m.timestamp >= fromTimestamp && m.timestamp <= toTimestamp);
  }

  /**
   * Prometheus 형식으로 메트릭 export
   */
  exportPrometheus(): string {
    if (!this.currentMetrics) {
      return '# No metrics available\n';
    }

    const m = this.currentMetrics;
    const lines: string[] = [];

    // 노드 메트릭
    lines.push('# HELP doai_nodes_total Total number of nodes');
    lines.push('# TYPE doai_nodes_total gauge');
    lines.push(`doai_nodes_total ${m.nodes.total}`);
    lines.push(`doai_nodes_online ${m.nodes.online}`);
    lines.push(`doai_nodes_offline ${m.nodes.offline}`);

    // 디바이스 메트릭
    lines.push('# HELP doai_devices_total Total number of devices');
    lines.push('# TYPE doai_devices_total gauge');
    lines.push(`doai_devices_total ${m.devices.total}`);
    lines.push(`doai_devices_idle ${m.devices.idle}`);
    lines.push(`doai_devices_running ${m.devices.running}`);
    lines.push(`doai_devices_error ${m.devices.error}`);
    lines.push(`doai_devices_disconnected ${m.devices.disconnected}`);
    lines.push(`doai_devices_quarantine ${m.devices.quarantine}`);

    // 큐 메트릭
    lines.push('# HELP doai_queue_jobs Queue job counts');
    lines.push('# TYPE doai_queue_jobs gauge');
    lines.push(`doai_queue_waiting ${m.queue.waiting}`);
    lines.push(`doai_queue_active ${m.queue.active}`);
    lines.push(`doai_queue_completed ${m.queue.completed}`);
    lines.push(`doai_queue_failed ${m.queue.failed}`);

    // 워크플로우 메트릭
    lines.push('# HELP doai_workflows Workflow statistics');
    lines.push('# TYPE doai_workflows gauge');
    lines.push(`doai_workflows_running ${m.workflows.running}`);
    lines.push(`doai_workflows_completed_5m ${m.workflows.completedLast5m}`);
    lines.push(`doai_workflows_failed_5m ${m.workflows.failedLast5m}`);
    lines.push(`doai_workflows_avg_duration_ms ${m.workflows.avgDurationMs}`);

    return lines.join('\n') + '\n';
  }

  /**
   * 정리 (Redis는 외부에서 관리하는 경우 quit 호출 안함)
   */
  async disconnect(): Promise<void> {
    this.stop();
    // Redis 인스턴스가 외부에서 주입된 경우 quit하지 않음
    // 필요시 서버에서 직접 redis.quit() 호출
    console.log('[MetricsCollector] Disconnected');
  }

  /**
   * Redis 연결 종료 (독립 사용 시)
   */
  async close(): Promise<void> {
    this.stop();
    await this.redis.quit();
    console.log('[MetricsCollector] Closed');
  }
}

export default MetricsCollector;
