/**
 * 모니터링 시스템 모듈
 * 
 * 500대 디바이스 운영을 위한 모니터링 및 알림 시스템
 */

export * from './types';
export { MetricsCollector } from './MetricsCollector';
export { AlertManager } from './AlertManager';

// 사용 예제
/*
import { MetricsCollector, AlertManager, AlertChannel, AlertLevel } from './monitor';

// 1. 메트릭 수집기 초기화
const metricsCollector = new MetricsCollector({
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  collectIntervalMs: 10000, // 10초마다
});

// 2. 알림 채널 설정
const discordChannel: AlertChannel = {
  id: 'discord_main',
  type: 'discord',
  name: 'Discord 알림',
  webhook: process.env.DISCORD_WEBHOOK_URL,
  levels: ['critical', 'warning'] as AlertLevel[],
  enabled: true,
};

const ntfyChannel: AlertChannel = {
  id: 'ntfy_mobile',
  type: 'ntfy',
  name: 'ntfy 모바일',
  topic: 'doai-alerts',
  levels: ['critical'] as AlertLevel[],
  enabled: true,
};

// 3. 알림 매니저 초기화
const alertManager = new AlertManager(
  {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    channels: [discordChannel, ntfyChannel],
  },
  metricsCollector
);

// 4. 시작
metricsCollector.start();
alertManager.start();

// 5. 이벤트 핸들링
metricsCollector.on('metrics:collected', (metrics) => {
  console.log('Metrics:', metrics);
});

alertManager.on('alert:fired', (alert) => {
  console.log('Alert fired:', alert.title);
});

alertManager.on('alert:resolved', (alert) => {
  console.log('Alert resolved:', alert.title);
});

// 6. 종료 시
process.on('SIGTERM', async () => {
  await alertManager.disconnect();
  await metricsCollector.disconnect();
});
*/
