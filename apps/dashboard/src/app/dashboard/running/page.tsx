"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  Smartphone,
  Server,
  Clock,
  ThumbsUp,
  MessageSquare,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  Loader2,
  LayoutGrid,
  List,
  Activity,
  Zap,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RunningTask {
  id: string;
  video_id: string;
  device_id: string;
  node_id: string;
  status: "running" | "completing";
  progress: number;
  current_step: string;
  watch_duration_sec: number;
  elapsed_sec: number;
  will_like: boolean;
  will_comment: boolean;
  will_subscribe: boolean;
  started_at: string;
  video?: {
    title: string;
    thumbnail_url: string;
    channel_name: string;
  };
}

interface NodeStatus {
  id: string;
  name: string;
  status: "online" | "offline" | "busy";
  connected_at: string | null;
  total_devices: number;
  active_devices: number;
  idle_devices: number;
  error_devices: number;
  tasks_per_minute: number;
  cpu_usage: number;
  memory_usage: number;
}

interface RealtimeStats {
  total_running: number;
  completed_today: number;
  failed_today: number;
  avg_duration: number;
  tasks_per_minute: number;
  likes_today: number;
  comments_today: number;
  subscribes_today: number;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  type: "start" | "complete" | "fail" | "like" | "comment" | "subscribe";
  message: string;
  device_id?: string;
  video_title?: string;
}

const stepLabels: Record<string, string> = {
  initializing: "초기화 중",
  opening_youtube: "YouTube 실행",
  searching: "검색 중",
  selecting_video: "영상 선택",
  watching: "시청 중",
  liking: "좋아요",
  commenting: "댓글 작성",
  subscribing: "구독",
  completing: "완료 처리",
};

// 시간 포맷 함수
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return date.toLocaleDateString("ko-KR");
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function RunningPage() {
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [stats, setStats] = useState<RealtimeStats>({
    total_running: 0,
    completed_today: 0,
    failed_today: 0,
    avg_duration: 0,
    tasks_per_minute: 0,
    likes_today: 0,
    comments_today: 0,
    subscribes_today: 0,
  });
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [nodeFilter, setNodeFilter] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<RunningTask | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);

  const refreshInterval = useRef<NodeJS.Timeout | null>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);

  // Refs for stable function references
  const nodeFilterRef = useRef(nodeFilter);
  nodeFilterRef.current = nodeFilter;

  useEffect(() => {
    // Initial data fetch
    fetchAllData();

    // Supabase Realtime 연결
    const channel = supabase
      .channel("running_tasks")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_executions",
          filter: "status=eq.running",
        },
        (payload) => {
          handleRealtimeUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Subscribe once on mount

  // Separate effect for auto-refresh interval
  useEffect(() => {
    if (isAutoRefresh) {
      refreshInterval.current = setInterval(fetchAllData, 3000);
    } else if (refreshInterval.current) {
      clearInterval(refreshInterval.current);
      refreshInterval.current = null;
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoRefresh]);

  // Re-fetch when nodeFilter changes
  useEffect(() => {
    fetchRunningTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeFilter]);

  function handleRealtimeUpdate(payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) {
    if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
      if (!payload.new) return;
      const newData = payload.new as unknown as RunningTask;
      setRunningTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === newData.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...newData };
          return updated;
        }
        return [...prev, newData];
      });

      // 활동 로그 추가
      addActivityLog({
        type: payload.eventType === "INSERT" ? "start" : "complete",
        message:
          payload.eventType === "INSERT"
            ? `새 작업 시작: ${newData.device_id || "unknown"}`
            : `작업 업데이트: ${newData.device_id || "unknown"}`,
        device_id: newData.device_id,
      });
    } else if (payload.eventType === "DELETE") {
      if (!payload.old) return;
      const oldData = payload.old as unknown as { id: string };
      setRunningTasks((prev) => prev.filter((t) => t.id !== oldData.id));
    }
  }

  function addActivityLog(log: Omit<ActivityLog, "id" | "timestamp">) {
    setActivityLogs((prev) => [
      {
        id: Math.random().toString(36).slice(2, 11),
        timestamp: new Date().toISOString(),
        ...log,
      },
      ...prev.slice(0, 99),
    ]);
  }

  async function fetchAllData() {
    // Fetch running tasks first to get fresh count
    const runningCount = await fetchRunningTasks();
    // Pass the fresh count to fetchStats
    await Promise.all([fetchNodes(), fetchStats(runningCount)]);
    setLoading(false);
  }

  async function fetchRunningTasks(): Promise<number> {
    try {
      let query = supabase
        .from("video_executions")
        .select(`
          *,
          video:videos (title, thumbnail_url, channel_name)
        `)
        .eq("status", "running")
        .order("started_at", { ascending: false });

      if (nodeFilter !== "all") {
        query = query.eq("node_id", nodeFilter);
      }

      const { data, error } = await query;

      if (!error && data) {
        const tasksWithProgress = data.map((task) => {
          const video = Array.isArray(task.video) ? task.video[0] : task.video;
          return {
            ...task,
            video,
            progress: Math.min(
              100,
              Math.floor(
                ((Date.now() - new Date(task.started_at || Date.now()).getTime()) / 1000 /
                  (task.watch_duration_sec || 60)) *
                  100
              )
            ),
            current_step: getSimulatedStep(task),
            elapsed_sec: Math.floor(
              (Date.now() - new Date(task.started_at || Date.now()).getTime()) / 1000
            ),
          };
        });
        setRunningTasks(tasksWithProgress);
        return tasksWithProgress.length;
      }
      return 0;
    } catch (err) {
      console.error("실행 중 작업 로드 실패:", err);
      return 0;
    }
  }

  function getSimulatedStep(task: { started_at?: string; watch_duration_sec?: number }): string {
    const elapsed = (Date.now() - new Date(task.started_at || Date.now()).getTime()) / 1000;
    const duration = task.watch_duration_sec || 60;
    const progress = elapsed / duration;

    if (progress < 0.05) return "initializing";
    if (progress < 0.1) return "opening_youtube";
    if (progress < 0.15) return "searching";
    if (progress < 0.2) return "selecting_video";
    if (progress < 0.9) return "watching";
    if (progress < 0.93) return "liking";
    if (progress < 0.96) return "commenting";
    if (progress < 0.98) return "subscribing";
    return "completing";
  }

  async function fetchNodes() {
    // 실제로는 별도 테이블이나 API에서 가져옴
    const { data } = await supabase
      .from("nodes")
      .select("*")
      .order("name");

    if (data && data.length > 0) {
      setNodes(data.map(n => ({
        id: n.id,
        name: n.name || n.id,
        status: n.status === "online" ? "online" : n.status === "busy" ? "busy" : "offline",
        connected_at: n.connected_at,
        total_devices: n.total_devices || 100,
        active_devices: n.active_devices || 0,
        idle_devices: n.idle_devices || 0,
        error_devices: n.error_devices || 0,
        tasks_per_minute: n.tasks_per_minute || 0,
        cpu_usage: n.cpu_usage || 0,
        memory_usage: n.memory_usage || 0,
      })));
    } else {
      // 더미 데이터
      setNodes([
        {
          id: "node-1",
          name: "Node 1 (Mini PC)",
          status: "online",
          connected_at: new Date(Date.now() - 3600000).toISOString(),
          total_devices: 100,
          active_devices: 42,
          idle_devices: 53,
          error_devices: 5,
          tasks_per_minute: 8.5,
          cpu_usage: 45,
          memory_usage: 62,
        },
        {
          id: "node-2",
          name: "Node 2 (Mini PC)",
          status: "online",
          connected_at: new Date(Date.now() - 7200000).toISOString(),
          total_devices: 100,
          active_devices: 38,
          idle_devices: 58,
          error_devices: 4,
          tasks_per_minute: 7.2,
          cpu_usage: 38,
          memory_usage: 55,
        },
        {
          id: "node-3",
          name: "Node 3 (Mini PC)",
          status: "busy",
          connected_at: new Date(Date.now() - 1800000).toISOString(),
          total_devices: 100,
          active_devices: 85,
          idle_devices: 12,
          error_devices: 3,
          tasks_per_minute: 12.1,
          cpu_usage: 78,
          memory_usage: 81,
        },
        {
          id: "node-4",
          name: "Node 4 (Mini PC)",
          status: "offline",
          connected_at: null,
          total_devices: 100,
          active_devices: 0,
          idle_devices: 0,
          error_devices: 100,
          tasks_per_minute: 0,
          cpu_usage: 0,
          memory_usage: 0,
        },
        {
          id: "node-5",
          name: "Node 5 (Mini PC)",
          status: "online",
          connected_at: new Date(Date.now() - 5400000).toISOString(),
          total_devices: 100,
          active_devices: 51,
          idle_devices: 45,
          error_devices: 4,
          tasks_per_minute: 9.8,
          cpu_usage: 52,
          memory_usage: 68,
        },
      ]);
    }
  }

  async function fetchStats(currentRunningCount?: number) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: completedData } = await supabase
        .from("video_executions")
        .select("id, watch_duration_sec, liked, commented, subscribed")
        .eq("status", "completed")
        .gte("completed_at", today.toISOString());

      const { data: failedData } = await supabase
        .from("video_executions")
        .select("id")
        .eq("status", "failed")
        .gte("created_at", today.toISOString());

      const completed = completedData || [];
      const failed = failedData || [];

      // Use provided count if available (fresh data), otherwise fall back to state
      const runningCount = currentRunningCount ?? runningTasks.length;

      setStats({
        total_running: runningCount,
        completed_today: completed.length,
        failed_today: failed.length,
        avg_duration:
          completed.length > 0
            ? Math.round(
                completed.reduce((sum, c) => sum + (c.watch_duration_sec || 0), 0) /
                  completed.length
              )
            : 0,
        tasks_per_minute: nodes.reduce((sum, n) => sum + n.tasks_per_minute, 0),
        likes_today: completed.filter((c) => c.liked).length,
        comments_today: completed.filter((c) => c.commented).length,
        subscribes_today: completed.filter((c) => c.subscribed).length,
      });
    } catch (err) {
      console.error("통계 로드 실패:", err);
    }
  }

  async function stopTask(taskId: string) {
    const { error } = await supabase
      .from("video_executions")
      .update({ status: "cancelled" })
      .eq("id", taskId);

    if (error) {
      alert("작업 중지에 실패했습니다");
    } else {
      fetchRunningTasks();
    }
  }

  async function stopAllTasks() {
    if (!confirm("모든 실행 중인 작업을 중지하시겠습니까?")) return;

    const ids = runningTasks.map((t) => t.id);
    const { error } = await supabase
      .from("video_executions")
      .update({ status: "cancelled" })
      .in("id", ids);

    if (error) {
      alert("전체 중지에 실패했습니다");
    } else {
      fetchRunningTasks();
    }
  }

  const nodeStatusColor: Record<string, string> = {
    online: "bg-green-500",
    offline: "bg-gray-500",
    busy: "bg-yellow-500",
  };

  const activityTypeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    start: { icon: Play, color: "text-blue-500" },
    complete: { icon: CheckCircle2, color: "text-green-500" },
    fail: { icon: AlertCircle, color: "text-red-500" },
    like: { icon: ThumbsUp, color: "text-pink-500" },
    comment: { icon: MessageSquare, color: "text-purple-500" },
    subscribe: { icon: UserPlus, color: "text-orange-500" },
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Activity className="h-6 w-6 text-green-500" />
              실시간 모니터링
            </h1>
            <p className="text-sm text-zinc-400">
              현재 실행 중인 작업을 실시간으로 확인합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={isAutoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            >
              {isAutoRefresh ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pause className="mr-2 h-4 w-4" />
              )}
              {isAutoRefresh ? "자동 갱신 중" : "자동 갱신 꺼짐"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchAllData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={stopAllTasks}
              disabled={runningTasks.length === 0}
            >
              <Square className="mr-2 h-4 w-4" />
              전체 중지
            </Button>
          </div>
        </div>

        {/* 실시간 통계 */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">실행 중</p>
                <p className="text-3xl font-bold text-green-500">
                  {stats.total_running}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Play className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">오늘 완료</p>
                <p className="text-3xl font-bold text-white">{stats.completed_today}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-blue-500" />
              </div>
            </div>
            <div className="mt-2 flex gap-4 text-xs">
              <span className="flex items-center gap-1 text-zinc-400">
                <ThumbsUp className="h-3 w-3 text-pink-500" />
                {stats.likes_today}
              </span>
              <span className="flex items-center gap-1 text-zinc-400">
                <MessageSquare className="h-3 w-3 text-purple-500" />
                {stats.comments_today}
              </span>
              <span className="flex items-center gap-1 text-zinc-400">
                <UserPlus className="h-3 w-3 text-orange-500" />
                {stats.subscribes_today}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">처리 속도</p>
                <p className="text-3xl font-bold text-white">
                  {stats.tasks_per_minute.toFixed(1)}
                  <span className="text-sm text-zinc-500">/분</span>
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">오늘 실패</p>
                <p className="text-3xl font-bold text-red-500">
                  {stats.failed_today}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              성공률:{" "}
              {stats.completed_today + stats.failed_today > 0
                ? (
                    (stats.completed_today /
                      (stats.completed_today + stats.failed_today)) *
                    100
                  ).toFixed(1)
                : 100}
              %
            </div>
          </div>
        </div>

        {/* 노드 상태 */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Server className="h-5 w-5" />
            노드 상태
          </h2>
          <div className="grid grid-cols-5 gap-3">
            {nodes.map((node) => (
              <div
                key={node.id}
                className={`p-3 rounded-lg border border-zinc-700 ${
                  node.status === "offline" ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-white">{node.name}</span>
                  <Badge
                    className={`${nodeStatusColor[node.status]} text-white text-xs border-0`}
                  >
                    {node.status === "online"
                      ? "온라인"
                      : node.status === "busy"
                      ? "바쁨"
                      : "오프라인"}
                  </Badge>
                </div>

                {node.status !== "offline" && (
                  <>
                    <div className="grid grid-cols-3 gap-1 text-xs mb-2">
                      <div className="text-center">
                        <div className="font-medium text-green-500">
                          {node.active_devices}
                        </div>
                        <div className="text-zinc-500">활성</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-gray-400">
                          {node.idle_devices}
                        </div>
                        <div className="text-zinc-500">대기</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-red-500">
                          {node.error_devices}
                        </div>
                        <div className="text-zinc-500">오류</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">CPU</span>
                        <span className="text-zinc-400">{node.cpu_usage}%</span>
                      </div>
                      <Progress value={node.cpu_usage} className="h-1" />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 메인 콘텐츠: 실행 중 작업 + 활동 로그 */}
        <div className="grid grid-cols-3 gap-6">
          {/* 실행 중 작업 목록 */}
          <div className="col-span-2">
            <div className="h-[600px] flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/50">
              <div className="p-4 border-b border-zinc-800 flex-none">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    실행 중인 작업 ({runningTasks.length})
                  </h2>
                  <div className="flex items-center gap-2">
                    <Select value={nodeFilter} onValueChange={setNodeFilter}>
                      <SelectTrigger className="w-32 h-8 bg-zinc-800 border-zinc-700">
                        <SelectValue placeholder="노드 필터" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체 노드</SelectItem>
                        {nodes.map((node) => (
                          <SelectItem key={node.id} value={node.id}>
                            {node.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex border border-zinc-700 rounded-md">
                      <Button
                        variant={viewMode === "grid" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setViewMode("grid")}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setViewMode("list")}
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <ScrollArea className="h-full">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                    </div>
                  ) : runningTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                      <Play className="h-12 w-12 mb-2 opacity-20" />
                      <p>실행 중인 작업이 없습니다</p>
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-2 gap-3">
                      {runningTasks.map((task) => (
                        <div
                          key={task.id}
                          className="p-3 border border-zinc-700 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className="flex gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={
                                task.video?.thumbnail_url ||
                                `https://img.youtube.com/vi/${task.video_id}/default.jpg`
                              }
                              alt=""
                              className="h-12 w-20 rounded object-cover flex-none bg-zinc-800"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white truncate">
                                {task.video?.title || task.video_id}
                              </div>
                              <div className="text-xs text-zinc-500 flex items-center gap-2">
                                <Smartphone className="h-3 w-3" />
                                {task.device_id?.slice(0, 12)}...
                              </div>
                            </div>
                          </div>

                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-blue-400">
                                {stepLabels[task.current_step] || task.current_step}
                              </span>
                              <span className="text-zinc-500">
                                {formatDuration(task.elapsed_sec)} /{" "}
                                {formatDuration(task.watch_duration_sec || 60)}
                              </span>
                            </div>
                            <Progress value={task.progress} className="h-2" />
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            {task.will_like && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <ThumbsUp className="h-3 w-3 text-pink-500" />
                                </TooltipTrigger>
                                <TooltipContent>좋아요 예정</TooltipContent>
                              </Tooltip>
                            )}
                            {task.will_comment && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <MessageSquare className="h-3 w-3 text-purple-500" />
                                </TooltipTrigger>
                                <TooltipContent>댓글 예정</TooltipContent>
                              </Tooltip>
                            )}
                            {task.will_subscribe && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <UserPlus className="h-3 w-3 text-orange-500" />
                                </TooltipTrigger>
                                <TooltipContent>구독 예정</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {runningTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-2 border border-zinc-700 rounded-lg hover:bg-zinc-800/50 cursor-pointer"
                          onClick={() => setSelectedTask(task)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              task.video?.thumbnail_url ||
                              `https://img.youtube.com/vi/${task.video_id}/default.jpg`
                            }
                            alt=""
                            className="h-10 w-16 rounded object-cover bg-zinc-800"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {task.video?.title || task.video_id}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {task.device_id?.slice(0, 8)}... • {task.node_id}
                            </div>
                          </div>
                          <div className="flex-none w-32">
                            <Progress value={task.progress} className="h-2" />
                          </div>
                          <div className="text-xs text-blue-400 w-20">
                            {stepLabels[task.current_step] || task.current_step}
                          </div>
                          <div className="text-xs text-zinc-500 w-16">
                            {formatDuration(task.elapsed_sec)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>

          {/* 활동 로그 */}
          <div className="col-span-1">
            <div className="h-[600px] flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/50">
              <div className="p-4 border-b border-zinc-800 flex-none">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  실시간 활동
                </h2>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <ScrollArea className="h-full">
                  <div className="space-y-2">
                    {activityLogs.length === 0 ? (
                      <div className="text-center text-zinc-500 py-8">
                        활동 로그가 없습니다
                      </div>
                    ) : (
                      activityLogs.map((log) => {
                        const config = activityTypeConfig[log.type];
                        const Icon = config?.icon || Clock;
                        return (
                          <div
                            key={log.id}
                            className="flex items-start gap-2 p-2 rounded-lg hover:bg-zinc-800/50"
                          >
                            <Icon className={`h-4 w-4 mt-0.5 ${config?.color || "text-zinc-400"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white">{log.message}</p>
                              <p className="text-xs text-zinc-500">
                                {formatTimeAgo(log.timestamp)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={activityEndRef} />
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>

        {/* 작업 상세 다이얼로그 */}
        <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>작업 상세</DialogTitle>
            </DialogHeader>
            {selectedTask && (
              <div className="space-y-4">
                {/* 영상 정보 */}
                <div className="flex gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      selectedTask.video?.thumbnail_url ||
                      `https://img.youtube.com/vi/${selectedTask.video_id}/mqdefault.jpg`
                    }
                    alt=""
                    className="h-20 w-32 rounded object-cover bg-zinc-800"
                  />
                  <div>
                    <h4 className="font-medium text-white">
                      {selectedTask.video?.title || selectedTask.video_id}
                    </h4>
                    <p className="text-sm text-zinc-400">
                      {selectedTask.video?.channel_name}
                    </p>
                  </div>
                </div>

                {/* 진행 상황 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-400 font-medium">
                      {stepLabels[selectedTask.current_step] ||
                        selectedTask.current_step}
                    </span>
                    <span className="text-white">{selectedTask.progress}%</span>
                  </div>
                  <Progress value={selectedTask.progress} className="h-3" />
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>경과: {formatDuration(selectedTask.elapsed_sec)}</span>
                    <span>
                      목표: {formatDuration(selectedTask.watch_duration_sec || 60)}
                    </span>
                  </div>
                </div>

                {/* 디바이스 정보 */}
                <div className="grid grid-cols-2 gap-4 p-3 bg-zinc-800 rounded-lg">
                  <div>
                    <p className="text-xs text-zinc-500">노드</p>
                    <p className="font-medium text-white">{selectedTask.node_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">디바이스</p>
                    <p className="font-medium text-white">{selectedTask.device_id?.slice(0, 16)}...</p>
                  </div>
                </div>

                {/* 예정 작업 */}
                <div className="flex gap-4">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      selectedTask.will_like
                        ? "bg-pink-500/10 text-pink-500"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    <span className="text-sm">좋아요</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      selectedTask.will_comment
                        ? "bg-purple-500/10 text-purple-500"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-sm">댓글</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      selectedTask.will_subscribe
                        ? "bg-orange-500/10 text-orange-500"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    <UserPlus className="h-4 w-4" />
                    <span className="text-sm">구독</span>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      stopTask(selectedTask.id);
                      setSelectedTask(null);
                    }}
                  >
                    <Square className="mr-2 h-4 w-4" />
                    작업 중지
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
