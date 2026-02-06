// ============================================
// InternalQueue Persistence Adapters
// JSON 파일 기반 및 인메모리 영속성
// ============================================

import fs from 'fs';
import path from 'path';

/**
 * Queued job stored in persistence
 */
export interface StoredJob {
  id: string;
  deviceId: string;
  workflowId: string;
  params: Record<string, unknown>;
  priority: number;
  enqueuedAt: number;
  timeoutMs?: number;
}

/**
 * Persistence adapter interface
 */
export interface InternalQueueStore {
  /** Load all queued jobs from storage */
  load(): Promise<Map<string, StoredJob[]>>;
  /** Save all queued jobs to storage */
  save(queues: Map<string, StoredJob[]>): Promise<void>;
  /** Clear all stored data */
  clear(): Promise<void>;
}

/**
 * In-memory store (no persistence, for testing)
 */
export class MemoryQueueStore implements InternalQueueStore {
  private data: Map<string, StoredJob[]> = new Map();

  async load(): Promise<Map<string, StoredJob[]>> {
    return new Map(this.data);
  }

  async save(queues: Map<string, StoredJob[]>): Promise<void> {
    this.data = new Map(queues);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

/**
 * JSON file-based persistence
 * Saves queue state to a local JSON file for bot restart survival
 */
export class JsonFileQueueStore implements InternalQueueStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<Map<string, StoredJob[]>> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return new Map();
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, StoredJob[]>;

      const map = new Map<string, StoredJob[]>();
      for (const [deviceId, jobs] of Object.entries(data)) {
        map.set(deviceId, jobs);
      }
      return map;
    } catch {
      // If file is corrupt or missing, start fresh
      return new Map();
    }
  }

  async save(queues: Map<string, StoredJob[]>): Promise<void> {
    const data: Record<string, StoredJob[]> = {};
    for (const [deviceId, jobs] of queues) {
      if (jobs.length > 0) {
        data[deviceId] = jobs;
      }
    }

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async clear(): Promise<void> {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // Ignore errors during cleanup
    }
  }
}
