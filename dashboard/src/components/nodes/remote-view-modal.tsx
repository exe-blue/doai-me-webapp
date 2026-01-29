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
  Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Device } from '@/lib/supabase';
import { toast } from 'sonner';
import { useSocketContext } from '@/contexts/socket-context';

interface RemoteViewModalProps {
  device: Device | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommand: (deviceId: string, command: string, params?: Record<string, number | string>) => void | Promise<void>;
  // Broadcast mode props
  broadcastEnabled?: boolean;
  onBroadcastToggle?: (enabled: boolean) => void;
  broadcastDeviceIds?: string[]; // All devices in broadcast group
  deviceResolution?: { width: number; height: number };
}

// Default device resolution (can be unified via wm size command)
const DEFAULT_RESOLUTION = { width: 1080, height: 2340 };

export function RemoteViewModal({
  device,
  open,
  onOpenChange,
  onCommand,
  broadcastEnabled = false,
  onBroadcastToggle,
  broadcastDeviceIds = [],
  deviceResolution = DEFAULT_RESOLUTION
}: RemoteViewModalProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);

  // Socket.io integration
  const { isConnected, startStream, stopStream, sendCommand, broadcastCommand } = useSocketContext();

  // Stop streaming when modal closes
  useEffect(() => {
    if (!open && isStreaming && device) {
      stopStream(device.id);
      setIsStreaming(false);
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

  const fetchScreenshot = useCallback(async () => {
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

  const aspectRatio = deviceResolution.height / deviceResolution.width;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>원격 제어</span>
            <Badge variant="outline">{device.serial_number}</Badge>
            {isStreaming && (
              <Badge variant="default" className="bg-red-500 animate-pulse">
                <Radio className="h-3 w-3 mr-1" />
                LIVE
              </Badge>
            )}
            {isConnected ? (
              <Badge variant="outline" className="text-green-600 border-green-600">
                Socket.io 연결됨
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600 border-red-600">
                Socket.io 연결 안됨
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            화면을 클릭하여 기기를 제어합니다. 해상도: {deviceResolution.width}x{deviceResolution.height}
          </DialogDescription>
        </DialogHeader>

        {/* Broadcast Control Toggle */}
        {onBroadcastToggle && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2">
              <Radio className={cn(
                "h-4 w-4",
                broadcastEnabled ? "text-red-500" : "text-muted-foreground"
              )} />
              <div>
                <Label htmlFor="broadcast-toggle" className="font-medium">
                  브로드캐스트 모드
                </Label>
                <p className="text-xs text-muted-foreground">
                  {broadcastEnabled
                    ? `${broadcastDeviceIds.length}대 기기에 동시 전송`
                    : '모든 동일 그룹 기기에 명령 동기화'}
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
            'relative bg-muted rounded-lg overflow-hidden cursor-crosshair mx-auto',
            'border-2 border-dashed',
            broadcastEnabled ? 'border-red-500/50' : 'border-muted-foreground/30',
            isLoading && 'animate-pulse'
          )}
          style={{
            width: '100%',
            maxWidth: '400px',
            aspectRatio: `${deviceResolution.width} / ${deviceResolution.height}`
          }}
        >
          {screenshot ? (
            <img
              src={screenshot}
              alt="Device screen"
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MousePointer className="h-8 w-8 mx-auto mb-2" />
                <p>새로고침을 눌러 화면을 가져오세요</p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <Loader2 className="h-8 w-8 animate-spin" />
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
              <Badge variant="destructive" className="animate-pulse">
                <Radio className="h-3 w-3 mr-1" />
                동기화
              </Badge>
            </div>
          )}
        </div>

        {/* Click coordinates display */}
        {clickPos && (
          <p className="text-xs text-muted-foreground text-center">
            마지막 터치: ({clickPos.x}, {clickPos.y})
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
              className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400"
            >
              <Play className="h-4 w-4 mr-1" />
              실시간 스트리밍
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={stopStreaming}
            >
              <Pause className="h-4 w-4 mr-1" />
              스트리밍 중지
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchScreenshot}
            disabled={isLoading || isStreaming || !isConnected}
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
            새로고침
          </Button>
        </div>

        {/* Control Buttons */}
        <div className="flex justify-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleKeyCommand(4)} // KEYCODE_BACK
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            뒤로
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleKeyCommand(3)} // KEYCODE_HOME
          >
            <Home className="h-4 w-4 mr-1" />
            홈
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleKeyCommand(187)} // KEYCODE_APP_SWITCH
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            최근
          </Button>
        </div>

        {/* Swipe Controls */}
        <div className="flex justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleSwipe('up')}>
            ↑ 위로
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleSwipe('down')}>
            ↓ 아래로
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleSwipe('left')}>
            ← 왼쪽
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleSwipe('right')}>
            → 오른쪽
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
