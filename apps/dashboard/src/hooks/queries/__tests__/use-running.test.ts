import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRunningTasksQuery, useNodesQuery } from '../use-running';

// Mock the API module
vi.mock('@/lib/api', () => ({
  fetchRunningTasks: vi.fn(),
  fetchNodes: vi.fn(),
  fetchTodayStats: vi.fn(),
}));

import { fetchRunningTasks, fetchNodes } from '@/lib/api';
const mockFetchRunningTasks = vi.mocked(fetchRunningTasks);
const mockFetchNodes = vi.mocked(fetchNodes);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
}

describe('useRunningTasksQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state initially', () => {
    mockFetchRunningTasks.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(
      () => useRunningTasksQuery(undefined, false),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns running tasks on success', async () => {
    mockFetchRunningTasks.mockResolvedValue([
      {
        id: 'task-1',
        video_id: 'vid-1',
        device_id: 'dev-1',
        node_id: 'node-1',
        status: 'running',
        watch_duration_sec: 120,
        will_like: true,
        will_comment: false,
        will_subscribe: false,
        started_at: new Date(Date.now() - 30000).toISOString(),
        video: { title: 'Test Video', thumbnail_url: '', channel_name: 'Test' },
      },
    ]);

    const { result } = renderHook(
      () => useRunningTasksQuery(undefined, false),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].video_id).toBe('vid-1');
    expect(result.current.data![0].progress).toBeGreaterThanOrEqual(0);
    expect(result.current.data![0].current_step).toBeDefined();
    expect(result.current.data![0].elapsed_sec).toBeGreaterThanOrEqual(0);
  });

  it('returns error on failure', async () => {
    mockFetchRunningTasks.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(
      () => useRunningTasksQuery(undefined, false),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('DB error');
  });

  it('returns empty array when no tasks running', async () => {
    mockFetchRunningTasks.mockResolvedValue([]);

    const { result } = renderHook(
      () => useRunningTasksQuery(undefined, false),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(0);
  });

  it('passes nodeFilter parameter', async () => {
    mockFetchRunningTasks.mockResolvedValue([]);

    renderHook(
      () => useRunningTasksQuery('node-2', false),
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(mockFetchRunningTasks).toHaveBeenCalledWith('node-2'),
    );
  });
});

describe('useNodesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped nodes on success', async () => {
    mockFetchNodes.mockResolvedValue([
      {
        id: 'n-1',
        name: 'Node 1',
        status: 'online',
        connected_at: new Date().toISOString(),
        total_devices: 50,
        active_devices: 20,
        idle_devices: 25,
        error_devices: 5,
        tasks_per_minute: 5.5,
        cpu_usage: 40,
        memory_usage: 60,
      },
    ]);

    const { result } = renderHook(() => useNodesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].name).toBe('Node 1');
    expect(result.current.data![0].status).toBe('online');
    expect(result.current.data![0].active_devices).toBe(20);
  });

  it('returns empty array when no nodes (replaces dummyNodes)', async () => {
    mockFetchNodes.mockResolvedValue([]);

    const { result } = renderHook(() => useNodesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(0);
  });
});
