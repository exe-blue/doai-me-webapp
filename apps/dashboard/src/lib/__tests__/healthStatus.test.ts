import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeHealthStatus, getHealthIndicator } from '../healthStatus';
import type { Device } from '../supabase';

// Helper to create a device with overrides
function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'device-001',
    pc_id: 'pc-001',
    device_number: 1,
    serial_number: 'SN001',
    model: 'Pixel 7',
    status: 'online',
    adb_address: '192.168.1.100:5555',
    last_heartbeat: new Date().toISOString(),
    last_task_at: null,
    last_error: null,
    last_error_at: null,
    error_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    appium_port: null,
    system_port: null,
    wifi_adb_enabled: false,
    wifi_adb_address: null,
    ...overrides,
  } as Device;
}

describe('computeHealthStatus()', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return offline for offline devices', () => {
    const device = makeDevice({ status: 'offline' });

    expect(computeHealthStatus(device)).toBe('offline');
  });

  it('should return zombie for error devices', () => {
    const device = makeDevice({ status: 'error' });

    expect(computeHealthStatus(device)).toBe('zombie');
  });

  it('should return offline when no activity timestamps', () => {
    const device = makeDevice({
      status: 'online',
      last_heartbeat: null,
      last_task_at: null,
    });

    expect(computeHealthStatus(device)).toBe('offline');
  });

  it('should return healthy when heartbeat is within 60 seconds', () => {
    vi.useFakeTimers();
    const now = new Date('2026-02-06T12:00:00Z');
    vi.setSystemTime(now);

    const device = makeDevice({
      status: 'online',
      last_heartbeat: new Date(now.getTime() - 30_000).toISOString(), // 30s ago
    });

    expect(computeHealthStatus(device)).toBe('healthy');
  });

  it('should return healthy in 60-180s boundary zone', () => {
    vi.useFakeTimers();
    const now = new Date('2026-02-06T12:00:00Z');
    vi.setSystemTime(now);

    const device = makeDevice({
      status: 'online',
      last_heartbeat: new Date(now.getTime() - 120_000).toISOString(), // 120s ago
    });

    expect(computeHealthStatus(device)).toBe('healthy');
  });

  it('should return zombie when inactive over 180 seconds', () => {
    vi.useFakeTimers();
    const now = new Date('2026-02-06T12:00:00Z');
    vi.setSystemTime(now);

    const device = makeDevice({
      status: 'online',
      last_heartbeat: new Date(now.getTime() - 200_000).toISOString(), // 200s ago
    });

    expect(computeHealthStatus(device)).toBe('zombie');
  });

  it('should use the most recent of heartbeat and last_task_at', () => {
    vi.useFakeTimers();
    const now = new Date('2026-02-06T12:00:00Z');
    vi.setSystemTime(now);

    // heartbeat is old but last_task_at is recent
    const device = makeDevice({
      status: 'online',
      last_heartbeat: new Date(now.getTime() - 300_000).toISOString(), // 5min ago
      last_task_at: new Date(now.getTime() - 10_000).toISOString(),    // 10s ago
    });

    expect(computeHealthStatus(device)).toBe('healthy');
  });

  it('should use heartbeat when last_task_at is null', () => {
    vi.useFakeTimers();
    const now = new Date('2026-02-06T12:00:00Z');
    vi.setSystemTime(now);

    const device = makeDevice({
      status: 'online',
      last_heartbeat: new Date(now.getTime() - 20_000).toISOString(),
      last_task_at: null,
    });

    expect(computeHealthStatus(device)).toBe('healthy');
  });

  it('should return zombie at exactly 180s + 1ms', () => {
    vi.useFakeTimers();
    const now = new Date('2026-02-06T12:00:00Z');
    vi.setSystemTime(now);

    const device = makeDevice({
      status: 'online',
      last_heartbeat: new Date(now.getTime() - 180_001).toISOString(),
    });

    expect(computeHealthStatus(device)).toBe('zombie');
  });

  it('should return healthy at exactly 60s (boundary)', () => {
    vi.useFakeTimers();
    const now = new Date('2026-02-06T12:00:00Z');
    vi.setSystemTime(now);

    const device = makeDevice({
      status: 'online',
      last_heartbeat: new Date(now.getTime() - 60_000).toISOString(),
    });

    expect(computeHealthStatus(device)).toBe('healthy');
  });
});

describe('getHealthIndicator()', () => {
  it('should return green for healthy', () => {
    const indicator = getHealthIndicator('healthy');

    expect(indicator.color).toBe('text-green-500');
    expect(indicator.bgColor).toBe('bg-green-500');
    expect(indicator.animation).toBe('animate-pulse');
    expect(indicator.label).toBe('정상');
  });

  it('should return red for zombie', () => {
    const indicator = getHealthIndicator('zombie');

    expect(indicator.color).toBe('text-red-500');
    expect(indicator.bgColor).toBe('bg-red-500');
    expect(indicator.animation).toBe('animate-ping');
    expect(indicator.label).toBe('무응답');
  });

  it('should return gray for offline', () => {
    const indicator = getHealthIndicator('offline');

    expect(indicator.color).toBe('text-gray-400');
    expect(indicator.bgColor).toBe('bg-gray-400');
    expect(indicator.animation).toBe('');
    expect(indicator.label).toBe('오프라인');
  });
});
