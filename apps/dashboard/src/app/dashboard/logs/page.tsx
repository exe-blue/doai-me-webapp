"use client";

import { useState, useEffect, useRef } from "react";
import {
  ScrollText,
  Search,
  RefreshCw,
  Download,
  Pause,
  Play,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  Server,
  Smartphone,
  Database,
  Wifi,
  Clock,
  ChevronDown,
  ChevronRight,
  X,
  Copy,
  Check,
  Terminal,
  Loader2,
  Calendar,
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SystemLog {
  id: string;
  timestamp: string;
  level: "error" | "warn" | "info" | "debug";
  source: string;
  component: string;
  message: string;
  details?: Record<string, unknown>;
  stack_trace?: string;
  node_id?: string;
  device_id?: string;
  request_id?: string;
}

type LogLevel = "error" | "warn" | "info" | "debug";

interface LevelConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}

const levelConfig: Record<LogLevel, LevelConfig> = {
  error: {
    label: "ERROR",
    icon: AlertTriangle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
  warn: {
    label: "WARN",
    icon: AlertCircle,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
  },
  info: {
    label: "INFO",
    icon: Info,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  debug: {
    label: "DEBUG",
    icon: Bug,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
  },
};

const sourceConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  api: { label: "API Server", icon: Server },
  worker: { label: "Worker", icon: Terminal },
  device: { label: "Device Agent", icon: Smartphone },
  database: { label: "Database", icon: Database },
  network: { label: "Network", icon: Wifi },
  scheduler: { label: "Scheduler", icon: Clock },
};

// 날짜 포맷 유틸
function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export default function SystemLogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [nodeFilter, setNodeFilter] = useState("all");
  const [timeRange, setTimeRange] = useState("1h");
  const [isLive, setIsLive] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchLogs();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [levelFilter, sourceFilter, nodeFilter, timeRange]);

  useEffect(() => {
    if (isLive) {
      intervalRef.current = setInterval(() => {
        fetchLogs(true);
      }, 2000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isLive]);

  async function fetchLogs(append = false) {
    if (!append) setLoading(true);

    try {
      const now = Date.now();
      const timeRangeMs: Record<string, number> = {
        "1h": 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
      };
      const rangeMs = timeRangeMs[timeRange] || 60 * 60 * 1000;
      const dateFrom = new Date(now - rangeMs).toISOString();

      // 쿼리 파라미터 구성
      const params = new URLSearchParams({
        pageSize: append ? "10" : "200",
        sortOrder: "desc",
        dateFrom: dateFrom,
      });

      if (levelFilter !== "all") params.append("level", levelFilter);
      if (sourceFilter !== "all") params.append("source", sourceFilter);
      if (nodeFilter !== "all") params.append("nodeId", nodeFilter);
      if (searchQuery) params.append("search", searchQuery);

      const response = await fetch(`/api/logs?${params.toString()}`);
      const result = await response.json();

      if (!result.success || !result.data) {
        console.error("Failed to fetch logs:", result.error);
        if (!append) setLogs([]);
        setLoading(false);
        return;
      }

      const items = result.data.items || [];

      // DB 데이터를 UI 타입으로 매핑
      const fetchedLogs: SystemLog[] = items.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        timestamp: (d.timestamp as string) || new Date().toISOString(),
        level: (d.level as LogLevel) || "info",
        source: (d.source as string) || "api",
        component: (d.component as string) || "unknown",
        message: (d.message as string) || "",
        node_id: (d.node_id as string) || undefined,
        device_id: (d.device_id as string) || undefined,
        request_id: (d.request_id as string) || undefined,
        details: (d.details as Record<string, unknown>) || undefined,
        stack_trace: (d.stack_trace as string) || undefined,
      }));

      // 정렬 (최신순)
      fetchedLogs.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      if (append) {
        // 라이브 모드: 새 로그를 앞에 추가
        setLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const newLogs = fetchedLogs.filter((l) => !existingIds.has(l.id));
          return [...newLogs, ...prev].slice(0, 500);
        });
      } else {
        setLogs(fetchedLogs);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
      if (!append) setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(logId: string) {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    alert("클립보드에 복사되었습니다");
  }

  async function exportLogs() {
    alert("로그 다운로드를 시작합니다");
  }

  function clearLogs() {
    setLogs([]);
    alert("로그가 초기화되었습니다");
  }

  // 필터링
  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== "all" && log.level !== levelFilter) return false;
    if (sourceFilter !== "all" && log.source !== sourceFilter) return false;
    if (nodeFilter !== "all" && log.node_id !== nodeFilter) return false;
    if (
      searchQuery &&
      !log.message.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !log.component.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  // 통계
  const stats = {
    error: logs.filter((l) => l.level === "error").length,
    warn: logs.filter((l) => l.level === "warn").length,
    info: logs.filter((l) => l.level === "info").length,
    debug: logs.filter((l) => l.level === "debug").length,
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ScrollText className="h-6 w-6" />
              시스템 로그
            </h1>
            <p className="text-sm text-zinc-400">
              시스템 전체 로그를 실시간으로 모니터링합니다
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* 실시간 토글 */}
            <div className="flex items-center gap-2 px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-900">
              {isLive ? (
                <Pause className="h-4 w-4 text-green-500" />
              ) : (
                <Play className="h-4 w-4 text-zinc-400" />
              )}
              <Label htmlFor="live-mode" className="text-sm cursor-pointer text-zinc-300">
                실시간
              </Label>
              <Switch
                id="live-mode"
                checked={isLive}
                onCheckedChange={setIsLive}
              />
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </div>

            <Button variant="outline" onClick={() => fetchLogs()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
            <Button variant="outline" onClick={exportLogs}>
              <Download className="mr-2 h-4 w-4" />
              내보내기
            </Button>
            <Button variant="outline" onClick={clearLogs}>
              <Trash2 className="mr-2 h-4 w-4" />
              초기화
            </Button>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-4 gap-4">
          {(["error", "warn", "info", "debug"] as const).map((level) => {
            const config = levelConfig[level];
            const Icon = config.icon;
            return (
              <div
                key={level}
                className={`cursor-pointer transition-all rounded-lg border p-4 bg-zinc-900/50 ${
                  levelFilter === level ? config.borderColor + " border-2" : "border-zinc-800"
                }`}
                onClick={() =>
                  setLevelFilter(levelFilter === level ? "all" : level)
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-400">
                      {config.label}
                    </p>
                    <p className={`text-2xl font-bold ${config.color}`}>
                      {stats[level].toLocaleString()}
                    </p>
                  </div>
                  <Icon className={`h-8 w-8 ${config.color}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* 필터 */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="메시지, 컴포넌트 검색..."
              className="pl-10 bg-zinc-900 border-zinc-700"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32 bg-zinc-900 border-zinc-700">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">최근 1시간</SelectItem>
              <SelectItem value="6h">최근 6시간</SelectItem>
              <SelectItem value="24h">최근 24시간</SelectItem>
              <SelectItem value="7d">최근 7일</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-36 bg-zinc-900 border-zinc-700">
              <SelectValue placeholder="소스" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 소스</SelectItem>
              {Object.entries(sourceConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={nodeFilter} onValueChange={setNodeFilter}>
            <SelectTrigger className="w-28 bg-zinc-900 border-zinc-700">
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

          {(levelFilter !== "all" ||
            sourceFilter !== "all" ||
            nodeFilter !== "all" ||
            searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLevelFilter("all");
                setSourceFilter("all");
                setNodeFilter("all");
                setSearchQuery("");
              }}
            >
              <X className="mr-1 h-4 w-4" />
              초기화
            </Button>
          )}

          <div className="text-sm text-zinc-500">
            {filteredLogs.length.toLocaleString()}건
          </div>
        </div>

        {/* 로그 목록 */}
        <div className="border border-zinc-800 rounded-lg bg-black">
          <ScrollArea className="h-[600px]" ref={scrollRef}>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-20 text-zinc-500">
                로그가 없습니다
              </div>
            ) : (
              <div className="font-mono text-sm">
                {filteredLogs.map((log) => {
                  const config = levelConfig[log.level];
                  const isExpanded = expandedLogs.has(log.id);
                  const hasDetails = log.details || log.stack_trace;

                  return (
                    <Collapsible
                      key={log.id}
                      open={isExpanded}
                      onOpenChange={() => hasDetails && toggleExpand(log.id)}
                    >
                      <div
                        className={`group border-b border-zinc-800 hover:bg-zinc-900/50 ${
                          log.level === "error" ? "bg-red-950/20" : ""
                        }`}
                      >
                        <CollapsibleTrigger asChild>
                          <div className="flex items-start gap-2 px-4 py-2 cursor-pointer">
                            {/* 확장 아이콘 */}
                            <div className="w-4 mt-0.5">
                              {hasDetails &&
                                (isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-zinc-500" />
                                ))}
                            </div>

                            {/* 타임스탬프 */}
                            <span className="text-zinc-500 whitespace-nowrap">
                              {formatTime(new Date(log.timestamp))}
                            </span>

                            {/* 레벨 */}
                            <span
                              className={`w-14 font-bold ${config.color}`}
                            >
                              {config.label}
                            </span>

                            {/* 소스/컴포넌트 */}
                            <span className="text-purple-400 whitespace-nowrap">
                              [{log.source}/{log.component}]
                            </span>

                            {/* 노드/디바이스 */}
                            {log.node_id && (
                              <Badge
                                variant="outline"
                                className="text-xs text-cyan-400 border-cyan-400/30"
                              >
                                {log.node_id}
                              </Badge>
                            )}
                            {log.device_id && (
                              <Badge
                                variant="outline"
                                className="text-xs text-green-400 border-green-400/30"
                              >
                                {log.device_id}
                              </Badge>
                            )}

                            {/* 메시지 */}
                            <span className="text-zinc-200 flex-1 truncate">
                              {log.message}
                            </span>

                            {/* 복사 버튼 */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(
                                      `[${log.timestamp}] ${config.label} [${log.source}/${log.component}] ${log.message}`,
                                      log.id
                                    );
                                  }}
                                >
                                  {copiedId === log.id ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>복사</TooltipContent>
                            </Tooltip>
                          </div>
                        </CollapsibleTrigger>

                        {/* 상세 정보 */}
                        <CollapsibleContent>
                          <div className="px-4 pb-3 pl-10 space-y-2">
                            {/* 메타데이터 */}
                            {log.details && (
                              <div className="p-3 bg-zinc-900 rounded text-xs">
                                <div className="text-zinc-400 mb-1">Details:</div>
                                <pre className="text-zinc-300">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                            )}

                            {/* 스택 트레이스 */}
                            {log.stack_trace && (
                              <div className="p-3 bg-red-950/30 rounded text-xs">
                                <div className="text-red-400 mb-1">Stack Trace:</div>
                                <pre className="text-red-300 whitespace-pre-wrap">
                                  {log.stack_trace}
                                </pre>
                              </div>
                            )}

                            {/* Request ID */}
                            {log.request_id && (
                              <div className="text-xs text-zinc-500">
                                Request ID: {log.request_id}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* 하단 정보 */}
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <div>
            표시 중: {filteredLogs.length.toLocaleString()} / 전체:{" "}
            {logs.length.toLocaleString()}건
          </div>
          <div>
            마지막 업데이트:{" "}
            {logs.length > 0
              ? formatTime(new Date(logs[0]?.timestamp))
              : "-"}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
