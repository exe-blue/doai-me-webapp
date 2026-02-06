"use client";

import { useState, useEffect } from "react";
import {
  History,
  Search,
  RefreshCw,
  Download,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Smartphone,
  Eye,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  Square,
  ExternalLink,
  ArrowUpDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface ExecutionHistory {
  id: string;
  video_id: string;
  video_title: string;
  video_thumbnail: string;
  channel_name: string;
  device_id: string;
  device_name: string;
  node_id: string;
  status: "completed" | "failed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  watch_duration_seconds: number | null;
  target_watch_seconds: number;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  metadata: {
    ip_address?: string;
    resolution?: string;
    playback_quality?: string;
    buffering_count?: number;
    ads_skipped?: number;
  };
}

interface DateRange {
  from?: Date;
  to?: Date;
}

interface FilterState {
  status: string;
  node: string;
  dateRange: DateRange | undefined;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }>; textColor: string }> = {
  completed: {
    label: "완료",
    color: "bg-green-500",
    icon: CheckCircle2,
    textColor: "text-green-500",
  },
  failed: {
    label: "실패",
    color: "bg-red-500",
    icon: XCircle,
    textColor: "text-red-500",
  },
  cancelled: {
    label: "취소",
    color: "bg-gray-500",
    icon: Square,
    textColor: "text-gray-500",
  },
};

// 날짜 유틸 함수
function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function formatDate(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  if (format === "MM/dd") {
    return `${month}/${day}`;
  }
  if (format === "MM/dd HH:mm") {
    return `${month}/${day} ${hours}:${minutes}`;
  }
  if (format === "yyyy-MM-dd HH:mm:ss") {
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
  return date.toLocaleDateString("ko-KR");
}

export default function ExecutionHistoryPage() {
  const [executions, setExecutions] = useState<ExecutionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    status: "all",
    node: "all",
    dateRange: {
      from: subDays(new Date(), 7),
      to: new Date(),
    },
  });
  const [sortField, setSortField] = useState<"started_at" | "duration">("started_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionHistory | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const pageSize = 50;

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchExecutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sortField, sortOrder, currentPage, debouncedSearch]);

  async function fetchExecutions() {
    setLoading(true);

    try {
      // 쿼리 파라미터 구성
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy: sortField,
        sortOrder: sortOrder,
      });

      if (filters.status !== "all") params.append("status", filters.status);
      if (filters.node !== "all") params.append("nodeId", filters.node);
      if (filters.dateRange?.from) params.append("dateFrom", filters.dateRange.from.toISOString());
      if (filters.dateRange?.to) params.append("dateTo", filters.dateRange.to.toISOString());
      if (debouncedSearch.trim()) params.append("search", debouncedSearch.trim());

      const response = await fetch(`/api/executions?${params.toString()}`);
      const result = await response.json();

      if (!result.success || !result.data) {
        console.error("Failed to fetch executions:", result.error);
        setExecutions([]);
        setTotalCount(0);
        setTotalPages(0);
        setLoading(false);
        return;
      }

      const { items, total, totalPages: tp } = result.data;
      setTotalCount(total);
      setTotalPages(tp);

      // DB 데이터를 UI 타입으로 매핑
      const fetchedExecutions: ExecutionHistory[] = items.map((d: Record<string, unknown>) => {
        const startedAt = (d.started_at as string) || (d.created_at as string);
        const completedAt = d.completed_at as string | null;
        const duration = startedAt && completedAt
          ? Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
          : null;

        return {
          id: d.id as string,
          video_id: d.video_id as string,
          video_title: ((d.videos as Record<string, unknown>)?.title as string) || `Video ${d.video_id}`,
          video_thumbnail: `https://img.youtube.com/vi/${d.video_id}/default.jpg`,
          channel_name: ((d.videos as Record<string, unknown>)?.channel_name as string) || "Unknown",
          device_id: d.device_id as string,
          device_name: ((d.devices as Record<string, unknown>)?.name as string) || `Device ${d.device_id}`,
          node_id: (d.node_id as string) || "unknown",
          status: (d.status as ExecutionHistory["status"]) || "completed",
          started_at: startedAt || new Date().toISOString(),
          completed_at: completedAt,
          duration_seconds: duration,
          watch_duration_seconds: (d.actual_watch_duration_sec as number) || null,
          target_watch_seconds: (d.target_watch_seconds as number) || 60,
          error_message: (d.error_message as string) || null,
          error_code: (d.error_code as string) || null,
          retry_count: (d.retry_count as number) || 0,
          metadata: {
            ip_address: ((d.metadata as Record<string, unknown>)?.ip_address as string) || undefined,
            resolution: ((d.metadata as Record<string, unknown>)?.resolution as string) || undefined,
            playback_quality: ((d.metadata as Record<string, unknown>)?.playback_quality as string) || undefined,
            buffering_count: ((d.metadata as Record<string, unknown>)?.buffering_count as number) || undefined,
            ads_skipped: ((d.metadata as Record<string, unknown>)?.ads_skipped as number) || undefined,
          },
        };
      });

      // Note: searchQuery is sent to the backend (line 197), so we don't filter client-side
      // to avoid inconsistent pagination. If backend doesn't support search, implement
      // client-side search with proper re-pagination of filtered results.

      setExecutions(fetchedExecutions);
    } catch (error) {
      console.error("Error fetching executions:", error);
      setExecutions([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }

  function formatDuration(seconds: number | null): string {
    if (seconds === null) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function openDetail(execution: ExecutionHistory) {
    setSelectedExecution(execution);
    setIsDetailOpen(true);
  }

  async function exportHistory() {
    alert("실행 이력 다운로드를 시작합니다");
  }

  function toggleSort(field: "started_at" | "duration") {
    if (sortField === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  function clearFilters() {
    setFilters({
      status: "all",
      node: "all",
      dateRange: {
        from: subDays(new Date(), 7),
        to: new Date(),
      },
    });
    setSearchQuery("");
  }

  const activeFilterCount =
    (filters.status !== "all" ? 1 : 0) +
    (filters.node !== "all" ? 1 : 0) +
    (searchQuery ? 1 : 0);

  // 통계 - computed from current page data
  // TODO: Get accurate counts from API response for full dataset stats
  const stats = {
    total: totalCount,
    completed: executions.filter(e => e.status === "completed").length,
    failed: executions.filter(e => e.status === "failed").length,
    cancelled: executions.filter(e => e.status === "cancelled").length,
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <History className="h-6 w-6" />
              실행 이력
            </h1>
            <p className="text-sm text-muted-foreground">
              전체 작업 실행 기록을 조회합니다
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => fetchExecutions()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
            <Button variant="outline" onClick={exportHistory}>
              <Download className="mr-2 h-4 w-4" />
              내보내기
            </Button>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">전체</p>
                <p className="text-2xl font-bold text-foreground">{stats.total.toLocaleString()}</p>
              </div>
              <Play className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>

          <div className="rounded-lg border border-green-500/30 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">완료</p>
                <p className="text-2xl font-bold text-green-500">
                  {stats.completed.toLocaleString()}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="rounded-lg border border-red-500/30 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">실패</p>
                <p className="text-2xl font-bold text-red-500">
                  {stats.failed.toLocaleString()}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">취소</p>
                <p className="text-2xl font-bold text-gray-500">
                  {stats.cancelled.toLocaleString()}
                </p>
              </div>
              <Square className="h-8 w-8 text-gray-500" />
            </div>
          </div>
        </div>

        {/* 필터 & 검색 */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="영상 제목, 디바이스 ID 검색..."
              className="pl-10 bg-card border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* 날짜 범위 선택 */}
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[120px] justify-start">
                  <Calendar className="mr-2 h-4 w-4" />
                  {filters.dateRange?.from
                    ? formatDate(filters.dateRange.from, "MM/dd")
                    : "시작일"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  selected={filters.dateRange?.from}
                  onSelect={(date) =>
                    setFilters({
                      ...filters,
                      dateRange: { ...filters.dateRange, from: date },
                    })
                  }
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">~</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[120px] justify-start">
                  <Calendar className="mr-2 h-4 w-4" />
                  {filters.dateRange?.to
                    ? formatDate(filters.dateRange.to, "MM/dd")
                    : "종료일"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  selected={filters.dateRange?.to}
                  onSelect={(date) =>
                    setFilters({
                      ...filters,
                      dateRange: { ...filters.dateRange, to: date },
                    })
                  }
                />
              </PopoverContent>
            </Popover>
          </div>

          <Select
            value={filters.status}
            onValueChange={(v) => setFilters({ ...filters, status: v })}
          >
            <SelectTrigger className="w-28 bg-card border-border">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
              <SelectItem value="failed">실패</SelectItem>
              <SelectItem value="cancelled">취소</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.node}
            onValueChange={(v) => setFilters({ ...filters, node: v })}
          >
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

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" />
              초기화
            </Button>
          )}
        </div>

        {/* 테이블 */}
        <div className="rounded-lg border border-border bg-card/50">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">영상</TableHead>
                <TableHead className="text-muted-foreground">디바이스</TableHead>
                <TableHead className="text-muted-foreground">노드</TableHead>
                <TableHead className="text-muted-foreground">상태</TableHead>
                <TableHead
                  className="text-muted-foreground cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleSort("started_at")}
                >
                  <div className="flex items-center gap-1">
                    시작 시간
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-muted-foreground cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleSort("duration")}
                >
                  <div className="flex items-center gap-1">
                    소요 시간
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">시청 시간</TableHead>
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
              ) : executions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    실행 이력이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                executions.map((exec) => {
                  const StatusIcon = statusConfig[exec.status]?.icon || CheckCircle2;

                  return (
                    <TableRow key={exec.id} className="border-border">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-9 bg-muted rounded overflow-hidden flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={exec.video_thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-foreground truncate max-w-[200px]">
                              {exec.video_title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {exec.channel_name}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">{exec.device_id}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="border-border text-muted-foreground">{exec.node_id}</Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusIcon
                            className={`h-4 w-4 ${statusConfig[exec.status]?.textColor || "text-gray-500"}`}
                          />
                          <Badge
                            className={`${statusConfig[exec.status]?.color || "bg-gray-500"} text-white border-0`}
                          >
                            {statusConfig[exec.status]?.label || exec.status}
                          </Badge>
                        </div>
                        {exec.error_message && (
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="text-xs text-red-500 mt-1 truncate max-w-[120px]">
                                {exec.error_message}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div>
                                <div>{exec.error_message}</div>
                                {exec.error_code && (
                                  <div className="text-xs opacity-70">
                                    코드: {exec.error_code}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>

                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="text-sm text-muted-foreground">
                              {formatDate(new Date(exec.started_at), "MM/dd HH:mm")}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatDate(new Date(exec.started_at), "yyyy-MM-dd HH:mm:ss")}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>

                      <TableCell>
                        <span className="text-sm font-mono text-foreground">
                          {formatDuration(exec.duration_seconds)}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="text-sm">
                          <span className="font-mono text-foreground">
                            {formatDuration(exec.watch_duration_seconds)}
                          </span>
                          <span className="text-muted-foreground text-xs ml-1">
                            / {formatDuration(exec.target_watch_seconds)}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetail(exec)}>
                              <Eye className="mr-2 h-4 w-4" />
                              상세 보기
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              영상 페이지
                            </DropdownMenuItem>
                            {exec.status === "failed" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  재실행
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

        {/* 페이지네이션 */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            총 {totalCount.toLocaleString()}건 중 {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, totalCount)}건
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    className="w-8"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 상세 다이얼로그 */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>실행 상세</DialogTitle>
              <DialogDescription>{selectedExecution?.id}</DialogDescription>
            </DialogHeader>

            {selectedExecution && (
              <div className="space-y-4">
                {/* 상태 */}
                <div className="flex items-center gap-2">
                  {(() => {
                    const StatusIcon = statusConfig[selectedExecution.status]?.icon || CheckCircle2;
                    return (
                      <>
                        <StatusIcon
                          className={`h-5 w-5 ${
                            statusConfig[selectedExecution.status]?.textColor || "text-gray-500"
                          }`}
                        />
                        <Badge
                          className={`${statusConfig[selectedExecution.status]?.color || "bg-gray-500"} text-white border-0`}
                        >
                          {statusConfig[selectedExecution.status]?.label || selectedExecution.status}
                        </Badge>
                      </>
                    );
                  })()}
                  {selectedExecution.retry_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      (재시도 {selectedExecution.retry_count}회)
                    </span>
                  )}
                </div>

                {/* 에러 정보 */}
                {selectedExecution.error_message && (
                  <div className="p-3 bg-red-500/10 rounded-lg">
                    <div className="text-sm font-medium text-red-500">
                      {selectedExecution.error_message}
                    </div>
                    {selectedExecution.error_code && (
                      <code className="text-xs text-red-400">
                        {selectedExecution.error_code}
                      </code>
                    )}
                  </div>
                )}

                {/* 영상 정보 */}
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-12 bg-muted rounded overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedExecution.video_thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="font-medium text-sm text-foreground">
                        {selectedExecution.video_title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {selectedExecution.channel_name}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 디바이스 정보 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">디바이스</div>
                    <div className="font-medium text-foreground">{selectedExecution.device_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedExecution.device_name}
                    </div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">노드</div>
                    <div className="font-medium text-foreground">{selectedExecution.node_id}</div>
                    <div className="text-xs text-muted-foreground">
                      IP: {selectedExecution.metadata?.ip_address ?? '—'}
                    </div>
                  </div>
                </div>

                {/* 시간 정보 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold text-foreground">
                      {formatDuration(selectedExecution.duration_seconds)}
                    </div>
                    <div className="text-xs text-muted-foreground">소요 시간</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold text-foreground">
                      {formatDuration(selectedExecution.watch_duration_seconds)}
                    </div>
                    <div className="text-xs text-muted-foreground">시청 시간</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold text-foreground">
                      {formatDuration(selectedExecution.target_watch_seconds)}
                    </div>
                    <div className="text-xs text-muted-foreground">목표 시간</div>
                  </div>
                </div>

                {/* 메타데이터 */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">실행 정보</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between p-2 bg-muted rounded">
                      <span className="text-muted-foreground">해상도</span>
                      <span className="text-foreground">{selectedExecution.metadata?.resolution ?? '—'}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted rounded">
                      <span className="text-muted-foreground">화질</span>
                      <span className="text-foreground">{selectedExecution.metadata?.playback_quality ?? '—'}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted rounded">
                      <span className="text-muted-foreground">버퍼링</span>
                      <span className="text-foreground">
                        {selectedExecution.metadata?.buffering_count != null
                          ? `${selectedExecution.metadata.buffering_count}회`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted rounded">
                      <span className="text-muted-foreground">광고 스킵</span>
                      <span className="text-foreground">
                        {selectedExecution.metadata?.ads_skipped != null
                          ? `${selectedExecution.metadata.ads_skipped}회`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 타임스탬프 */}
                <Separator className="bg-border" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">시작</div>
                    <div className="text-foreground">
                      {formatDate(new Date(selectedExecution.started_at), "yyyy-MM-dd HH:mm:ss")}
                    </div>
                  </div>
                  {selectedExecution.completed_at && (
                    <div>
                      <div className="text-muted-foreground">종료</div>
                      <div className="text-foreground">
                        {formatDate(
                          new Date(selectedExecution.completed_at),
                          "yyyy-MM-dd HH:mm:ss"
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 액션 버튼 */}
                {selectedExecution.status === "failed" && (
                  <Button className="w-full">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    재실행
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
