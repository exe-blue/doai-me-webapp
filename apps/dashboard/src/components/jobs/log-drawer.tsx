'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Pause, Play, Copy, Check, Terminal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSocketContext } from '@/contexts/socket-context';
import { toast } from 'sonner';

interface LogEntry {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
  timestamp: number;
}

interface LogDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly deviceId?: string;
  readonly jobId?: string;
  readonly jobTitle?: string;
}

/**
 * Terminal-style Log Viewer (Drawer)
 * 
 * Features:
 * - Room-based socket connection (join:log_room / leave:log_room)
 * - Auto-scroll toggle
 * - Terminal aesthetic (black bg, green text)
 * - Copy to clipboard
 */
export function LogDrawer({
  open,
  onClose,
  deviceId,
  jobId,
  jobTitle,
}: LogDrawerProps) {
  const { socket, isConnected } = useSocketContext();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0); // 버퍼된 로그 수 (리렌더링 트리거용)
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedLogsRef = useRef<LogEntry[]>([]);
  const isPausedRef = useRef(false); // 소켓 핸들러에서 사용할 ref (의존성 배열 제거용)

  // isPausedRef를 isPaused 상태와 동기화
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Join/Leave log room (isPaused 제거하여 소켓 재연결 방지)
  useEffect(() => {
    if (!open || !socket || !isConnected) return;

    // 로그 룸 참가
    socket.emit('join:log_room', { deviceId, jobId });

    // 로그 수신 핸들러 (isPausedRef 사용으로 의존성 제거)
    const handleLog = (data: {
      deviceId: string;
      level: string;
      message: string;
      timestamp: number;
    }) => {
      const entry: LogEntry = {
        id: `${data.timestamp}-${Math.random().toString(36).slice(2, 9)}`,
        level: (data.level as LogEntry['level']) || 'info',
        message: data.message,
        timestamp: data.timestamp,
      };

      if (isPausedRef.current) {
        // 일시정지 상태면 버퍼에 저장
        pausedLogsRef.current.push(entry);
        setBufferedCount(pausedLogsRef.current.length);
      } else {
        // 최대 500개 유지
        setLogs(prev => [...prev, entry].slice(-500));
      }
    };

    socket.on('device:log', handleLog);

    // Cleanup: 로그 룸 떠나기
    return () => {
      socket.off('device:log', handleLog);
      socket.emit('leave:log_room', { deviceId, jobId });
    };
  }, [open, socket, isConnected, deviceId, jobId]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isPaused]);

  // Resume시 버퍼된 로그 추가
  const handleResume = useCallback(() => {
    if (pausedLogsRef.current.length > 0) {
      setLogs(prev => [...prev, ...pausedLogsRef.current].slice(-500));
      pausedLogsRef.current = [];
      setBufferedCount(0);
    }
    setIsPaused(false);
  }, []);

  // Copy logs to clipboard (에러 핸들링 포함)
  const handleCopy = useCallback(async () => {
    const text = logs
      .map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // 클립보드 API 미지원 또는 권한 거부
      console.error('[LogDrawer] Clipboard write failed:', error);
      toast.error('클립보드 복사 실패: 브라우저가 클립보드 접근을 허용하지 않습니다.');
    }
  }, [logs]);

  // Clear logs
  const handleClear = useCallback(() => {
    setLogs([]);
    pausedLogsRef.current = [];
    setBufferedCount(0);
  }, []);

  // Log level color for label
  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'success':
        return 'text-green-400';
      case 'debug':
        return 'text-zinc-500';
      default:
        return 'text-green-400';
    }
  };

  // Log message color (slightly lighter than level)
  const getMessageColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-300';
      case 'warn':
        return 'text-yellow-300';
      default:
        return 'text-green-400';
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close drawer"
        className="fixed inset-0 bg-black/50 z-40 transition-opacity border-0 cursor-default"
        onClick={onClose}
      />

      {/* Drawer - Right side */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-lg z-50',
          'bg-black border-l border-zinc-800',
          'transform transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <Terminal className="h-5 w-5 text-green-500" />
            <div>
              <h2 className="font-mono text-sm font-bold text-white">
                Console Logs
              </h2>
              <p className="font-mono text-[10px] text-zinc-500">
                {jobTitle || deviceId || 'Real-time Logs'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Pause/Resume */}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-zinc-800"
              onClick={() => isPaused ? handleResume() : setIsPaused(true)}
              title={isPaused ? '재개' : '일시정지'}
            >
              {isPaused ? (
                <Play className="h-4 w-4 text-green-500" />
              ) : (
                <Pause className="h-4 w-4 text-yellow-500" />
              )}
            </Button>

            {/* Copy */}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-zinc-800"
              onClick={handleCopy}
              title="복사"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-zinc-400" />
              )}
            </Button>

            {/* Clear */}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-zinc-800"
              onClick={handleClear}
              title="지우기"
            >
              <Trash2 className="h-4 w-4 text-zinc-400" />
            </Button>

            {/* Close */}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-zinc-800"
              onClick={onClose}
            >
              <X className="h-4 w-4 text-zinc-400" />
            </Button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/30">
          <div className="flex items-center gap-2">
            <div className={cn(
              'h-2 w-2 rounded-full',
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            )} />
            <span className="font-mono text-[10px] text-zinc-500">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isPaused && (
              <span className="font-mono text-[10px] text-yellow-400 animate-pulse">
                ⏸ PAUSED ({bufferedCount} buffered)
              </span>
            )}
            <span className="font-mono text-[10px] text-zinc-500">
              {logs.length} lines
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="sr-only"
              />
              <span className={cn(
                'font-mono text-[10px] transition-colors',
                autoScroll ? 'text-green-400' : 'text-zinc-500'
              )}>
                Auto-scroll {autoScroll ? 'ON' : 'OFF'}
              </span>
            </label>
          </div>
        </div>

        {/* Log Content - Terminal Style */}
        <div
          ref={scrollRef}
          className="h-[calc(100vh-8rem)] overflow-y-auto p-4 font-mono text-xs"
          style={{
            backgroundColor: '#0a0a0a',
            scrollBehavior: autoScroll ? 'smooth' : 'auto',
          }}
        >
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <Terminal className="h-12 w-12 mb-4 opacity-50" />
              <p className="font-mono text-sm">Waiting for logs...</p>
              <p className="font-mono text-[10px] mt-1">
                작업이 시작되면 로그가 표시됩니다
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 hover:bg-zinc-900/50 px-1 -mx-1 rounded">
                  {/* Timestamp */}
                  <span className="text-zinc-600 shrink-0">
                    [{new Date(log.timestamp).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      fractionalSecondDigits: 3,
                    })}]
                  </span>

                  {/* Level */}
                  <span className={cn('shrink-0 uppercase', getLevelColor(log.level))}>
                    [{log.level.padEnd(5)}]
                  </span>

                  {/* Message */}
                  <span className={cn('break-all', getMessageColor(log.level))}>
                    {log.message}
                  </span>
                </div>
              ))}
              
              {/* Cursor blink effect */}
              <div className="flex items-center gap-1 pt-2">
                <span className="text-green-500">{'>'}</span>
                <span className="w-2 h-4 bg-green-500 animate-pulse" />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default LogDrawer;
