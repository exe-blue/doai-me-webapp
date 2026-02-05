"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  TrendingUp,
  Minus,
  CheckCircle2,
  XCircle,
  Clock,
  Smartphone,
  Video,
  Timer,
  Zap,
  AlertTriangle,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DailyStats {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  cancelled_tasks: number;
  total_watch_time: number;
  avg_watch_time: number;
  unique_videos: number;
  unique_devices: number;
  active_devices: number;
  error_rate: number;
  avg_task_duration: number;
  peak_concurrent: number;
  tasks_per_hour: number[];
}

interface VideoPerformance {
  video_id: string;
  title: string;
  channel: string;
  executions: number;
  completed: number;
  failed: number;
  total_watch_time: number;
  avg_watch_time: number;
  success_rate: number;
}

interface NodePerformance {
  node_id: string;
  name: string;
  total_tasks: number;
  completed: number;
  failed: number;
  avg_duration: number;
  devices_used: number;
  error_rate: number;
}

interface HourlyData {
  hour: number;
  tasks: number;
  completed: number;
  failed: number;
}

// 날짜 유틸 함수
function formatDate(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  
  if (format === "yyyy-MM-dd") {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (format === "yyyy년 M월 d일") {
    return `${year}년 ${month}월 ${day}일`;
  }
  if (format === "EEEE") {
    return dayNames[date.getDay()];
  }
  return date.toLocaleDateString("ko-KR");
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export default function DailyReportPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [prevStats, setPrevStats] = useState<DailyStats | null>(null);
  const [videoPerformance, setVideoPerformance] = useState<VideoPerformance[]>([]);
  const [nodePerformance, setNodePerformance] = useState<NodePerformance[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareMode, setCompareMode] = useState<"prev_day" | "prev_week">("prev_day");

  useEffect(() => {
    fetchDailyReport();
  }, [selectedDate, compareMode]);

  async function fetchDailyReport() {
    setLoading(true);

    try {
      const dateStr = formatDate(selectedDate, "yyyy-MM-dd");
      const prevDateStr = formatDate(
        compareMode === "prev_day" ? subDays(selectedDate, 1) : subDays(selectedDate, 7),
        "yyyy-MM-dd"
      );

      // 현재일과 비교일 데이터 병렬 조회
      const [currentRes, prevRes] = await Promise.all([
        fetch(`/api/reports/daily?date=${dateStr}`),
        fetch(`/api/reports/daily?date=${prevDateStr}`),
      ]);

      const currentResult = await currentRes.json();
      const prevResult = await prevRes.json();

      // 현재일 통계
      const currentData = currentResult.success && currentResult.data ? currentResult.data : null;
      const currentStats: DailyStats = {
        date: dateStr,
        total_tasks: currentData?.total_tasks ?? 0,
        completed_tasks: currentData?.completed_tasks ?? 0,
        failed_tasks: currentData?.failed_tasks ?? 0,
        cancelled_tasks: currentData?.cancelled_tasks ?? 0,
        total_watch_time: currentData?.total_watch_time ?? 0,
        avg_watch_time: currentData?.avg_watch_time ?? 0,
        unique_videos: currentData?.unique_videos ?? 0,
        unique_devices: currentData?.unique_devices ?? 0,
        active_devices: currentData?.active_devices ?? 0,
        error_rate: currentData?.error_rate ?? 0,
        avg_task_duration: currentData?.avg_task_duration ?? 0,
        peak_concurrent: currentData?.peak_concurrent ?? 0,
        tasks_per_hour: currentData?.tasks_per_hour ?? Array(24).fill(0),
      };

      // 비교일 통계
      const prevData = prevResult.success && prevResult.data ? prevResult.data : null;
      const previousStats: DailyStats = {
        date: prevDateStr,
        total_tasks: prevData?.total_tasks ?? 0,
        completed_tasks: prevData?.completed_tasks ?? 0,
        failed_tasks: prevData?.failed_tasks ?? 0,
        cancelled_tasks: prevData?.cancelled_tasks ?? 0,
        total_watch_time: prevData?.total_watch_time ?? 0,
        avg_watch_time: prevData?.avg_watch_time ?? 0,
        unique_videos: prevData?.unique_videos ?? 0,
        unique_devices: prevData?.unique_devices ?? 0,
        active_devices: prevData?.active_devices ?? 0,
        error_rate: prevData?.error_rate ?? 0,
        avg_task_duration: prevData?.avg_task_duration ?? 0,
        peak_concurrent: prevData?.peak_concurrent ?? 0,
        tasks_per_hour: prevData?.tasks_per_hour ?? Array(24).fill(0),
      };

      setStats(currentStats);
      setPrevStats(previousStats);

      // 시간대별 데이터 생성
      const hourly: HourlyData[] = currentStats.tasks_per_hour.map((tasks, hour) => ({
        hour,
        tasks,
        completed: Math.floor(tasks * (currentStats.total_tasks > 0 ? currentStats.completed_tasks / currentStats.total_tasks : 0.95)),
        failed: Math.floor(tasks * (currentStats.total_tasks > 0 ? currentStats.failed_tasks / currentStats.total_tasks : 0.05)),
      }));
      setHourlyData(hourly);

      // 영상별 성과 (별도 API가 없으면 빈 배열)
      const videos: VideoPerformance[] = currentData?.video_performance ?? [];
      setVideoPerformance(videos);

      // 노드별 성과 (별도 API가 없으면 빈 배열)
      const nodes: NodePerformance[] = currentData?.node_performance ?? [];
      setNodePerformance(nodes);
    } catch (error) {
      console.error("Error fetching daily report:", error);
      // 오류 시 빈 데이터
      setStats(null);
      setPrevStats(null);
      setHourlyData([]);
      setVideoPerformance([]);
      setNodePerformance([]);
    } finally {
      setLoading(false);
    }
  }

  function calculateChange(current: number, previous: number): { value: number; type: "up" | "down" | "same" } {
    if (previous === 0) return { value: 0, type: "same" };
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 0.5) return { value: 0, type: "same" };
    return { value: Math.abs(change), type: change > 0 ? "up" : "down" };
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}분 ${secs}초`;
  }

  function formatWatchTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}시간 ${mins}분`;
    return `${mins}분`;
  }

  function goToPrevDay() {
    setSelectedDate(subDays(selectedDate, 1));
  }

  function goToNextDay() {
    if (!isToday(selectedDate)) {
      setSelectedDate(addDays(selectedDate, 1));
    }
  }

  async function exportReport() {
    alert("리포트 다운로드를 시작합니다");
  }

  const maxHourlyTasks = Math.max(...hourlyData.map((h) => h.tasks), 1);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              일간 리포트
            </h1>
            <p className="text-sm text-zinc-400">
              일일 작업 성과 및 통계를 확인합니다
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* 날짜 네비게이션 */}
            <div className="flex items-center gap-1 border border-zinc-700 rounded-lg p-1">
              <Button variant="ghost" size="icon" onClick={goToPrevDay}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="px-3 py-1 min-w-[140px] text-center">
                <div className="font-medium text-white">
                  {formatDate(selectedDate, "yyyy년 M월 d일")}
                </div>
                <div className="text-xs text-zinc-500">
                  {formatDate(selectedDate, "EEEE")}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextDay}
                disabled={isToday(selectedDate)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* 비교 모드 */}
            <Select value={compareMode} onValueChange={(v: "prev_day" | "prev_week") => setCompareMode(v)}>
              <SelectTrigger className="w-32 bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prev_day">전일 대비</SelectItem>
                <SelectItem value="prev_week">전주 대비</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={exportReport}>
              <Download className="mr-2 h-4 w-4" />
              내보내기
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
          </div>
        ) : stats && prevStats ? (
          <>
            {/* 핵심 지표 카드 */}
            <div className="grid grid-cols-4 gap-4">
              {/* 완료 작업 */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-zinc-400">완료 작업</p>
                    <p className="text-2xl font-bold text-white">
                      {stats.completed_tasks.toLocaleString()}
                    </p>
                    {(() => {
                      const change = calculateChange(
                        stats.completed_tasks,
                        prevStats.completed_tasks
                      );
                      return (
                        <div
                          className={`flex items-center gap-1 text-xs ${
                            change.type === "up"
                              ? "text-green-500"
                              : change.type === "down"
                              ? "text-red-500"
                              : "text-zinc-500"
                          }`}
                        >
                          {change.type === "up" && <ArrowUpRight className="h-3 w-3" />}
                          {change.type === "down" && <ArrowDownRight className="h-3 w-3" />}
                          {change.type === "same" && <Minus className="h-3 w-3" />}
                          {change.value.toFixed(1)}%
                        </div>
                      );
                    })()}
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
              </div>

              {/* 실패 작업 */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-zinc-400">실패 작업</p>
                    <p className="text-2xl font-bold text-white">{stats.failed_tasks.toLocaleString()}</p>
                    {(() => {
                      const change = calculateChange(
                        stats.failed_tasks,
                        prevStats.failed_tasks
                      );
                      return (
                        <div
                          className={`flex items-center gap-1 text-xs ${
                            change.type === "down"
                              ? "text-green-500"
                              : change.type === "up"
                              ? "text-red-500"
                              : "text-zinc-500"
                          }`}
                        >
                          {change.type === "up" && <ArrowUpRight className="h-3 w-3" />}
                          {change.type === "down" && <ArrowDownRight className="h-3 w-3" />}
                          {change.type === "same" && <Minus className="h-3 w-3" />}
                          {change.value.toFixed(1)}%
                        </div>
                      );
                    })()}
                  </div>
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
              </div>

              {/* 성공률 */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-zinc-400">성공률</p>
                    <p className="text-2xl font-bold text-white">
                      {((stats.completed_tasks / stats.total_tasks) * 100).toFixed(1)}%
                    </p>
                    {(() => {
                      const currentRate = stats.completed_tasks / stats.total_tasks;
                      const prevRate = prevStats.completed_tasks / prevStats.total_tasks;
                      const change = calculateChange(currentRate * 100, prevRate * 100);
                      return (
                        <div
                          className={`flex items-center gap-1 text-xs ${
                            change.type === "up"
                              ? "text-green-500"
                              : change.type === "down"
                              ? "text-red-500"
                              : "text-zinc-500"
                          }`}
                        >
                          {change.type === "up" && <ArrowUpRight className="h-3 w-3" />}
                          {change.type === "down" && <ArrowDownRight className="h-3 w-3" />}
                          {change.type === "same" && <Minus className="h-3 w-3" />}
                          {change.value.toFixed(2)}%p
                        </div>
                      );
                    })()}
                  </div>
                  <Zap className="h-8 w-8 text-blue-500" />
                </div>
              </div>

              {/* 총 시청 시간 */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-zinc-400">총 시청 시간</p>
                    <p className="text-2xl font-bold text-white">
                      {Math.floor(stats.total_watch_time / 3600).toLocaleString()}시간
                    </p>
                    {(() => {
                      const change = calculateChange(
                        stats.total_watch_time,
                        prevStats.total_watch_time
                      );
                      return (
                        <div
                          className={`flex items-center gap-1 text-xs ${
                            change.type === "up"
                              ? "text-green-500"
                              : change.type === "down"
                              ? "text-red-500"
                              : "text-zinc-500"
                          }`}
                        >
                          {change.type === "up" && <ArrowUpRight className="h-3 w-3" />}
                          {change.type === "down" && <ArrowDownRight className="h-3 w-3" />}
                          {change.type === "same" && <Minus className="h-3 w-3" />}
                          {change.value.toFixed(1)}%
                        </div>
                      );
                    })()}
                  </div>
                  <Timer className="h-8 w-8 text-purple-500" />
                </div>
              </div>
            </div>

            {/* 세부 지표 */}
            <div className="grid grid-cols-6 gap-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <Video className="h-5 w-5 mx-auto text-zinc-500 mb-1" />
                <p className="text-lg font-bold text-white">{stats.unique_videos}</p>
                <p className="text-xs text-zinc-500">고유 영상</p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <Smartphone className="h-5 w-5 mx-auto text-zinc-500 mb-1" />
                <p className="text-lg font-bold text-white">{stats.active_devices}</p>
                <p className="text-xs text-zinc-500">활성 디바이스</p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <Clock className="h-5 w-5 mx-auto text-zinc-500 mb-1" />
                <p className="text-lg font-bold text-white">{formatDuration(stats.avg_watch_time)}</p>
                <p className="text-xs text-zinc-500">평균 시청</p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <Timer className="h-5 w-5 mx-auto text-zinc-500 mb-1" />
                <p className="text-lg font-bold text-white">{formatDuration(stats.avg_task_duration)}</p>
                <p className="text-xs text-zinc-500">평균 작업시간</p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <TrendingUp className="h-5 w-5 mx-auto text-zinc-500 mb-1" />
                <p className="text-lg font-bold text-white">{stats.peak_concurrent}</p>
                <p className="text-xs text-zinc-500">최대 동시실행</p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <AlertTriangle className="h-5 w-5 mx-auto text-zinc-500 mb-1" />
                <p className="text-lg font-bold text-white">{stats.error_rate.toFixed(1)}%</p>
                <p className="text-xs text-zinc-500">오류율</p>
              </div>
            </div>

            {/* 시간대별 차트 */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="text-lg font-semibold text-white mb-2">시간대별 작업량</h2>
              <p className="text-sm text-zinc-500 mb-4">24시간 동안의 작업 분포</p>
              <div className="flex items-end gap-1 h-40">
                {hourlyData.map((data) => (
                  <Tooltip key={data.hour}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary"
                          style={{
                            height: `${(data.tasks / maxHourlyTasks) * 100}%`,
                            minHeight: "4px",
                          }}
                        />
                        <span className="text-xs text-zinc-500 mt-1">
                          {data.hour}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-sm">
                        <div className="font-medium">{data.hour}:00 - {data.hour + 1}:00</div>
                        <div>총 {data.tasks}건</div>
                        <div className="text-green-400">완료 {data.completed}건</div>
                        <div className="text-red-400">실패 {data.failed}건</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            {/* 탭 - 영상별 / 노드별 */}
            <Tabs defaultValue="videos">
              <TabsList>
                <TabsTrigger value="videos">영상별 성과</TabsTrigger>
                <TabsTrigger value="nodes">노드별 성과</TabsTrigger>
              </TabsList>

              <TabsContent value="videos" className="mt-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <h2 className="text-lg font-semibold text-white mb-2">영상별 실행 현황</h2>
                  <p className="text-sm text-zinc-500 mb-4">실행 횟수 기준 상위 20개 영상</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-400 w-10">#</TableHead>
                        <TableHead className="text-zinc-400">영상</TableHead>
                        <TableHead className="text-zinc-400 text-right">실행</TableHead>
                        <TableHead className="text-zinc-400 text-right">완료</TableHead>
                        <TableHead className="text-zinc-400 text-right">실패</TableHead>
                        <TableHead className="text-zinc-400 text-right">성공률</TableHead>
                        <TableHead className="text-zinc-400 text-right">총 시청</TableHead>
                        <TableHead className="text-zinc-400 text-right">평균 시청</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {videoPerformance.slice(0, 10).map((video, idx) => (
                        <TableRow key={video.video_id} className="border-zinc-800">
                          <TableCell className="font-medium text-zinc-400">{idx + 1}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium text-white truncate max-w-[250px]">
                                {video.title}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {video.channel}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-zinc-300">{video.executions}</TableCell>
                          <TableCell className="text-right text-green-500">
                            {video.completed}
                          </TableCell>
                          <TableCell className="text-right text-red-500">
                            {video.failed}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              className={`${
                                video.success_rate >= 95
                                  ? "bg-green-500/10 text-green-500"
                                  : video.success_rate >= 90
                                  ? "bg-yellow-500/10 text-yellow-500"
                                  : "bg-red-500/10 text-red-500"
                              } border-0`}
                            >
                              {video.success_rate.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-zinc-300">
                            {formatWatchTime(video.total_watch_time)}
                          </TableCell>
                          <TableCell className="text-right text-zinc-300">
                            {formatDuration(video.avg_watch_time)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="nodes" className="mt-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <h2 className="text-lg font-semibold text-white mb-2">노드별 처리 현황</h2>
                  <p className="text-sm text-zinc-500 mb-4">5개 노드의 일일 성과</p>
                  <div className="grid grid-cols-5 gap-4">
                    {nodePerformance.map((node) => (
                      <div
                        key={node.node_id}
                        className="p-4 border border-zinc-700 rounded-lg space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">{node.name}</span>
                          <Badge
                            className={`${
                              node.error_rate < 3
                                ? "bg-green-500/10 text-green-500"
                                : node.error_rate < 5
                                ? "bg-yellow-500/10 text-yellow-500"
                                : "bg-red-500/10 text-red-500"
                            } border-0`}
                          >
                            {node.error_rate.toFixed(1)}%
                          </Badge>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">처리량</span>
                            <span className="font-medium text-white">
                              {node.total_tasks.toLocaleString()}
                            </span>
                          </div>
                          <Progress
                            value={(node.completed / node.total_tasks) * 100}
                            className="h-2"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 bg-green-500/10 rounded text-center">
                            <div className="font-medium text-green-500">
                              {node.completed.toLocaleString()}
                            </div>
                            <div className="text-zinc-500">완료</div>
                          </div>
                          <div className="p-2 bg-red-500/10 rounded text-center">
                            <div className="font-medium text-red-500">{node.failed}</div>
                            <div className="text-zinc-500">실패</div>
                          </div>
                        </div>

                        <div className="text-xs text-zinc-500">
                          <div className="flex justify-between">
                            <span>평균 작업시간</span>
                            <span className="text-zinc-400">{formatDuration(node.avg_duration)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>사용 디바이스</span>
                            <span className="text-zinc-400">{node.devices_used}대</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="text-center py-20 text-zinc-500">
            데이터를 불러올 수 없습니다
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
