'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Device } from '@/lib/supabase';
import { 
  DASHBOARD_EVENTS, 
  SOCKET_NAMESPACES, 
  TIMING 
} from '@doai/shared';

interface SocketHookOptions {
  autoConnect?: boolean;
}

interface StreamFrame {
  deviceId: string;
  frame: string; // base64 encoded image
  timestamp: number;
}

interface CommandResult {
  deviceId: string;
  commandId: string;
  success: boolean;
  error?: string;
}

// Socket.io server URL from environment or default to localhost:3001
const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

// Strict naming convention: P01-001, P02-015 etc.
const VALID_PC_ID_PATTERN = /^P\d{1,2}-\d{3}$/;

export function useSocket(options: SocketHookOptions = {}) {
  const { autoConnect = true } = options;
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);

  // Event listeners
  const frameListenersRef = useRef<Map<string, (frame: StreamFrame) => void>>(new Map());
  const commandResultListenersRef = useRef<((result: CommandResult) => void)[]>([]);

  // Fetch persisted devices from Supabase API on mount (for device persistence)
  useEffect(() => {
    async function fetchPersistedDevices() {
      try {
        const response = await fetch('/api/devices');
        if (response.ok) {
          const data = await response.json();
          if (data.devices && data.devices.length > 0) {
            // Pre-filter: only valid P##-### naming convention devices
            const validDevices = data.devices.filter(
              (d: Device) => d.pc_id && VALID_PC_ID_PATTERN.test(d.pc_id)
            );
            console.log('[Socket] Loaded persisted devices from DB:', validDevices.length, '/', data.devices.length);
            // Only set if we don't have socket data yet
            setDevices(prev => {
              if (prev.length === 0) {
                return validDevices;
              }
              // Merge: keep socket data but add any DB-only devices
              const socketIds = new Set(prev.map((d: Device) => d.id));
              const dbOnlyDevices = validDevices.filter((d: Device) => !socketIds.has(d.id));
              return [...prev, ...dbOnlyDevices];
            });
          }
        }
      } catch (err) {
        console.error('[Socket] Failed to fetch persisted devices:', err);
      }
    }

    fetchPersistedDevices();
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect) return;

    const socket = io(`${SOCKET_SERVER_URL}${SOCKET_NAMESPACES.DASHBOARD}`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: TIMING.RECONNECT_DELAY
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected to /dashboard');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
    });

    // Initial device list from Socket - merge with persisted data
    socket.on(DASHBOARD_EVENTS.DEVICES_INITIAL, (initialDevices: Device[]) => {
      console.log('[Socket] Received initial devices from socket:', initialDevices.length);
      setDevices(prev => {
        // Merge: socket devices override persisted by ID
        const mergedMap = new Map<string, Device>();

        // First add persisted devices (from DB)
        prev.forEach(d => {
          if (d.id) mergedMap.set(d.id, d);
        });

        // Then override with socket devices (real-time data takes precedence)
        initialDevices.forEach(d => {
          if (d.id) {
            const existing = mergedMap.get(d.id);
            mergedMap.set(d.id, existing ? { ...existing, ...d } : d);
          }
        });

        return Array.from(mergedMap.values());
      });
    });

    // Device status updates
    // Socket sends device_id but frontend uses id, so we normalize
    socket.on('device:status:update', (update: Partial<Device> & { device_id?: string }) => {
      const deviceId = update.device_id || update.id;
      if (!deviceId) {
        console.warn('[Socket] Received device update without id:', update);
        return;
      }

      const normalizedDevice: Device = {
        ...update,
        id: deviceId,
      } as Device;

      setDevices(prev => {
        const existingIndex = prev.findIndex(d => d.id === deviceId || d.serial_number === update.serial_number);
        if (existingIndex >= 0) {
          // Update existing device
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], ...normalizedDevice };
          return updated;
        }
        // Only add if not exists
        return [...prev, normalizedDevice];
      });
    });

    // Stream frames
    socket.on(DASHBOARD_EVENTS.STREAM_DATA, (data: StreamFrame) => {
      const listener = frameListenersRef.current.get(data.deviceId);
      if (listener) {
        listener(data);
      }
    });

    // Command results
    socket.on('command:result', (result: CommandResult) => {
      commandResultListenersRef.current.forEach(listener => listener(result));
    });

    socket.on('command:error', (error: { deviceId: string; error: string }) => {
      console.error('[Socket] Command error:', error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [autoConnect]);

  // Start streaming for a device
  const startStream = useCallback((deviceId: string, onFrame: (frame: StreamFrame) => void) => {
    if (!socketRef.current) return;

    frameListenersRef.current.set(deviceId, onFrame);
    socketRef.current.emit(DASHBOARD_EVENTS.STREAM_START, { deviceId });
    console.log('[Socket] Started stream for device:', deviceId);
  }, []);

  // Stop streaming for a device
  const stopStream = useCallback((deviceId: string) => {
    if (!socketRef.current) return;

    frameListenersRef.current.delete(deviceId);
    socketRef.current.emit(DASHBOARD_EVENTS.STREAM_STOP, { deviceId });
    console.log('[Socket] Stopped stream for device:', deviceId);
  }, []);

  // Send command to a device
  const sendCommand = useCallback((
    deviceId: string,
    command: string,
    params?: Record<string, number | string>
  ) => {
    if (!socketRef.current) return;

    socketRef.current.emit(DASHBOARD_EVENTS.COMMAND_SEND, { deviceId, command, params });
    console.log('[Socket] Sent command:', command, 'to device:', deviceId);
  }, []);

  // Broadcast command to multiple devices
  const broadcastCommand = useCallback((
    deviceIds: string[],
    command: string,
    params?: Record<string, number | string>
  ) => {
    if (!socketRef.current) return;

    socketRef.current.emit(DASHBOARD_EVENTS.COMMAND_BROADCAST, { deviceIds, command, params });
    console.log('[Socket] Broadcast command:', command, 'to', deviceIds.length, 'devices');
  }, []);

  // Add command result listener
  const onCommandResult = useCallback((listener: (result: CommandResult) => void) => {
    commandResultListenersRef.current.push(listener);
    return () => {
      commandResultListenersRef.current = commandResultListenersRef.current.filter(l => l !== listener);
    };
  }, []);

  return {
    isConnected,
    devices,
    startStream,
    stopStream,
    sendCommand,
    broadcastCommand,
    onCommandResult,
    getSocket: () => socketRef.current
  };
}
