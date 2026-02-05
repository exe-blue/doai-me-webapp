"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Pause,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ListChecks,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Smartphone,
  Server,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";

interface QueueItem {
  id: string;
  video_id: string;
  device_id: string | null;
  node_id: string | null;
  status: "pending" | "assigned" | "running" | "completed" | "failed" | "cancelled";
  priority: "high" | "normal" | "low";
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  created_at: string;
  video?: {
    id: string;
    title: string;
    thumbnail_url: string;
    channel_name: string;
    watch_duration_sec: number;
  };
}

interface VideoOption {
  id: string;
  title: string;
  thumbnail_url: string;
  channel_name: string;
  target_views: number;
  completed_views: number;
}

interface NodeInfo {
  id: string;
  name: string;
  status: "online" | "offline";
  device_count: number;
  available_devices: number;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "대기중", color: "bg-gray-500", icon: Clock },
  assigned: { label: "할당됨", color: "bg-blue-500", icon: Smartphone },
  running: { label: "실행중", color: "bg-green-500", icon: Loader2 },
  completed: { label: "완료", color: "bg-emerald-500", icon: CheckCircle2 },
  failed: { label: "실패", color: "bg-red-500", icon: AlertCircle },
  cancelled: { label: "취소됨", color: "bg-gray-400", icon: Trash2 },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: "높음", color: "border-red-500 text-red-500" },
  normal: { label: "보통", color: "border-blue-500 text-blue-500" },
  low: { label: "낮음", color: "border-gray-500 text-gray-500" },
};

// 시간 포맷 함수
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

export default function QueuePage() {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // 새 작업 추가 폼
  const [availableVideos, setAvailableVideos] = useState<VideoOption[]>([]);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [newTask, setNewTask] = useState<{
    video_id: string;
    priority: "high" | "normal" | "low";
    count: number;
    target_node: string;
  }>({
    video_id: "",
    priority: "normal",
    count: 1,
    target_node: "auto",
  });

  // 배치 작업 폼
  const [batchConfig, setBatchConfig] = useState<{
    video_filter: string;
    priority: "high" | "normal" | "low";
    batch_size: number;
    distribute_evenly: boolean;
  }>({
    video_filter: "active",
    priority: "normal",
    batch_size: 100,
    distribute_evenly: true,
  });

  useEffect(() => {
    fetchQueueItems();
    fetchAvailableVideos();
    fetchNodes();

    // 실시간 구독
    const channel = supabase
      .channel("queue_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_executions" },
        () => {
          fetchQueueItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function fetchQueueItems() {
    setLoading(true);
    try {
      let query = supabase
        .from("video_executions")
        .select(`
          *,
          video:videos (
            id, title, thumbnail_url, channel_name, watch_duration_sec
          )
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("대기열 로드 실패:", error);
      } else {
        // Handle Supabase joined data (can be array)
        const items = (data || []).map((item) => ({
          ...item,
          video: Array.isArray(item.video) ? item.video[0] : item.video,
        }));
        setQueueItems(items);
      }
    } catch (err) {
      console.error("대기열 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailableVideos() {
    const { data } = await supabase
      .from("videos")
      .select("id, title, thumbnail_url, channel_name, target_views, completed_views")
      .eq("status", "active")
      .order("priority", { ascending: false })
      .limit(100);

    setAvailableVideos(data || []);
  }

  async function fetchNodes() {
    // 실제로는 백엔드 API나 별도 테이블에서 가져옴
    const { data } = await supabase
      .from("nodes")
      .select("*")
      .order("name");

    if (data && data.length > 0) {
      setNodes(data.map(n => ({
        id: n.id,
        name: n.name || n.id,
        status: n.status === "online" ? "online" : "offline",
        device_count: n.device_count || 0,
        available_devices: n.available_devices || 0,
      })));
    } else {
      // 더미 데이터
      setNodes([
        { id: "node-1", name: "Node 1", status: "online", device_count: 100, available_devices: 85 },
        { id: "node-2", name: "Node 2", status: "online", device_count: 100, available_devices: 92 },
      ]);
    }
  }

  async function addToQueue() {
    if (!newTask.video_id) {
      alert("영상을 선택해주세요");
      return;
    }

    const tasks = Array.from({ length: newTask.count }, () => ({
      video_id: newTask.video_id,
      status: "pending",
      priority: newTask.priority,
      node_id: newTask.target_node === "auto" ? null : newTask.target_node,
      retry_count: 0,
      max_retries: 3,
    }));

    const { error } = await supabase.from("video_executions").insert(tasks);

    if (error) {
      alert("작업 추가에 실패했습니다: " + error.message);
      return;
    }

    setIsAddDialogOpen(false);
    setNewTask({ video_id: "", priority: "normal", count: 1, target_node: "auto" });
    fetchQueueItems();
  }

  async function createBatchTasks() {
    alert("배치 작업 생성 기능은 백엔드 API가 필요합니다");
    setIsBatchDialogOpen(false);
  }

  async function updateTaskStatus(taskId: string, status: QueueItem["status"]) {
    const { error } = await supabase
      .from("video_executions")
      .update({ status })
      .eq("id", taskId);

    if (error) {
      console.error("상태 변경 실패:", error);
    } else {
      fetchQueueItems();
    }
  }

  async function updateTaskPriority(taskId: string, priority: QueueItem["priority"]) {
    const { error } = await supabase
      .from("video_executions")
      .update({ priority })
      .eq("id", taskId);

    if (error) {
      console.error("우선순위 변경 실패:", error);
    } else {
      fetchQueueItems();
    }
  }

  async function retryTask(taskId: string) {
    const { error } = await supabase
      .from("video_executions")
      .update({
        status: "pending",
        error_message: null,
        started_at: null,
        completed_at: null,
      })
      .eq("id", taskId);

    if (error) {
      console.error("재시도 설정 실패:", error);
    } else {
      fetchQueueItems();
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const { error } = await supabase
      .from("video_executions")
      .delete()
      .eq("id", taskId);

    if (error) {
      console.error("삭제 실패:", error);
    } else {
      fetchQueueItems();
    }
  }

  async function bulkAction(action: "cancel" | "retry" | "delete") {
    if (selectedItems.size === 0) {
      alert("선택된 항목이 없습니다");
      return;
    }

    const ids = Array.from(selectedItems);
    let error = null;

    if (action === "cancel") {
      const result = await supabase
        .from("video_executions")
        .update({ status: "cancelled" })
        .in("id", ids)
        .in("status", ["pending", "assigned"]);
      error = result.error;
    } else if (action === "retry") {
      const result = await supabase
        .from("video_executions")
        .update({ status: "pending", error_message: null })
        .in("id", ids);
      error = result.error;
    } else if (action === "delete") {
      const result = await supabase.from("video_executions").delete().in("id", ids);
      error = result.error;
    }

    if (error) {
      console.error(`Bulk ${action} 실패:`, error);
      alert(`작업 실패: ${error.message}`);
      return;
    }

    setSelectedItems(new Set());
    fetchQueueItems();
  }

  function toggleSelectAll() {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  }

  function toggleSelect(id: string) {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  }

  const filteredItems = queueItems.filter(
    (item) =>
      item.video?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.video_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 통계
  const stats = {
    pending: queueItems.filter((i) => i.status === "pending").length,
    running: queueItems.filter((i) => i.status === "running").length,
    completed: queueItems.filter((i) => i.status === "completed").length,
    failed: queueItems.filter((i) => i.status === "failed").length,
  };

  const totalOnlineDevices = nodes
    .filter((n) => n.status === "online")
    .reduce((sum, n) => sum + n.available_devices, 0);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">작업 대기열</h1>
          <p className="text-sm text-zinc-400">
            실행 대기 중인 작업을 관리합니다
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ListChecks className="mr-2 h-4 w-4" />
                배치 생성
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>배치 작업 생성</DialogTitle>
                <DialogDescription>
                  조건에 맞는 영상들의 작업을 일괄 생성합니다
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>영상 필터</Label>
                  <Select
                    value={batchConfig.video_filter}
                    onValueChange={(v) =>
                      setBatchConfig({ ...batchConfig, video_filter: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">모든 활성 영상</SelectItem>
                      <SelectItem value="by_priority">높은 우선순위만</SelectItem>
                      <SelectItem value="incomplete">미완료 영상만</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>작업 우선순위</Label>
                  <Select
                    value={batchConfig.priority}
                    onValueChange={(v: "high" | "normal" | "low") =>
                      setBatchConfig({ ...batchConfig, priority: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">높음</SelectItem>
                      <SelectItem value="normal">보통</SelectItem>
                      <SelectItem value="low">낮음</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>배치 크기: {batchConfig.batch_size}개</Label>
                  <Slider
                    value={[batchConfig.batch_size]}
                    onValueChange={([v]) =>
                      setBatchConfig({ ...batchConfig, batch_size: v })
                    }
                    min={10}
                    max={500}
                    step={10}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="distribute"
                    checked={batchConfig.distribute_evenly}
                    onCheckedChange={(checked) =>
                      setBatchConfig({
                        ...batchConfig,
                        distribute_evenly: checked as boolean,
                      })
                    }
                  />
                  <Label htmlFor="distribute">노드에 균등 분배</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsBatchDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={createBatchTasks}>생성</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                작업 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>새 작업 추가</DialogTitle>
                <DialogDescription>
                  대기열에 새 시청 작업을 추가합니다
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* 영상 선택 */}
                <div className="space-y-2">
                  <Label>영상 선택</Label>
                  <Select
                    value={newTask.video_id}
                    onValueChange={(v) => setNewTask({ ...newTask, video_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="영상을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-[200px]">
                        {availableVideos.map((video) => (
                          <SelectItem key={video.id} value={video.id}>
                            <div className="flex items-center gap-2">
                              <span className="truncate max-w-[300px]">
                                {video.title}
                              </span>
                              <Badge variant="outline" className="ml-auto">
                                {video.completed_views}/{video.target_views}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                </div>

                {/* 우선순위 */}
                <div className="space-y-2">
                  <Label>우선순위</Label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(v: "high" | "normal" | "low") => setNewTask({ ...newTask, priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">높음</SelectItem>
                      <SelectItem value="normal">보통</SelectItem>
                      <SelectItem value="low">낮음</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 작업 수 */}
                <div className="space-y-2">
                  <Label>작업 수: {newTask.count}개</Label>
                  <Slider
                    value={[newTask.count]}
                    onValueChange={([v]) => setNewTask({ ...newTask, count: v })}
                    min={1}
                    max={100}
                    step={1}
                  />
                </div>

                {/* 타겟 노드 */}
                <div className="space-y-2">
                  <Label>타겟 노드</Label>
                  <Select
                    value={newTask.target_node}
                    onValueChange={(v) => setNewTask({ ...newTask, target_node: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">자동 분배</SelectItem>
                      {nodes
                        .filter((n) => n.status === "online")
                        .map((node) => (
                          <SelectItem key={node.id} value={node.id}>
                            {node.name} ({node.available_devices}대 가용)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={addToQueue} disabled={!newTask.video_id}>
                  추가
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-5 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">대기중</div>
          <div className="text-2xl font-bold text-white">{stats.pending}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">실행중</div>
          <div className="text-2xl font-bold text-green-500">{stats.running}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">완료</div>
          <div className="text-2xl font-bold text-emerald-500">{stats.completed}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">실패</div>
          <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">가용 디바이스</div>
          <div className="text-2xl font-bold text-blue-500">{totalOnlineDevices}</div>
        </div>
      </div>

      {/* 필터 & 검색 & 벌크 액션 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="영상 제목, ID 검색..."
            className="pl-10 bg-zinc-900 border-zinc-700"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 bg-zinc-900 border-zinc-700">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="pending">대기중</SelectItem>
            <SelectItem value="assigned">할당됨</SelectItem>
            <SelectItem value="running">실행중</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
            <SelectItem value="failed">실패</SelectItem>
            <SelectItem value="cancelled">취소됨</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchQueueItems}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        {selectedItems.size > 0 && (
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-zinc-700">
            <span className="text-sm text-zinc-400">
              {selectedItems.size}개 선택
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkAction("cancel")}
            >
              취소
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkAction("retry")}
            >
              재시도
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-500"
              onClick={() => bulkAction("delete")}
            >
              삭제
            </Button>
          </div>
        )}
      </div>

      {/* 테이블 */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 w-[40px]">
                <Checkbox
                  checked={
                    filteredItems.length > 0 &&
                    selectedItems.size === filteredItems.length
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-zinc-400 w-[300px]">영상</TableHead>
              <TableHead className="text-zinc-400">노드/디바이스</TableHead>
              <TableHead className="text-zinc-400">우선순위</TableHead>
              <TableHead className="text-zinc-400">상태</TableHead>
              <TableHead className="text-zinc-400">재시도</TableHead>
              <TableHead className="text-zinc-400">생성일</TableHead>
              <TableHead className="text-zinc-400 w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-500" />
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-zinc-500">
                  대기열이 비어 있습니다
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const StatusIcon = statusConfig[item.status]?.icon || Clock;
                return (
                  <TableRow key={item.id} className="border-zinc-800">
                    {/* 체크박스 */}
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </TableCell>

                    {/* 영상 정보 */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            item.video?.thumbnail_url ||
                            `https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`
                          }
                          alt=""
                          className="h-10 w-16 rounded object-cover bg-zinc-800"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate text-sm">
                            {item.video?.title || item.video_id}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {item.video?.channel_name}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* 노드/디바이스 */}
                    <TableCell>
                      {item.node_id || item.device_id ? (
                        <div className="text-sm">
                          {item.node_id && (
                            <div className="flex items-center gap-1 text-zinc-400">
                              <Server className="h-3 w-3" />
                              {item.node_id}
                            </div>
                          )}
                          {item.device_id && (
                            <div className="flex items-center gap-1 text-zinc-500">
                              <Smartphone className="h-3 w-3" />
                              {item.device_id.slice(0, 8)}...
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-500 text-sm">미할당</span>
                      )}
                    </TableCell>

                    {/* 우선순위 */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={priorityConfig[item.priority]?.color || ""}
                      >
                        {priorityConfig[item.priority]?.label || item.priority}
                      </Badge>
                    </TableCell>

                    {/* 상태 */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`${statusConfig[item.status]?.color || "bg-gray-500"} text-white border-0`}
                        >
                          <StatusIcon
                            className={`mr-1 h-3 w-3 ${
                              item.status === "running" ? "animate-spin" : ""
                            }`}
                          />
                          {statusConfig[item.status]?.label || item.status}
                        </Badge>
                      </div>
                      {item.error_message && (
                        <div className="text-xs text-red-500 mt-1 truncate max-w-[150px]">
                          {item.error_message}
                        </div>
                      )}
                    </TableCell>

                    {/* 재시도 */}
                    <TableCell className="text-zinc-400">
                      {item.retry_count || 0}/{item.max_retries || 3}
                    </TableCell>

                    {/* 생성일 */}
                    <TableCell className="text-zinc-400">
                      {formatTimeAgo(item.created_at)}
                    </TableCell>

                    {/* 액션 */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {item.status === "pending" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => updateTaskPriority(item.id, "high")}
                              >
                                <ArrowUp className="mr-2 h-4 w-4" />
                                우선순위 높임
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateTaskPriority(item.id, "low")}
                              >
                                <ArrowDown className="mr-2 h-4 w-4" />
                                우선순위 낮춤
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {(item.status === "pending" || item.status === "assigned") && (
                            <DropdownMenuItem
                              onClick={() => updateTaskStatus(item.id, "cancelled")}
                            >
                              <Pause className="mr-2 h-4 w-4" />
                              취소
                            </DropdownMenuItem>
                          )}
                          {(item.status === "failed" || item.status === "cancelled") && (
                            <DropdownMenuItem onClick={() => retryTask(item.id)}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              재시도
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-500"
                            onClick={() => deleteTask(item.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
