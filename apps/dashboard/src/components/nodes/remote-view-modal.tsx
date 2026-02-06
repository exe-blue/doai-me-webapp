'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  RefreshCw,
  Home,
  ArrowLeft,
  LayoutGrid,
  MousePointer,
  Loader2,
  Radio,
  Play,
  Pause,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Device } from '@/lib/supabase';
import { toast } from 'sonner';
import { useSocketContext } from '@/contexts/socket-context';

interface BroadcastDevice {
  id: string;
  name: string;
  status: string;
}

interface RemoteViewModalProps {
  device: Device | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommand: (deviceId: string, command: string, params?: Record<string, number | string>) => void | Promise<void>;
  // Broadcast mode props
  broadcastEnabled?: boolean;
  onBroadcastToggle?: (enabled: boolean) => void;
  broadcastDeviceIds?: string[]; // All devices in broadcast group
  broadcastDevices?: BroadcastDevice[]; // Full device info for broadcast targets
  deviceResolution?: { width: number; height: number };
  autoStream?: boolean; // Auto-start streaming when modal opens
}

// Default device resolution (can be unified via wm size command)
const DEFAULT_RESOLUTION = { width: 1080, height: 2340 };

export function RemoteViewModal({
  device,
  open,
  onOpenChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCommand: _onCommand,
  broadcastEnabled = false,
  onBroadcastToggle,
  broadcastDeviceIds = [],
  broadcastDevices = [],
  deviceResolution = DEFAULT_RESOLUTION,
  autoStream = true
}: RemoteViewModalProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);

  // Socket.io integration
  const { isConnected, startStream, stopStream, sendCommand, broadcastCommand } = useSocketContext();

  // Auto-start streaming when modal opens
  useEffect(() => {
    if (open && autoStream && device && isConnected && !isStreaming) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        startStream(device.id, (frameData) => {
          setScreenshot(`data:image/jpeg;base64,${frameData.frame}`);
        });
        setIsStreaming(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, autoStream, device, isConnected, isStreaming, startStream]);

  // Stop streaming when modal closes
  useEffect(() => {
    if (!open && isStreaming && device) {
      stopStream(device.id);
      setIsStreaming(false);
      setScreenshot(null); // Clear screenshot on close
    }
  }, [open, isStreaming, device, stopStream]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (device && isStreaming) {
        stopStream(device.id);
      }
    };
  }, [device, isStreaming, stopStream]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _fetchScreenshot = useCallback(async () => {
    if (!device) return;

    setIsLoading(true);
    try {
      // Request single screenshot via Socket.io command
      sendCommand(device.id, 'screenshot', {});
      toast.info('스크린샷 요청됨');
    } catch (error) {
      console.error('Screenshot request failed:', error);
      toast.error('스크린샷 요청 실패');
    } finally {
      setIsLoading(false);
    }
  }, [device, sendCommand]);

  const startStreaming = useCallback(() => {
    if (!device || !isConnected) {
      toast.error('Socket.io 연결 필요');
      return;
    }

    startStream(device.id, (frameData) => {
      setScreenshot(`data:image/jpeg;base64,${frameData.frame}`);
    });

    setIsStreaming(true);
    toast.success('스트리밍 시작됨');
  }, [device, isConnected, startStream]);

  const stopStreaming = useCallback(() => {
    if (device) {
      stopStream(device.id);
    }
    setIsStreaming(false);
    toast.info('스트리밍 중지됨');
  }, [device, stopStream]);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!device || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * deviceResolution.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * deviceResolution.height);

    setClickPos({ x, y });

    if (broadcastEnabled && broadcastDeviceIds.length > 0) {
      // Broadcast to all devices in the group via Socket.io
      const allDeviceIds = [device.id, ...broadcastDeviceIds.filter(id => id !== device.id)];
      broadcastCommand(allDeviceIds, 'tap', { x, y });
      toast.success(`${allDeviceIds.length}대 기기에 탭 전송됨`);
    } else {
      // Single device tap via Socket.io
      sendCommand(device.id, 'tap', { x, y });
      toast.success('탭 전송됨');
    }
  }, [device, sendCommand, broadcastCommand, broadcastEnabled, broadcastDeviceIds, deviceResolution]);

  const handleSwipe = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (!device) return;

    const centerX = Math.round(deviceResolution.width / 2);
    const centerY = Math.round(deviceResolution.height / 2);
    const swipeDistance = 500;

    let params: { x: number; y: number; x2: number; y2: number; duration?: number };

    switch (direction) {
      case 'up':
        params = { x: centerX, y: centerY + swipeDistance, x2: centerX, y2: centerY - swipeDistance, duration: 300 };
        break;
      case 'down':
        params = { x: centerX, y: centerY - swipeDistance, x2: centerX, y2: centerY + swipeDistance, duration: 300 };
        break;
      case 'left':
        params = { x: centerX + swipeDistance, y: centerY, x2: centerX - swipeDistance, y2: centerY, duration: 300 };
        break;
      case 'right':
        params = { x: centerX - swipeDistance, y: centerY, x2: centerX + swipeDistance, y2: centerY, duration: 300 };
        break;
    }

    if (broadcastEnabled && broadcastDeviceIds.length > 0) {
      const allDeviceIds = [device.id, ...broadcastDeviceIds.filter(id => id !== device.id)];
      broadcastCommand(allDeviceIds, 'swipe', params);
      toast.success(`${allDeviceIds.length}대 기기에 스와이프 전송됨`);
    } else {
      sendCommand(device.id, 'swipe', params);
      toast.success('스와이프 전송됨');
    }
  }, [device, sendCommand, broadcastCommand, broadcastEnabled, broadcastDeviceIds, deviceResolution]);

  const handleKeyCommand = useCallback((keycode: number) => {
    if (!device) return;

    if (broadcastEnabled && broadcastDeviceIds.length > 0) {
      const allDeviceIds = [device.id, ...broadcastDeviceIds.filter(id => id !== device.id)];
      broadcastCommand(allDeviceIds, 'keyevent', { keycode });
      toast.success(`${allDeviceIds.length}대 기기에 키 전송됨`);
    } else {
      sendCommand(device.id, 'keyevent', { keycode });
      toast.success('키 전송됨');
    }
  }, [device, sendCommand, broadcastCommand, broadcastEnabled, broadcastDeviceIds]);

  if (!device) return null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _aspectRatio = deviceResolution.height / deviceResolution.width;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="default" className="bg-blue-600">
              MASTER
            </Badge>
            <span className="font-mono font-bold">{device.pc_id || device.serial_number}</span>
            {isStreaming && (
              <Badge variant="default" className="bg-red-500 animate-pulse">
                <Radio className="h-3 w-3 mr-1" />
                LIVE
              </Badge>
            )}
            {isConnected ? (
              <Badge variant="outline" className="text-green-600 border-green-600">
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600 border-red-600">
                Disconnected
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Serial: {device.serial_number} | Resolution: {deviceResolution.width}x{deviceResolution.height}
          </DialogDescription>
        </DialogHeader>

        {/* Main Layout: Screen + Broadcast Targets */}
        <div className="flex gap-4">
          {/* Left: Screen View */}
          <div className="flex-1">
            {/* Broadcast Control Toggle */}
            {onBroadcastToggle && (
              <div className="flex items-center justify-between p-3 mb-3 bg-card rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <Radio className={cn(
                    "h-4 w-4",
                    broadcastEnabled ? "text-red-500" : "text-muted-foreground"
                  )} />
                  <div>
                    <Label htmlFor="broadcast-toggle" className="font-mono text-sm font-medium text-foreground">
                      BROADCAST MODE
                    </Label>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {broadcastEnabled
                        ? `Syncing to ${broadcastDeviceIds.length} devices`
                        : 'Click to sync with group'}
                    </p>
                  </div>
                </div>
                <Switch
                  id="broadcast-toggle"
                  checked={broadcastEnabled}
                  onCheckedChange={onBroadcastToggle}
                />
              </div>
            )}

            {/* Screenshot Area */}
            <div
              ref={imageRef}
              onClick={handleImageClick}
              className={cn(
                'relative bg-card rounded-lg overflow-hidden cursor-crosshair mx-auto',
                'border border-border',
                broadcastEnabled && 'ring-2 ring-red-500/50'
              )}
              style={{
                width: '100%',
                maxWidth: '320px',
                aspectRatio: `${deviceResolution.width} / ${deviceResolution.height}`
              }}
            >
              {screenshot ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={screenshot}
                  alt="Device screen"
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              ) : isStreaming ? (
                <div className="absolute inset-0 flex items-center justify-center bg-card">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 text-red-500 animate-spin" />
                    <p className="font-mono text-xs text-muted-foreground">Waiting for stream...</p>
                    <p className="font-mono text-[10px] text-muted-foreground mt-1">Connecting to device</p>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-card">
                  <div className="text-center">
                    <MousePointer className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="font-mono text-xs text-muted-foreground">Click START STREAM</p>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/80">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Click indicator */}
              {clickPos && (
                <div
                  className="absolute w-4 h-4 bg-red-500 rounded-full opacity-50 -translate-x-1/2 -translate-y-1/2 animate-ping"
                  style={{
                    left: `${(clickPos.x / deviceResolution.width) * 100}%`,
                    top: `${(clickPos.y / deviceResolution.height) * 100}%`
                  }}
                />
              )}

              {/* Broadcast indicator overlay */}
              {broadcastEnabled && (
                <div className="absolute top-2 right-2">
                  <Badge variant="destructive" className="animate-pulse font-mono text-[10px]">
                    <Radio className="h-3 w-3 mr-1" />
                    SYNC
                  </Badge>
                </div>
              )}
            </div>

            {/* Click coordinates display */}
            {clickPos && (
              <p className="font-mono text-[10px] text-muted-foreground text-center">
                Last tap: ({clickPos.x}, {clickPos.y})
              </p>
            )}

            {/* Streaming Controls */}
            <div className="flex justify-center gap-2">
              {!isStreaming ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={startStreaming}
                  disabled={!isConnected}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 font-mono text-xs"
                >
                  <Play className="h-4 w-4 mr-1" />
                  START STREAM
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopStreaming}
                  className="font-mono text-xs"
                >
                  <Pause className="h-4 w-4 mr-1" />
                  STOP STREAM
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={startStreaming}
                disabled={isLoading || !isConnected}
                className="font-mono text-xs"
              >
                <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
                RE-CONNECT
              </Button>
            </div>

            {/* Control Buttons */}
            <div className="flex justify-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleKeyCommand(4)}
                className="font-mono text-xs"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                BACK
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleKeyCommand(3)}
                className="font-mono text-xs"
              >
                <Home className="h-4 w-4 mr-1" />
                HOME
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleKeyCommand(187)}
                className="font-mono text-xs"
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                RECENT
              </Button>
            </div>

            {/* Swipe Controls */}
            <div className="flex justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleSwipe('up')} className="font-mono text-xs">
                ↑ UP
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleSwipe('down')} className="font-mono text-xs">
                ↓ DOWN
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleSwipe('left')} className="font-mono text-xs">
                ← LEFT
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleSwipe('right')} className="font-mono text-xs">
                → RIGHT
              </Button>
            </div>
          </div>

          {/* Right: Broadcast Targets Panel */}
          {broadcastDevices.length > 0 && (
            <div className="w-48 shrink-0">
              <div className="rounded-md border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/50">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase">
                    BROADCAST TARGETS
                  </span>
                </div>
                <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
                  {broadcastDevices.map((bd) => (
                    <div
                      key={bd.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono",
                        broadcastEnabled ? "bg-red-500/10 border border-red-500/30" : "bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        bd.status === 'busy' ? "bg-yellow-500" :
                        bd.status === 'offline' ? "bg-muted-foreground" : "bg-green-500"
                      )} />
                      <span className={cn(
                        "truncate",
                        broadcastEnabled ? "text-red-400" : "text-muted-foreground"
                      )}>
                        {bd.name}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-border bg-muted/30">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {broadcastEnabled ? `${broadcastDevices.length} synced` : `${broadcastDevices.length} available`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
