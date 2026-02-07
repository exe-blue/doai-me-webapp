"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Search,
  RefreshCw,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  Smartphone,
  Wifi,
  WifiOff,
  HardDrive,
  RotateCcw,
  Loader2,
  ChevronDown,
  Eye,
  History,
  Zap,
  AlertCircle,
  BatteryWarning,
  Flame,
  AppWindow,
  X,
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
  ScrollArea,
  Textarea,
} from "@packages/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DeviceIssue {
  id: string;
  device_id: string;
  device_name: string;
  node_id: string;
  issue_type: "app_crash" | "low_battery" | "disconnected" | "overheating" | "storage_full" | "memory_full" | "task_stuck" | "network_error";
  severity: "critical" | "warning" | "info";
  status: "open" | "in_progress" | "resolved" | "ignored";
  title: string;
  description: string;
  error_code: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  auto_retry_count: number;
  metadata: {
    battery_level?: number;
    temperature?: number;
    memory_usage?: number;
    storage_usage?: number;
    task_id?: string;
    app_name?: string;
  };
}

interface IssueLog {
  id: string;
  issue_id: string;
  action: string;
  performed_by: string;
  performed_at: string;
  details: string | null;
}

const issueTypeConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }> = {
  app_crash: {
    label: "앱 크래시",
    icon: AppWindow,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
  low_battery: {
    label: "배터리 부족",
    icon: BatteryWarning,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  disconnected: {
    label: "연결 끊김",
    icon: WifiOff,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
  },
  overheating: {
    label: "과열",
    icon: Flame,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  storage_full: {
    label: "저장소 부족",
    icon: HardDrive,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  memory_full: {
    label: "메모리 부족",
    icon: HardDrive,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  task_stuck: {
    label: "작업 중단",
    icon: AlertCircle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  network_error: {
    label: "네트워크 오류",
    icon: Wifi,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
};

const severityConfig: Record<string, { label: string; color: string }> = {
  critical: { label: "심각", color: "bg-red-500" },
  warning: { label: "경고", color: "bg-yellow-500" },
  info: { label: "정보", color: "bg-blue-500" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: "미해결", color: "bg-red-500" },
  in_progress: { label: "처리중", color: "bg-yellow-500" },
  resolved: { label: "해결됨", color: "bg-green-500" },
  ignored: { label: "무시", color: "bg-gray-500" },
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

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function DeviceIssuesPage() {
  const [issues, setIssues] = useState<DeviceIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [nodeFilter, setNodeFilter] = useState<string>("all");
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<DeviceIssue | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [issueLogs, setIssueLogs] = useState<IssueLog[]>([]);

  useEffect(() => {
    fetchIssues();
  }, []);

  async function fetchIssues() {
    setLoading(true);

    try {
      // API에서 이슈 목록 조회
      const response = await fetch("/api/issues?pageSize=500");
      const result = await response.json();

      if (!result.success || !result.data?.items) {
        console.error("Failed to fetch issues:", result.error);
        setIssues([]);
        setLoading(false);
        return;
      }

      // DB 데이터를 UI 타입으로 매핑
      const issueMessages: Record<string, { title: string; desc: string }> = {
        app_crash: { title: "YouTube 앱 강제 종료", desc: "YouTube 앱이 예기치 않게 종료되었습니다." },
        low_battery: { title: "배터리 잔량 부족", desc: "배터리 잔량이 낮습니다." },
        adb_disconnect: { title: "디바이스 연결 끊김", desc: "ADB 연결이 끊어졌습니다." },
        high_temperature: { title: "디바이스 과열 감지", desc: "온도가 높습니다." },
        memory_full: { title: "메모리 부족", desc: "사용 가능한 메모리가 부족합니다." },
        screen_freeze: { title: "화면 멈춤", desc: "화면이 응답하지 않습니다." },
        network_error: { title: "네트워크 연결 오류", desc: "WiFi 연결이 불안정합니다." },
        unknown: { title: "알 수 없는 오류", desc: "알 수 없는 오류가 발생했습니다." },
      };

      const fetchedIssues: DeviceIssue[] = result.data.items.map((d: Record<string, unknown>) => {
        const issueType = (d.type as string) || "unknown";
        const msgInfo = issueMessages[issueType] || issueMessages.unknown;
        const severity = (d.severity as string) || "medium";
        const severityMap: Record<string, DeviceIssue["severity"]> = {
          critical: "critical",
          high: "critical",
          medium: "warning",
          low: "info",
        };

        return {
          id: d.id as string,
          device_id: d.device_id as string,
          device_name: ((d.devices as Record<string, unknown>)?.name as string) || `Device ${d.device_id}`,
          node_id: ((d.devices as Record<string, unknown>)?.node_id as string) || "unknown",
          issue_type: issueType as DeviceIssue["issue_type"],
          severity: severityMap[severity] || "warning",
          status: (d.status as DeviceIssue["status"]) || "open",
          title: msgInfo.title,
          description: (d.message as string) || msgInfo.desc,
          error_code: null,
          detected_at: (d.created_at as string) || new Date().toISOString(),
          resolved_at: (d.resolved_at as string) || null,
          resolved_by: (d.resolved_by as string) || null,
          resolution_note: null,
          auto_retry_count: (d.recovery_attempts as number) || 0,
          metadata: (d.details as DeviceIssue["metadata"]) || {},
        };
      });

      // 정렬 (심각도 → 시간)
      fetchedIssues.sort((a, b) => {
        const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
      });

      setIssues(fetchedIssues);
    } catch (error) {
      console.error("Error fetching issues:", error);
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchIssueLogs(issueId: string) {
    const logs: IssueLog[] = [
      {
        id: "log-1",
        issue_id: issueId,
        action: "이슈 감지됨",
        performed_by: "system",
        performed_at: new Date(Date.now() - 3600000).toISOString(),
        details: "자동 모니터링에 의해 감지",
      },
      {
        id: "log-2",
        issue_id: issueId,
        action: "자동 재시도 #1",
        performed_by: "system",
        performed_at: new Date(Date.now() - 3000000).toISOString(),
        details: "앱 재시작 시도",
      },
      {
        id: "log-3",
        issue_id: issueId,
        action: "자동 재시도 실패",
        performed_by: "system",
        performed_at: new Date(Date.now() - 2700000).toISOString(),
        details: "동일 오류 재발생",
      },
    ];
    setIssueLogs(logs);
  }

  async function resolveIssue(issueId: string, note: string) {
    try {
      const response = await fetch(`/api/issues/${issueId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution_note: note, resolved_by: "manual" }),
      });
      if (!response.ok) throw new Error("이슈 해결 실패");
      setIssues(
        issues.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                status: "resolved" as const,
                resolved_at: new Date().toISOString(),
                resolved_by: "user",
                resolution_note: note,
              }
            : issue
        )
      );
    } catch (err) {
      console.error("resolveIssue error:", err);
    }
    setIsResolveOpen(false);
    setResolutionNote("");
  }

  async function bulkResolve(issueIds: string[]) {
    try {
      const response = await fetch("/api/issues/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_ids: issueIds, action: "resolve" }),
      });
      if (!response.ok) throw new Error("일괄 해결 실패");
      setIssues(
        issues.map((issue) =>
          issueIds.includes(issue.id)
            ? {
                ...issue,
                status: "resolved" as const,
                resolved_at: new Date().toISOString(),
                resolved_by: "user",
                resolution_note: "일괄 해결 처리",
              }
            : issue
        )
      );
    } catch (err) {
      console.error("bulkResolve error:", err);
    }
    setSelectedIssues([]);
  }

  async function ignoreIssue(issueId: string) {
    try {
      const response = await fetch("/api/issues/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_ids: [issueId], action: "ignore" }),
      });
      if (!response.ok) throw new Error("이슈 무시 실패");
      setIssues(
        issues.map((issue) =>
          issue.id === issueId ? { ...issue, status: "ignored" as const } : issue
        )
      );
    } catch (err) {
      console.error("ignoreIssue error:", err);
    }
  }

  async function retryFix(issue: DeviceIssue) {
    try {
      const response = await fetch("/api/issues/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_ids: [issue.id], action: "retry" }),
      });
      if (!response.ok) throw new Error("재시도 실패");
      setIssues(
        issues.map((i) =>
          i.id === issue.id
            ? { ...i, status: "in_progress" as const, auto_retry_count: i.auto_retry_count + 1 }
            : i
        )
      );
    } catch (err) {
      console.error("retryFix error:", err);
    }
  }

  function openDetail(issue: DeviceIssue) {
    setSelectedIssue(issue);
    fetchIssueLogs(issue.id);
    setIsDetailOpen(true);
  }

  // 필터링
  const filteredIssues = issues.filter((issue) => {
    const matchesSearch =
      issue.device_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || issue.issue_type === typeFilter;
    const matchesSeverity = severityFilter === "all" || issue.severity === severityFilter;
    const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
    const matchesNode = nodeFilter === "all" || issue.node_id === nodeFilter;
    return matchesSearch && matchesType && matchesSeverity && matchesStatus && matchesNode;
  });

  // 통계
  const stats = {
    total: issues.filter((i) => i.status !== "resolved" && i.status !== "ignored").length,
    critical: issues.filter((i) => i.severity === "critical" && i.status === "open").length,
    warning: issues.filter((i) => i.severity === "warning" && i.status === "open").length,
    inProgress: issues.filter((i) => i.status === "in_progress").length,
    resolvedToday: issues.filter(
      (i) =>
        i.status === "resolved" &&
        i.resolved_at &&
        new Date(i.resolved_at).toDateString() === new Date().toDateString()
    ).length,
  };

  // 이슈 유형별 통계
  const typeStats = Object.entries(issueTypeConfig).map(([type, config]) => ({
    type,
    ...config,
    count: issues.filter(
      (i) => i.issue_type === type && i.status !== "resolved" && i.status !== "ignored"
    ).length,
  }));

  const isAllSelected =
    filteredIssues.length > 0 &&
    filteredIssues.filter((i) => i.status === "open").every((i) => selectedIssues.includes(i.id));

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-head text-foreground flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              디바이스 이슈
            </h1>
            <p className="text-sm text-muted-foreground">
              {stats.total}개의 미해결 이슈가 있습니다
            </p>
          </div>
          <Button variant="outline" onClick={fetchIssues}>
            <RefreshCw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-5 gap-4">
          <div className="rounded-lg border border-red-500/30 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">심각</p>
                <p className="text-2xl font-bold text-red-500">{stats.critical}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </div>

          <div className="rounded-lg border border-yellow-500/30 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">경고</p>
                <p className="text-2xl font-bold text-yellow-500">{stats.warning}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
          </div>

          <div className="rounded-lg border border-blue-500/30 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">처리중</p>
                <p className="text-2xl font-bold text-blue-500">{stats.inProgress}</p>
              </div>
              <Loader2 className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">전체 미해결</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>

          <div className="rounded-lg border border-green-500/30 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">오늘 해결</p>
                <p className="text-2xl font-bold text-green-500">{stats.resolvedToday}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </div>
        </div>

        {/* 이슈 유형별 요약 */}
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <h2 className="text-lg font-semibold font-head text-foreground mb-4">유형별 현황</h2>
          <div className="grid grid-cols-8 gap-2">
            {typeStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Tooltip key={stat.type}>
                  <TooltipTrigger asChild>
                    <div
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${stat.bgColor} ${
                        typeFilter === stat.type ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() =>
                        setTypeFilter(typeFilter === stat.type ? "all" : stat.type)
                      }
                    >
                      <Icon className={`h-5 w-5 mx-auto ${stat.color}`} />
                      <div className="text-center mt-1">
                        <div className={`text-lg font-bold ${stat.color}`}>{stat.count}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {stat.label}
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{stat.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* 필터 & 검색 */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="디바이스 또는 이슈 검색..."
              className="pl-10 bg-card border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-28 bg-card border-border">
              <SelectValue placeholder="심각도" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="critical">심각</SelectItem>
              <SelectItem value="warning">경고</SelectItem>
              <SelectItem value="info">정보</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 bg-card border-border">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="open">미해결</SelectItem>
              <SelectItem value="in_progress">처리중</SelectItem>
              <SelectItem value="resolved">해결됨</SelectItem>
              <SelectItem value="ignored">무시</SelectItem>
            </SelectContent>
          </Select>

          <Select value={nodeFilter} onValueChange={setNodeFilter}>
            <SelectTrigger className="w-28 bg-card border-border">
              <SelectValue placeholder="노드" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 노드</SelectItem>
              <SelectItem value="node-1">Node 1</SelectItem>
              <SelectItem value="node-2">Node 2</SelectItem>
              <SelectItem value="node-3">Node 3</SelectItem>
              <SelectItem value="node-4">Node 4</SelectItem>
              <SelectItem value="node-5">Node 5</SelectItem>
            </SelectContent>
          </Select>

          {selectedIssues.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Zap className="mr-2 h-4 w-4" />
                  {selectedIssues.length}개 선택됨
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>벌크 액션</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => bulkResolve(selectedIssues)}>
                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                  일괄 해결
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    selectedIssues.forEach((id) => ignoreIssue(id));
                    setSelectedIssues([]);
                  }}
                >
                  <X className="mr-2 h-4 w-4 text-gray-500" />
                  일괄 무시
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* 이슈 테이블 */}
        <div className="rounded-lg border border-border bg-card/50">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground w-10">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIssues(
                          filteredIssues.filter((i) => i.status === "open").map((i) => i.id)
                        );
                      } else {
                        setSelectedIssues([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="text-muted-foreground">디바이스</TableHead>
                <TableHead className="text-muted-foreground">이슈</TableHead>
                <TableHead className="text-muted-foreground">심각도</TableHead>
                <TableHead className="text-muted-foreground">상태</TableHead>
                <TableHead className="text-muted-foreground">재시도</TableHead>
                <TableHead className="text-muted-foreground">발생 시간</TableHead>
                <TableHead className="text-muted-foreground w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredIssues.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    이슈가 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                filteredIssues.slice(0, 50).map((issue) => {
                  const TypeIcon = issueTypeConfig[issue.issue_type]?.icon || AlertCircle;

                  return (
                    <TableRow
                      key={issue.id}
                      className={`border-border ${issue.status === "resolved" || issue.status === "ignored" ? "opacity-50" : ""}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIssues.includes(issue.id)}
                          disabled={issue.status !== "open"}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedIssues([...selectedIssues, issue.id]);
                            } else {
                              setSelectedIssues(selectedIssues.filter((id) => id !== issue.id));
                            }
                          }}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-foreground">{issue.device_id}</div>
                            <div className="text-xs text-muted-foreground">{issue.node_id}</div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded ${issueTypeConfig[issue.issue_type]?.bgColor || "bg-muted"}`}
                          >
                            <TypeIcon
                              className={`h-4 w-4 ${issueTypeConfig[issue.issue_type]?.color || "text-muted-foreground"}`}
                            />
                          </div>
                          <div>
                            <div className="font-medium text-sm text-foreground">{issue.title}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[250px]">
                              {issue.description}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          className={`${severityConfig[issue.severity]?.color || "bg-gray-500"} text-white border-0`}
                        >
                          {severityConfig[issue.severity]?.label || issue.severity}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge
                          className={`${statusConfig[issue.status]?.color || "bg-gray-500"} text-white border-0`}
                        >
                          {statusConfig[issue.status]?.label || issue.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {issue.auto_retry_count > 0 && (
                          <span className="text-sm">
                            {issue.auto_retry_count}회
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="text-sm text-muted-foreground">
                              {formatTimeAgo(issue.detected_at)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatDateTime(issue.detected_at)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetail(issue)}>
                              <Eye className="mr-2 h-4 w-4" />
                              상세 보기
                            </DropdownMenuItem>
                            {issue.status === "open" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => retryFix(issue)}>
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  자동 복구 시도
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedIssue(issue);
                                    setIsResolveOpen(true);
                                  }}
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                  해결 처리
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => ignoreIssue(issue.id)}>
                                  <X className="mr-2 h-4 w-4 text-gray-500" />
                                  무시
                                </DropdownMenuItem>
                              </>
                            )}
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

        {filteredIssues.length > 50 && (
          <p className="text-center text-sm text-muted-foreground">
            {filteredIssues.length}개 중 50개 표시
          </p>
        )}

        {/* 이슈 상세 다이얼로그 */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedIssue && (
                  <>
                    {(() => {
                      const Icon = issueTypeConfig[selectedIssue.issue_type]?.icon || AlertCircle;
                      return (
                        <Icon
                          className={`h-5 w-5 ${
                            issueTypeConfig[selectedIssue.issue_type]?.color || "text-muted-foreground"
                          }`}
                        />
                      );
                    })()}
                    {selectedIssue.title}
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {selectedIssue?.device_id} ({selectedIssue?.node_id})
              </DialogDescription>
            </DialogHeader>

            {selectedIssue && (
              <Tabs defaultValue="details">
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="details">상세 정보</TabsTrigger>
                  <TabsTrigger value="history">이력</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4 mt-4">
                  {/* 상태 */}
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`${severityConfig[selectedIssue.severity]?.color || "bg-gray-500"} text-white border-0`}
                    >
                      {severityConfig[selectedIssue.severity]?.label || selectedIssue.severity}
                    </Badge>
                    <Badge
                      className={`${statusConfig[selectedIssue.status]?.color || "bg-gray-500"} text-white border-0`}
                    >
                      {statusConfig[selectedIssue.status]?.label || selectedIssue.status}
                    </Badge>
                  </div>

                  {/* 설명 */}
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-foreground">{selectedIssue.description}</p>
                  </div>

                  {/* 메타데이터 */}
                  {Object.keys(selectedIssue.metadata).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium font-head text-foreground">추가 정보</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {selectedIssue.metadata.battery_level !== undefined && (
                          <div className="p-2 bg-muted rounded text-foreground">
                            <span className="text-muted-foreground">배터리:</span>{" "}
                            {selectedIssue.metadata.battery_level}%
                          </div>
                        )}
                        {selectedIssue.metadata.temperature !== undefined && (
                          <div className="p-2 bg-muted rounded text-foreground">
                            <span className="text-muted-foreground">온도:</span>{" "}
                            {selectedIssue.metadata.temperature}°C
                          </div>
                        )}
                        {selectedIssue.metadata.memory_usage !== undefined && (
                          <div className="p-2 bg-muted rounded text-foreground">
                            <span className="text-muted-foreground">메모리:</span>{" "}
                            {selectedIssue.metadata.memory_usage}%
                          </div>
                        )}
                        {selectedIssue.metadata.storage_usage !== undefined && (
                          <div className="p-2 bg-muted rounded text-foreground">
                            <span className="text-muted-foreground">저장소:</span>{" "}
                            {selectedIssue.metadata.storage_usage}%
                          </div>
                        )}
                        {selectedIssue.metadata.task_id && (
                          <div className="p-2 bg-muted rounded col-span-2 text-foreground">
                            <span className="text-muted-foreground">작업 ID:</span>{" "}
                            <code className="text-muted-foreground">{selectedIssue.metadata.task_id}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 에러 코드 */}
                  {selectedIssue.error_code && (
                    <div className="p-3 bg-red-500/10 rounded-lg">
                      <div className="text-xs text-muted-foreground">에러 코드</div>
                      <code className="text-red-500">{selectedIssue.error_code}</code>
                    </div>
                  )}

                  {/* 시간 정보 */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">발생 시간</div>
                      <div className="text-foreground">{formatDateTime(selectedIssue.detected_at)}</div>
                    </div>
                    {selectedIssue.resolved_at && (
                      <div>
                        <div className="text-muted-foreground">해결 시간</div>
                        <div className="text-foreground">
                          {formatDateTime(selectedIssue.resolved_at)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 해결 노트 */}
                  {selectedIssue.resolution_note && (
                    <div className="p-3 bg-green-500/10 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">해결 노트</div>
                      <p className="text-sm text-foreground">{selectedIssue.resolution_note}</p>
                    </div>
                  )}

                  {/* 액션 버튼 */}
                  {selectedIssue.status === "open" && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => retryFix(selectedIssue)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        자동 복구
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => {
                          setIsDetailOpen(false);
                          setIsResolveOpen(true);
                        }}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        해결 처리
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <ScrollArea className="h-[300px]">
                    {issueLogs.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">이력이 없습니다</p>
                    ) : (
                      <div className="space-y-3">
                        {issueLogs.map((log, idx) => (
                          <div key={log.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <History className="h-4 w-4 text-muted-foreground" />
                              </div>
                              {idx < issueLogs.length - 1 && (
                                <div className="flex-1 w-px bg-border my-1" />
                              )}
                            </div>
                            <div className="flex-1 pb-3">
                              <div className="font-medium text-sm text-foreground">{log.action}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(log.performed_at)} • {log.performed_by}
                              </div>
                              {log.details && (
                                <div className="text-sm mt-1 text-muted-foreground">
                                  {log.details}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* 해결 처리 다이얼로그 */}
        <Dialog open={isResolveOpen} onOpenChange={setIsResolveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>이슈 해결 처리</DialogTitle>
              <DialogDescription>
                {selectedIssue?.device_id} - {selectedIssue?.title}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">해결 노트</label>
                <Textarea
                  placeholder="해결 방법이나 메모를 입력하세요..."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={3}
                  className="bg-card border-border"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResolveOpen(false)}>
                취소
              </Button>
              <Button
                onClick={() => selectedIssue && resolveIssue(selectedIssue.id, resolutionNote)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                해결 완료
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
