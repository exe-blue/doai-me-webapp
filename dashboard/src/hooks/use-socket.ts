'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Device } from '@/lib/supabase';

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

export function useSocket(options: SocketHookOptions = {}) {
  const { autoConnect = true } = options;
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);

  // Event listeners
  const frameListenersRef = useRef<Map<string, (frame: StreamFrame) => void>>(new Map());
  const commandResultListenersRef = useRef<((result: CommandResult) => void)[]>([]);

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect) return;

    const socket = io('/dashboard', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
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

    // Initial device list
    socket.on('devices:initial', (initialDevices: Device[]) => {
      console.log('[Socket] Received initial devices:', initialDevices.length);
      setDevices(initialDevices);
    });

    // Device status updates
    socket.on('device:status:update', (device: Device) => {
      setDevices(prev => {
        const exists = prev.find(d => d.id === device.id);
        if (exists) {
          return prev.map(d => d.id === device.id ? { ...d, ...device } : d);
        }
        return [...prev, device];
      });
    });

    // Stream frames
    socket.on('stream:frame', (data: StreamFrame) => {
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
    socketRef.current.emit('stream:start', { deviceId });
    console.log('[Socket] Started stream for device:', deviceId);
  }, []);

  // Stop streaming for a device
  const stopStream = useCallback((deviceId: string) => {
    if (!socketRef.current) return;

    frameListenersRef.current.delete(deviceId);
    socketRef.current.emit('stream:stop', { deviceId });
    console.log('[Socket] Stopped stream for device:', deviceId);
  }, []);

  // Send command to a device
  const sendCommand = useCallback((
    deviceId: string,
    command: string,
    params?: Record<string, number | string>
  ) => {
    if (!socketRef.current) return;

    socketRef.current.emit('command:send', { deviceId, command, params });
    console.log('[Socket] Sent command:', command, 'to device:', deviceId);
  }, []);

  // Broadcast command to multiple devices
  const broadcastCommand = useCallback((
    deviceIds: string[],
    command: string,
    params?: Record<string, number | string>
  ) => {
    if (!socketRef.current) return;

    socketRef.current.emit('command:broadcast', { deviceIds, command, params });
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
    socket: socketRef.current
  };
}
