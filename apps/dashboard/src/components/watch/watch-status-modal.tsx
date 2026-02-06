"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Monitor, Smartphone, AlertCircle, RefreshCw } from "lucide-react";

interface WatchStatusData {
  node_count: number;
  viewing_device_count: number;
}

interface WatchStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  sessionTitle?: string;
}

export function WatchStatusModal({
  open,
  onOpenChange,
  sessionId,
  sessionTitle,
}: WatchStatusModalProps) {
  const [data, setData] = useState<WatchStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${sessionId}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Failed");
      const job = result.job || result.data || result;
      setData({
        node_count: job.node_count || 0,
        viewing_device_count: job.stats?.running || 0,
      });
    } catch {
      setError("시청 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (open && sessionId) {
      fetchStatus();
    }
    if (!open) {
      setData(null);
      setError(null);
    }
  }, [open, sessionId, fetchStatus]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>현재 시청 현황</DialogTitle>
          {sessionTitle && (
            <DialogDescription className="truncate">
              {sessionTitle}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-4 space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : error ? (
            <div className="text-center py-6 space-y-3">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchStatus}>
                <RefreshCw className="h-4 w-4 mr-1" />
                다시 시도
              </Button>
            </div>
          ) : data ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border-2 border-foreground bg-card p-4 shadow-[3px_3px_0px_0px] shadow-foreground text-center">
                <Monitor className="h-5 w-5 text-blue-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{data.node_count}</div>
                <div className="text-xs text-muted-foreground">노드 수</div>
              </div>
              <div className="rounded-lg border-2 border-foreground bg-card p-4 shadow-[3px_3px_0px_0px] shadow-foreground text-center">
                <Smartphone className="h-5 w-5 text-green-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{data.viewing_device_count}대</div>
                <div className="text-xs text-muted-foreground">시청중 디바이스</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
