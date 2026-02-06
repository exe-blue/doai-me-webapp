import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MemoryQueueStore,
  JsonFileQueueStore,
  type StoredJob,
} from './InternalQueueStore';

// ================================================================
// MemoryQueueStore
// ================================================================
describe('MemoryQueueStore', () => {
  it('save() and load() round-trip', async () => {
    const store = new MemoryQueueStore();

    const jobs: StoredJob[] = [
      {
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: { key: 'value' },
        priority: 5,
        enqueuedAt: 1000,
        timeoutMs: 30000,
      },
      {
        id: 'job-2',
        deviceId: 'device-A',
        workflowId: 'wf-2',
        params: {},
        priority: 0,
        enqueuedAt: 2000,
      },
    ];

    const original = new Map<string, StoredJob[]>();
    original.set('device-A', jobs);
    original.set('device-B', [
      {
        id: 'job-3',
        deviceId: 'device-B',
        workflowId: 'wf-3',
        params: {},
        priority: 1,
        enqueuedAt: 3000,
      },
    ]);

    await store.save(original);
    const loaded = await store.load();

    expect(loaded.size).toBe(2);
    expect(loaded.get('device-A')).toHaveLength(2);
    expect(loaded.get('device-B')).toHaveLength(1);

    // Verify data integrity
    const deviceAJobs = loaded.get('device-A')!;
    expect(deviceAJobs[0].id).toBe('job-1');
    expect(deviceAJobs[0].params).toEqual({ key: 'value' });
    expect(deviceAJobs[0].timeoutMs).toBe(30000);
    expect(deviceAJobs[1].id).toBe('job-2');
    expect(deviceAJobs[1].timeoutMs).toBeUndefined();
  });

  it('load() returns a separate copy (not same reference)', async () => {
    const store = new MemoryQueueStore();
    const jobs: StoredJob[] = [
      {
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 0,
        enqueuedAt: 1000,
      },
    ];

    const original = new Map<string, StoredJob[]>();
    original.set('device-A', jobs);
    await store.save(original);

    const loaded1 = await store.load();
    const loaded2 = await store.load();
    expect(loaded1).not.toBe(loaded2); // Different Map instances
  });

  it('clear() empties data', async () => {
    const store = new MemoryQueueStore();
    const map = new Map<string, StoredJob[]>();
    map.set('device-A', [
      {
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 0,
        enqueuedAt: 1000,
      },
    ]);

    await store.save(map);
    await store.clear();

    const loaded = await store.load();
    expect(loaded.size).toBe(0);
  });

  it('load() on empty store returns empty Map', async () => {
    const store = new MemoryQueueStore();
    const loaded = await store.load();
    expect(loaded).toBeInstanceOf(Map);
    expect(loaded.size).toBe(0);
  });
});

// ================================================================
// JsonFileQueueStore
// ================================================================
describe('JsonFileQueueStore', () => {
  const testFiles: string[] = [];

  function createTestPath(): string {
    const filePath = `/tmp/test-queue-store-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    testFiles.push(filePath);
    return filePath;
  }

  afterEach(() => {
    // Clean up all test files
    for (const f of testFiles) {
      try {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    testFiles.length = 0;
  });

  it('save() creates JSON file and load() restores it', async () => {
    const filePath = createTestPath();
    const store = new JsonFileQueueStore(filePath);

    const jobs: StoredJob[] = [
      {
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: { x: 42 },
        priority: 3,
        enqueuedAt: 1000,
        timeoutMs: 5000,
      },
    ];

    const map = new Map<string, StoredJob[]>();
    map.set('device-A', jobs);
    map.set('device-B', [
      {
        id: 'job-2',
        deviceId: 'device-B',
        workflowId: 'wf-2',
        params: {},
        priority: 0,
        enqueuedAt: 2000,
      },
    ]);

    await store.save(map);

    // File should exist
    expect(fs.existsSync(filePath)).toBe(true);

    // Load should restore data
    const loaded = await store.load();
    expect(loaded.size).toBe(2);
    expect(loaded.get('device-A')![0].id).toBe('job-1');
    expect(loaded.get('device-A')![0].params).toEqual({ x: 42 });
    expect(loaded.get('device-A')![0].timeoutMs).toBe(5000);
    expect(loaded.get('device-B')![0].id).toBe('job-2');
  });

  it('clear() deletes the file', async () => {
    const filePath = createTestPath();
    const store = new JsonFileQueueStore(filePath);

    const map = new Map<string, StoredJob[]>();
    map.set('device-A', [
      {
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 0,
        enqueuedAt: 1000,
      },
    ]);

    await store.save(map);
    expect(fs.existsSync(filePath)).toBe(true);

    await store.clear();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('load() on missing file returns empty Map', async () => {
    const filePath = `/tmp/test-queue-nonexistent-${Date.now()}.json`;
    const store = new JsonFileQueueStore(filePath);

    const loaded = await store.load();
    expect(loaded).toBeInstanceOf(Map);
    expect(loaded.size).toBe(0);
  });

  it('load() on corrupt file returns empty Map', async () => {
    const filePath = createTestPath();
    fs.writeFileSync(filePath, '{ invalid json !!!', 'utf-8');

    const store = new JsonFileQueueStore(filePath);
    const loaded = await store.load();
    expect(loaded).toBeInstanceOf(Map);
    expect(loaded.size).toBe(0);
  });

  it('save() creates directory if needed', async () => {
    const dirPath = `/tmp/test-queue-dir-${Date.now()}`;
    const filePath = path.join(dirPath, 'nested', 'queue.json');
    testFiles.push(filePath);

    const store = new JsonFileQueueStore(filePath);
    const map = new Map<string, StoredJob[]>();
    map.set('device-A', [
      {
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 0,
        enqueuedAt: 1000,
      },
    ]);

    await store.save(map);
    expect(fs.existsSync(filePath)).toBe(true);

    // Clean up nested directory
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('save() excludes empty device arrays', async () => {
    const filePath = createTestPath();
    const store = new JsonFileQueueStore(filePath);

    const map = new Map<string, StoredJob[]>();
    map.set('device-A', [
      {
        id: 'job-1',
        deviceId: 'device-A',
        workflowId: 'wf-1',
        params: {},
        priority: 0,
        enqueuedAt: 1000,
      },
    ]);
    map.set('device-B', []); // Empty array should be excluded

    await store.save(map);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).not.toHaveProperty('device-B');
    expect(parsed['device-A']).toHaveLength(1);
  });

  it('clear() does not throw when file does not exist', async () => {
    const filePath = `/tmp/test-queue-no-file-${Date.now()}.json`;
    const store = new JsonFileQueueStore(filePath);

    // Should not throw
    await expect(store.clear()).resolves.toBeUndefined();
  });
});
