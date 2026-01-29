'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useSocket } from '@/hooks/use-socket';
import type { Device } from '@/lib/supabase';

interface StreamFrame {
  deviceId: string;
  frame: string;
  timestamp: number;
}

interface CommandResult {
  deviceId: string;
  commandId: string;
  success: boolean;
  error?: string;
}

interface SocketContextValue {
  isConnected: boolean;
  devices: Device[];
  startStream: (deviceId: string, onFrame: (frame: StreamFrame) => void) => void;
  stopStream: (deviceId: string) => void;
  sendCommand: (deviceId: string, command: string, params?: Record<string, number | string>) => void;
  broadcastCommand: (deviceIds: string[], command: string, params?: Record<string, number | string>) => void;
  onCommandResult: (listener: (result: CommandResult) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socket = useSocket({ autoConnect: true });

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}
