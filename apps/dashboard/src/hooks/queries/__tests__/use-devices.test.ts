import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDevicesQuery } from '../use-devices';

// Mock the API module
vi.mock('@/lib/api', () => ({
  fetchDevices: vi.fn(),
}));

import { fetchDevices } from '@/lib/api';
const mockFetchDevices = vi.mocked(fetchDevices);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useDevicesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state initially', () => {
    mockFetchDevices.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useDevicesQuery(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns devices and PCs on success', async () => {
    mockFetchDevices.mockResolvedValue({
      devices: [
        {
          id: 'dev-1',
          device_id: 'DEVICE001',
          pc_id: 'pc-1',
          status: 'online',
          battery_level: 85,
          is_charging: false,
          memory_used: 2048,
          memory_total: 4096,
          storage_used: 32,
          storage_total: 64,
          cpu_usage: 30,
          temperature: 36,
          wifi_signal: 90,
        },
      ],
      pcs: [
        { id: 'pc-1', pc_number: 'PC01' },
      ],
    });

    const { result } = renderHook(() => useDevicesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.devices).toHaveLength(1);
    expect(result.current.data!.devices[0].device_id).toBe('DEVICE001');
    expect(result.current.data!.devices[0].status).toBe('online');
    expect(result.current.data!.pcs).toHaveLength(1);
    expect(result.current.data!.pcs[0].pc_number).toBe('PC01');
  });

  it('returns error state on failure', async () => {
    mockFetchDevices.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDevicesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Network error');
  });

  it('returns empty arrays when API returns no data', async () => {
    mockFetchDevices.mockResolvedValue({
      devices: [],
      pcs: [],
    });

    const { result } = renderHook(() => useDevicesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.devices).toHaveLength(0);
    expect(result.current.data!.pcs).toHaveLength(0);
  });

  it('generates PCs from device data when no PCs table', async () => {
    mockFetchDevices.mockResolvedValue({
      devices: [
        { id: 'd1', device_id: 'D1', pc_id: 'pc-a', status: 'online' },
        { id: 'd2', device_id: 'D2', pc_id: 'pc-a', status: 'offline' },
        { id: 'd3', device_id: 'D3', pc_id: 'pc-b', status: 'busy' },
      ],
      pcs: [],
    });

    const { result } = renderHook(() => useDevicesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.pcs).toHaveLength(2);
    expect(result.current.data!.pcs[0].pc_number).toBe('PC01');
    expect(result.current.data!.pcs[0].online).toBe(1);
    expect(result.current.data!.pcs[0].offline).toBe(1);
  });
});
