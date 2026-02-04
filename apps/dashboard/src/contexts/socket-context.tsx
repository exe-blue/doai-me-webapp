'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useSocket } from '@/hooks/use-socket';
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
  socket: Socket | null;
  startStream: (deviceId: string, onFrame: (frame: StreamFrame) => void) => void;
  stopStream: (deviceId: string) => void;
  sendCommand: (deviceId: string, command: string, params?: Record<string, number | string>) => void;
  broadcastCommand: (deviceIds: string[], command: string, params?: Record<string, number | string>) => void;
  onCommandResult: (listener: (result: CommandResult) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  // TODO: 이 context는 SocketProvider.tsx와 통합 리팩토링 필요
  // 현재는 기존 코드 호환성을 위해 빈 구현 제공
  const baseSocket = useSocket();
  
  const contextValue: SocketContextValue = {
    ...baseSocket,
    devices: [],
    startStream: () => {},
    stopStream: () => {},
    sendCommand: () => {},
    broadcastCommand: () => {},
    onCommandResult: () => () => {},
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
