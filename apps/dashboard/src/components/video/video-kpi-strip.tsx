"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Video,
  Play,
  Smartphone,
  Clock,
  Activity,
} from "lucide-react";
import type { Device } from "@/lib/supabase";

interface VideoData {
  id: string;
  status: string;
  completed_views?: number;
  failed_views?: number;
  watch_duration_sec?: number;
  prob_like?: number;
  prob_comment?: number;
  prob_subscribe?: number;
  created_at: string;
}

interface VideoKpiStripProps {
  videos: VideoData[];
  devices: Device[];
  loading?: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VideoKpiStrip({ videos, devices, loading }: VideoKpiStripProps) {
  const kpis = useMemo(() => {
    // 활성 영상
    const queueCount = videos.filter((v) => v.status === "active").length;

    // 진행중 영상 — busy 디바이스가 작업 중인 고유 영상 수
    // (Device에는 current_task_id가 없으므로 busy 디바이스 수로 대체)
    const busyDevices = devices.filter((d) => d.status === "busy");
    const activeVideoCount = busyDevices.length > 0 ? Math.min(busyDevices.length, queueCount) : 0;

    // 진행중 시청 — busy/total 디바이스
    const totalDevicesCount = devices.length;
    const viewingDevicesCount = busyDevices.length;

    // 평균 시청시간 — 최근 100건 기준
    const recent = [...videos]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100);
    const watchTimes = recent
      .map((v) => v.watch_duration_sec || 0)
      .filter((t) => t > 0);
    const avgWatchTime =
      watchTimes.length > 0
        ? watchTimes.reduce((sum, t) => sum + t, 0) / watchTimes.length
        : 0;

    // 최근 액션 수 — 최근 100건의 좋아요+댓글+구독 확률 합산 (완료 기준 추정)
    const recentActions = recent.reduce((sum, v) => {
      const completed = v.completed_views || 0;
      const likeActions = Math.round(completed * ((v.prob_like || 0) / 100));
      const commentActions = Math.round(completed * ((v.prob_comment || 0) / 100));
      const subscribeActions = Math.round(completed * ((v.prob_subscribe || 0) / 100));
      return sum + likeActions + commentActions + subscribeActions;
    }, 0);

    return {
      queueCount,
      activeVideoCount,
      viewingDevicesCount,
      totalDevicesCount,
      avgWatchTime,
      recentActionsCount: recentActions,
      sampleSize: recent.length,
    };
  }, [videos, devices]);

  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "활성 영상",
      sub: "대기열 영상 수",
      value: kpis.queueCount,
      icon: Video,
      color: "text-green-500",
    },
    {
      label: "진행중 영상",
      sub: "시청 중인 영상 수",
      value: kpis.activeVideoCount,
      icon: Play,
      color: "text-blue-500",
    },
    {
      label: "진행중 시청",
      sub: "시청중/전체 스마트폰",
      value: `${kpis.viewingDevicesCount} / ${kpis.totalDevicesCount}`,
      icon: Smartphone,
      color: "text-purple-500",
    },
    {
      label: "평균 시청시간",
      sub: `최근 ${kpis.sampleSize}건 기준`,
      value: kpis.avgWatchTime > 0 ? formatTime(kpis.avgWatchTime) : "-",
      icon: Clock,
      color: "text-cyan-500",
    },
    {
      label: "최근 액션 수",
      sub: `최근 ${kpis.sampleSize}건 댓글+좋아요+구독`,
      value: kpis.recentActionsCount.toLocaleString(),
      icon: Activity,
      color: "text-orange-500",
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-lg border-2 border-foreground bg-card p-4 shadow-[4px_4px_0px_0px] shadow-foreground"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-sm font-bold text-foreground">{card.label}</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
          </div>
        );
      })}
    </div>
  );
}
