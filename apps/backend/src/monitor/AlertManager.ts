/**
 * 알림 매니저 (AlertManager)
 * 
 * 500대 디바이스 운영을 위한 알림 시스템
 * - 메트릭 기반 조건 평가
 * - 중복 알림 방지 (5분 TTL)
 * - 다중 채널 발송 (Discord, Slack, ntfy)
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { AlertLevel, AlertChannel, AlertRule, SystemMetrics } from './types';
import { logger } from '../utils/logger';

// ============================================
// 상수
// ============================================

const ALERT_SUPPRESS_TTL = 300; // 5분 (중복 알림 방지)

const COLORS: Record<AlertLevel, number> = {
  critical: 0xff0000, // 빨강
  warning: 0xffaa00,  // 주황
  info: 0x0099ff,     // 파랑
};

const EMOJIS: Record<AlertLevel, string> = {
  critical: ':rotating_light:',
  warning: ':warning:',
  info: ':information_source:',
};

const PRIORITIES: Record<AlertLevel, string> = {
  critical: 'urgent',
  warning: 'high',
  info: 'default',
};

// ============================================
// AlertManager 클래스
// ============================================

export class AlertManager extends EventEmitter {
  private redis: Redis;
  private channels: AlertChannel[] = [];
  private rules: AlertRule[] = [];

  constructor(redis: Redis);
  constructor(config: { redisUrl: string; channels?: AlertChannel[] }, metricsCollector?: unknown);
  constructor(
    redisOrConfig: Redis | { redisUrl: string; channels?: AlertChannel[] },
    _metricsCollector?: unknown
  ) {
    super();
    
    if (redisOrConfig instanceof Redis) {
      this.redis = redisOrConfig;
    } else {
      this.redis = new Redis(redisOrConfig.redisUrl, {
        maxRetriesPerRequest: null,
      });
      if (redisOrConfig.channels) {
        this.channels = redisOrConfig.channels;
      }
    }
    
    this.loadConfig();
  }

  /**
   * 설정 로드
   */
  private loadConfig(): void {
    // 기본 알림 규칙
    this.rules = [
      // Critical (즉시 알림)
      {
        id: 'node_offline',
        name: '노드 오프라인',
        level: 'critical',
        condition: 'nodes.offline > 0',
        message: '🚨 노드 오프라인 감지',
        enabled: true,
      },
      {
        id: 'high_error_rate',
        name: '높은 에러율',
        level: 'critical',
        condition: 'devices.error / devices.total > 0.3',
        message: '🚨 에러율 30% 초과',
        enabled: true,
      },
      {
        id: 'queue_stuck',
        name: '큐 적체',
        level: 'critical',
        condition: 'queue.waiting > 200',
        message: '🚨 작업 큐 적체 (200개 초과)',
        enabled: true,
      },
      
      // Warning (모아서 알림)
      {
        id: 'many_disconnected',
        name: '다수 연결 끊김',
        level: 'warning',
        condition: 'devices.disconnected > 20',
        message: '⚠️ 다수 기기 연결 끊김',
        enabled: true,
      },
      {
        id: 'quarantine_increase',
        name: '격리 기기 증가',
        level: 'warning',
        condition: 'devices.quarantine > 10',
        message: '⚠️ 격리된 기기 10대 초과',
        enabled: true,
      },
    ];

    // 알림 채널 (환경변수에서 로드)
    if (process.env.DISCORD_WEBHOOK) {
      this.channels.push({
        id: 'discord_env',
        type: 'discord',
        name: 'Discord (ENV)',
        webhook: process.env.DISCORD_WEBHOOK,
        levels: ['critical', 'warning'],
        enabled: true,
      });
    }

    if (process.env.SLACK_WEBHOOK) {
      this.channels.push({
        id: 'slack_env',
        type: 'slack',
        name: 'Slack (ENV)',
        webhook: process.env.SLACK_WEBHOOK,
        levels: ['critical'],
        enabled: true,
      });
    }

    // ntfy (무료 대안)
    if (process.env.NTFY_TOPIC) {
      this.channels.push({
        id: 'ntfy_env',
        type: 'ntfy',
        name: 'ntfy (ENV)',
        topic: process.env.NTFY_TOPIC,
        levels: ['critical', 'warning'],
        enabled: true,
      });
    }

    logger.info('[AlertManager] Loaded config', {
      rules: this.rules.length,
      channels: this.channels.length,
    });
  }

  /**
   * 시작 (MetricsCollector 이벤트 구독용)
   */
  start(): void {
    logger.info('[AlertManager] Started');
  }

  /**
   * 중지
   */
  stop(): void {
    logger.info('[AlertManager] Stopped');
  }

  /**
   * 메트릭 기반 알림 조건 체크
   */
  async checkConditions(metrics: SystemMetrics): Promise<void> {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const triggered = this.evaluateCondition(rule.condition as string, metrics);
      if (triggered) {
        await this.send(rule.level, rule.message, {
          rule_id: rule.id,
          metrics,
        });
      }
    }
  }

  /**
   * Safe condition evaluators map
   * Each key maps to an evaluator function that returns boolean
   */
  private readonly conditionEvaluators: Record<string, (metrics: SystemMetrics) => boolean> = {
    'nodes.offline > 0': (m) => m.nodes.offline > 0,
    'devices.error / devices.total > 0.3': (m) => {
      const safeTotal = m.devices.total || 1;
      return m.devices.error / safeTotal > 0.3;
    },
    'queue.waiting > 200': (m) => m.queue.waiting > 200,
    'devices.disconnected > 20': (m) => m.devices.disconnected > 20,
    'devices.quarantine > 10': (m) => m.devices.quarantine > 10,
  };

  /**
   * 조건 평가 - Uses safe evaluator map instead of new Function
   */
  private evaluateCondition(condition: string, metrics: SystemMetrics): boolean {
    try {
      const evaluator = this.conditionEvaluators[condition];
      
      if (!evaluator) {
        logger.warn('[AlertManager] Unknown condition key, skipping evaluation', { condition });
        return false;
      }
      
      return evaluator(metrics);
    } catch (e) {
      logger.error('[AlertManager] Condition evaluation failed', { condition, error: e });
      return false;
    }
  }

  /**
   * 알림 발송
   */
  async send(level: AlertLevel, message: string, data?: Record<string, unknown>): Promise<void> {
    // 중복 알림 방지 (같은 메시지는 5분에 1번만)
    const alertKey = `alert:sent:${level}:${message}`;
    const exists = await this.redis.exists(alertKey);
    if (exists) {
      logger.debug('[AlertManager] Alert suppressed (duplicate)', { level, message });
      return;
    }

    await this.redis.setex(alertKey, ALERT_SUPPRESS_TTL, '1'); // 5분 TTL

    // 해당 레벨을 수신하는 채널에 발송
    for (const channel of this.channels) {
      if (!channel.enabled || !channel.levels.includes(level)) continue;

      try {
        await this.sendToChannel(channel, level, message, data);
      } catch (e) {
        logger.error('[AlertManager] Send failed', { channel: channel.type, error: e });
      }
    }

    // 이벤트 발생
    this.emit('alert:fired', { level, message, data });

    // 로그 기록
    logger.info('[AlertManager] Alert sent', { level, message });
  }

  /**
   * 채널로 발송
   */
  private async sendToChannel(
    channel: AlertChannel,
    level: AlertLevel,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    switch (channel.type) {
      case 'discord':
        await this.sendDiscord(channel.webhook!, level, message, data, timestamp);
        break;
      case 'slack':
        await this.sendSlack(channel.webhook!, level, message, data, timestamp);
        break;
      case 'ntfy':
        await this.sendNtfy(channel.topic!, level, message);
        break;
    }
  }

  /**
   * Discord 웹훅 발송 (with timeout)
   */
  private async sendDiscord(
    webhook: string,
    level: AlertLevel,
    message: string,
    data: Record<string, unknown> | undefined,
    timestamp: string
  ): Promise<void> {
    const payload = {
      embeds: [{
        title: `DoAi.Me Alert [${level.toUpperCase()}]`,
        description: message,
        color: COLORS[level],
        timestamp,
        fields: data ? [
          {
            name: '상세 정보',
            value: '```json\n' + JSON.stringify(
              (data.metrics as Record<string, unknown>)?.devices || data,
              null,
              2
            ).slice(0, 1000) + '\n```',
          }
        ] : [],
      }],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.warn('[AlertManager] Discord webhook timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Slack 웹훅 발송 (with timeout)
   */
  private async sendSlack(
    webhook: string,
    level: AlertLevel,
    message: string,
    data: Record<string, unknown> | undefined,
    _timestamp: string
  ): Promise<void> {
    const payload = {
      text: `${EMOJIS[level]} *[${level.toUpperCase()}]* ${message}`,
      attachments: data ? [{
        text: '```' + JSON.stringify(
          (data.metrics as Record<string, unknown>)?.devices || data,
          null,
          2
        ).slice(0, 1000) + '```',
        ts: Math.floor(Date.now() / 1000),
      }] : [],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.warn('[AlertManager] Slack webhook timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * ntfy 발송 (with timeout)
   */
  private async sendNtfy(
    topic: string,
    level: AlertLevel,
    message: string
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: {
          'Title': `DoAi.Me [${level.toUpperCase()}]`,
          'Priority': PRIORITIES[level],
          'Tags': level === 'critical' ? 'rotating_light' : 'warning',
        },
        body: message,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.warn('[AlertManager] ntfy request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 수동 알림 (API에서 호출) - 중복 방지 없이 즉시 발송
   */
  async sendManual(level: AlertLevel, message: string): Promise<void> {
    for (const channel of this.channels) {
      if (!channel.enabled || !channel.levels.includes(level)) continue;
      await this.sendToChannel(channel, level, message, undefined);
    }

    this.emit('alert:manual', { level, message });
    logger.info('[AlertManager] Manual alert sent', { level, message });
  }

  // ============================================
  // 추가 API (이전 버전 호환)
  // ============================================

  /**
   * 활성 알림 목록 (현재 suppress 중인 알림)
   * Uses SCAN instead of KEYS to avoid blocking Redis
   */
  async getActiveAlerts(): Promise<{ level: string; message: string; timestamp: number }[]> {
    const alerts: { level: string; message: string; timestamp: number }[] = [];
    const PREFIX = 'alert:sent:';
    let cursor = '0';
    
    // Use SCAN to iterate without blocking
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      
      for (const key of keys) {
        // Safe parsing: strip prefix, then find first colon for level/message separation
        const withoutPrefix = key.substring(PREFIX.length);
        const firstColonIdx = withoutPrefix.indexOf(':');
        
        if (firstColonIdx === -1) continue;
        
        const level = withoutPrefix.substring(0, firstColonIdx);
        const message = withoutPrefix.substring(firstColonIdx + 1);
        const ttl = await this.redis.ttl(key);
        
        alerts.push({
          level,
          message,
          timestamp: Date.now() - (ALERT_SUPPRESS_TTL - ttl) * 1000,
        });
      }
    } while (cursor !== '0');

    return alerts;
  }

  /**
   * 알림 확인 (Acknowledge) - suppress 해제
   */
  async acknowledgeAlert(level: string, message: string): Promise<boolean> {
    const alertKey = `alert:sent:${level}:${message}`;
    const deleted = await this.redis.del(alertKey);
    return deleted > 0;
  }

  /**
   * 알림 히스토리 (Redis에서 조회)
   */
  async getAlertHistory(
    _fromTimestamp: number,
    _toTimestamp: number = Date.now()
  ): Promise<{ level: string; message: string; timestamp: number }[]> {
    // 현재 suppress 중인 알림만 반환 (실제 히스토리는 로그에서 확인)
    return this.getActiveAlerts();
  }

  /**
   * 채널 추가
   */
  addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
    logger.info('[AlertManager] Channel added', { type: channel.type, name: channel.name });
  }

  /**
   * 규칙 추가
   */
  addRule(rule: AlertRule): void {
    this.rules.push(rule);
    logger.info('[AlertManager] Rule added', { id: rule.id, name: rule.name });
  }

  /**
   * 정리 (Redis는 외부에서 관리하는 경우 quit 호출 안함)
   */
  async disconnect(): Promise<void> {
    this.stop();
    // Redis 인스턴스가 외부에서 주입된 경우 quit하지 않음
    logger.info('[AlertManager] Disconnected');
  }

  /**
   * Redis 연결 종료 (독립 사용 시)
   */
  async close(): Promise<void> {
    this.stop();
    await this.redis.quit();
    logger.info('[AlertManager] Closed');
  }
}

export default AlertManager;
