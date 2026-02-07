'use client';

import { createContext, useContext, ReactNode } from 'react';
import {
  useSocket,
  type JobProgressMap,
  type ScrcpyThumbnailData,
  type ScrcpySessionState,
  type ScrcpyInputAction,
} from '@/hooks/use-socket';
import { useAuth } from '@/contexts/auth-context';
import type { Device } from '@/lib/supabase';
import type { Socket } from 'socket.io-client';

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
  jobProgressMap: JobProgressMap;
  getSocket: () => Socket | null;
  startStream: (deviceId: string, onFrame: (frame: StreamFrame) => void) => void;
  stopStream: (deviceId: string) => void;
  sendCommand: (deviceId: string, command: string, params?: Record<string, number | string>) => void;
  broadcastCommand: (deviceIds: string[], command: string, params?: Record<string, number | string>) => void;
  onCommandResult: (listener: (result: CommandResult) => void) => () => void;
  startScrcpySession: (deviceId: string, onThumbnail: (data: ScrcpyThumbnailData) => void, onStateChange?: (state: ScrcpySessionState) => void) => void;
  stopScrcpySession: (deviceId: string) => void;
  sendScrcpyInput: (deviceId: string, action: ScrcpyInputAction, params: Record<string, number | string>) => void;
  batchScrcpyInput: (deviceIds: string[], action: ScrcpyInputAction, params: Record<string, number | string>) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const baseSocket = useSocket({ authToken: session?.access_token });
  
  const contextValue: SocketContextValue = {
    ...baseSocket,
  };

  return (
    <SocketContext.Provider value={contextValue}>
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
