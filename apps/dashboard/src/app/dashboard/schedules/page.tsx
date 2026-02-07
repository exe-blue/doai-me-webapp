"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Play,
  Clock,
  Calendar,
  CalendarClock,
  Repeat,
  AlertCircle,
  CheckCircle2,
  Loader2,
  History,
  Video,
  Hash,
  Tv,
  Edit,
  Copy,
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
  Label,
  Slider,
  Textarea,
  ScrollArea,
} from "@packages/ui";
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
import { StatsCard } from "@/components/ui/stats-card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useSchedulesQuery, scheduleKeys } from "@/hooks/queries";
import type { Schedule } from "@/hooks/queries";
import { useQueryClient } from "@tanstack/react-query";

interface ScheduleRun {
  id: string;
  schedule_id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  tasks_created: number;
  tasks_completed: number;
  tasks_failed: number;
  error_message: string | null;
}

interface VideoOption {
  id: string;
  title: string;
}

interface ChannelOption {
  id: string;
  name: string;
}

interface KeywordOption {
  id: string;
  keyword: string;
}

const scheduleTypeConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  interval: { label: "반복 주기", icon: Repeat, color: "bg-blue-400 text-blue-900 border-blue-900" },
  cron: { label: "Cron 표현식", icon: CalendarClock, color: "bg-purple-400 text-purple-900 border-purple-900" },
  once: { label: "1회 실행", icon: Calendar, color: "bg-green-400 text-green-900 border-green-900" },
};

const targetTypeConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  all_videos: { label: "모든 활성 영상", icon: Video },
  by_channel: { label: "채널별", icon: Tv },
  by_keyword: { label: "키워드별", icon: Hash },
  specific_videos: { label: "특정 영상", icon: Video },
};

const cronPresets = [
  { label: "매 시간", value: "0 * * * *" },
  { label: "매 2시간", value: "0 */2 * * *" },
  { label: "매 6시간", value: "0 */6 * * *" },
  { label: "매일 자정", value: "0 0 * * *" },
  { label: "매일 오전 9시", value: "0 9 * * *" },
  { label: "매일 오후 6시", value: "0 18 * * *" },
  { label: "평일 오전 9시", value: "0 9 * * 1-5" },
  { label: "주말 오전 10시", value: "0 10 * * 0,6" },
];

// 시간 포맷 함수
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 0) {
    // 미래 시간
    const futureMins = Math.abs(diffMins);
    if (futureMins < 60) return `${futureMins}분 후`;
    const futureHours = Math.floor(futureMins / 60);
    if (futureHours < 24) return `${futureHours}시간 후`;
    const futureDays = Math.floor(futureHours / 24);
    return `${futureDays}일 후`;
  }

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간`;
  return `${Math.floor(minutes / 1440)}일`;
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const { data: schedules = [], isLoading: loading } = useSchedulesQuery();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [scheduleRuns, setScheduleRuns] = useState<ScheduleRun[]>([]);

  // 폼 상태
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    schedule_type: "interval" | "cron" | "once";
    cron_expression: string;
    interval_minutes: number;
    once_datetime: string;
    target_type: "all_videos" | "by_channel" | "by_keyword" | "specific_videos";
    target_ids: string[];
    priority: "high" | "normal" | "low";
    batch_size: number;
    max_concurrent: number;
    distribute_evenly: boolean;
  }>({
    name: "",
    description: "",
    schedule_type: "interval",
    cron_expression: "0 * * * *",
    interval_minutes: 60,
    once_datetime: "",
    target_type: "all_videos",
    target_ids: [],
    priority: "normal",
    batch_size: 50,
    max_concurrent: 100,
    distribute_evenly: true,
  });

  // 타겟 옵션
  const [videos, setVideos] = useState<VideoOption[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [keywords, setKeywords] = useState<KeywordOption[]>([]);

  useEffect(() => {
    fetchTargetOptions();
  }, []);

  async function fetchTargetOptions() {
    const [videosRes, channelsRes, keywordsRes] = await Promise.all([
      supabase.from("videos").select("id, title").eq("status", "active").limit(100),
      supabase.from("channels").select("id, name").eq("is_active", true).limit(50),
      supabase.from("keywords").select("id, keyword").eq("is_active", true).limit(50),
    ]);

    if (videosRes.error) {
      console.error("Failed to fetch videos:", videosRes.error);
    } else {
      setVideos(videosRes.data || []);
    }

    if (channelsRes.error) {
      console.error("Failed to fetch channels:", channelsRes.error);
    } else {
      setChannels(channelsRes.data || []);
    }

    if (keywordsRes.error) {
      console.error("Failed to fetch keywords:", keywordsRes.error);
    } else {
      setKeywords(keywordsRes.data || []);
    }
  }

  async function fetchScheduleRuns(scheduleId: string) {
    const { data, error } = await supabase
      .from("schedule_runs")
      .select("*")
      .eq("schedule_id", scheduleId)
      .order("started_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to fetch schedule runs:", error);
      return;
    }
    setScheduleRuns(data || []);
  }

  function resetForm() {
    setFormData({
      name: "",
      description: "",
      schedule_type: "interval",
      cron_expression: "0 * * * *",
      interval_minutes: 60,
      once_datetime: "",
      target_type: "all_videos",
      target_ids: [],
      priority: "normal",
      batch_size: 50,
      max_concurrent: 100,
      distribute_evenly: true,
    });
  }

  /**
   * Calculate next run time for a schedule.
   * Note: For cron schedules, this returns null as the actual next run time
   * should be calculated by the backend using a proper cron parser (e.g., pg_cron).
   * The backend will compute the accurate next_run value when the schedule is created/updated.
   */
  function calculateNextRun(
    scheduleType: string,
    intervalMinutes?: number,
    cronExpression?: string,
    onceDatetime?: string
  ): string | null {
    const now = new Date();

    if (scheduleType === "interval" && intervalMinutes) {
      return new Date(now.getTime() + intervalMinutes * 60000).toISOString();
    } else if (scheduleType === "once" && onceDatetime) {
      return new Date(onceDatetime).toISOString();
    } else if (scheduleType === "cron" && cronExpression) {
      // Cron schedule: next_run should be computed by the backend
      // We return null here; the backend will calculate the actual next run time
      // using a proper cron parser that handles all cron expression formats
      return null;
    }
    return null;
  }

  async function createSchedule() {
    if (!formData.name.trim()) {
      alert("스케줄 이름을 입력해주세요");
      return;
    }

    const nextRun = calculateNextRun(
      formData.schedule_type,
      formData.interval_minutes,
      formData.cron_expression,
      formData.once_datetime
    );

    const scheduleData = {
      name: formData.name,
      description: formData.description || null,
      schedule_type: formData.schedule_type,
      cron_expression: formData.schedule_type === "cron" ? formData.cron_expression : null,
      interval_minutes: formData.schedule_type === "interval" ? formData.interval_minutes : null,
      target_type: formData.target_type,
      target_ids: formData.target_type !== "all_videos" ? formData.target_ids : null,
      task_config: {
        priority: formData.priority,
        batch_size: formData.batch_size,
        max_concurrent: formData.max_concurrent,
        distribute_evenly: formData.distribute_evenly,
      },
      is_active: true,
      next_run_at: nextRun,
      run_count: 0,
    };

    const { error } = await supabase.from("schedules").insert(scheduleData);

    if (error) {
      alert("스케줄 생성에 실패했습니다: " + error.message);
    } else {
      setIsAddDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    }
  }

  async function updateSchedule() {
    if (!editingSchedule) return;

    const nextRun = calculateNextRun(
      formData.schedule_type,
      formData.interval_minutes,
      formData.cron_expression,
      formData.once_datetime
    );

    const { error } = await supabase
      .from("schedules")
      .update({
        name: formData.name,
        description: formData.description || null,
        schedule_type: formData.schedule_type,
        cron_expression: formData.schedule_type === "cron" ? formData.cron_expression : null,
        interval_minutes: formData.schedule_type === "interval" ? formData.interval_minutes : null,
        target_type: formData.target_type,
        target_ids: formData.target_type !== "all_videos" ? formData.target_ids : null,
        task_config: {
          priority: formData.priority,
          batch_size: formData.batch_size,
          max_concurrent: formData.max_concurrent,
          distribute_evenly: formData.distribute_evenly,
        },
        next_run_at: nextRun,
      })
      .eq("id", editingSchedule.id);

    if (error) {
      alert("수정에 실패했습니다: " + error.message);
    } else {
      setIsEditDialogOpen(false);
      setEditingSchedule(null);
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    }
  }

  async function toggleSchedule(id: string, isActive: boolean) {
    const { error } = await supabase
      .from("schedules")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      console.error("상태 변경 실패:", error);
    } else {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    }
  }

  async function runNow(schedule: Schedule) {
    alert(`스케줄 "${schedule.name}" 즉시 실행 기능은 백엔드 API가 필요합니다`);
  }

  async function duplicateSchedule(schedule: Schedule) {
    const newSchedule = {
      name: `${schedule.name} (복사본)`,
      description: schedule.description,
      schedule_type: schedule.schedule_type,
      cron_expression: schedule.cron_expression,
      interval_minutes: schedule.interval_minutes,
      target_type: schedule.target_type,
      target_ids: schedule.target_ids,
      task_config: schedule.task_config,
      is_active: false,
      next_run_at: schedule.next_run_at,
      run_count: 0,
    };

    const { error } = await supabase.from("schedules").insert(newSchedule);

    if (error) {
      alert("복제에 실패했습니다: " + error.message);
    } else {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("schedules").delete().eq("id", id);

    if (error) {
      console.error("삭제 실패:", error);
    } else {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    }
  }

  function openEditDialog(schedule: Schedule) {
    setEditingSchedule(schedule);
    setFormData({
      name: schedule.name,
      description: schedule.description || "",
      schedule_type: schedule.schedule_type,
      cron_expression: schedule.cron_expression || "0 * * * *",
      interval_minutes: schedule.interval_minutes || 60,
      once_datetime: "",
      target_type: schedule.target_type,
      target_ids: schedule.target_ids || [],
      priority: schedule.task_config?.priority || "normal",
      batch_size: schedule.task_config?.batch_size || 50,
      max_concurrent: schedule.task_config?.max_concurrent || 100,
      distribute_evenly: schedule.task_config?.distribute_evenly ?? true,
    });
    setIsEditDialogOpen(true);
  }

  function openHistoryDialog(schedule: Schedule) {
    setEditingSchedule(schedule);
    fetchScheduleRuns(schedule.id);
    setIsHistoryDialogOpen(true);
  }

  const filteredSchedules = schedules.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 통계
  const stats = {
    total: schedules.length,
    active: schedules.filter((s) => s.is_active).length,
    totalRuns: schedules.reduce((sum, s) => sum + (s.run_count || 0), 0),
  };

  // 폼 컴포넌트
  const ScheduleForm = () => (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>스케줄 이름 *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="예: 매시간 조회수 채우기"
          />
        </div>

        <div className="space-y-2">
          <Label>설명</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="스케줄에 대한 설명을 입력하세요"
            rows={2}
          />
        </div>
      </div>

      {/* 스케줄 타입 */}
      <div className="space-y-4">
        <Label>실행 주기</Label>
        <Tabs
          value={formData.schedule_type}
          onValueChange={(v) => setFormData({ ...formData, schedule_type: v as "interval" | "cron" | "once" })}
        >
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="interval">
              <Repeat className="mr-2 h-4 w-4" />
              반복 주기
            </TabsTrigger>
            <TabsTrigger value="cron">
              <CalendarClock className="mr-2 h-4 w-4" />
              Cron
            </TabsTrigger>
            <TabsTrigger value="once">
              <Calendar className="mr-2 h-4 w-4" />
              1회 실행
            </TabsTrigger>
          </TabsList>

          <TabsContent value="interval" className="mt-4">
            <div className="space-y-2">
              <Label>반복 주기: {formatInterval(formData.interval_minutes)}</Label>
              <Slider
                value={[formData.interval_minutes]}
                onValueChange={([v]) => setFormData({ ...formData, interval_minutes: v })}
                min={5}
                max={1440}
                step={5}
              />
              <div className="flex justify-between text-xs text-muted-foreground font-medium">
                <span>5분</span>
                <span>24시간</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cron" className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label>Cron 표현식</Label>
              <Input
                value={formData.cron_expression}
                onChange={(e) =>
                  setFormData({ ...formData, cron_expression: e.target.value })
                }
                placeholder="0 * * * *"
                className="font-sans"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {cronPresets.map((preset) => (
                <Button
                  key={preset.value}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormData({ ...formData, cron_expression: preset.value })
                  }
                  className={
                    formData.cron_expression === preset.value
                      ? "border-primary bg-primary/10"
                      : ""
                  }
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="once" className="mt-4">
            <div className="space-y-2">
              <Label>실행 일시</Label>
              <Input
                type="datetime-local"
                value={formData.once_datetime}
                onChange={(e) =>
                  setFormData({ ...formData, once_datetime: e.target.value })
                }
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 대상 선택 */}
      <div className="space-y-4">
        <Label>대상 영상</Label>
        <Select
          value={formData.target_type}
          onValueChange={(v: "all_videos" | "by_channel" | "by_keyword" | "specific_videos") =>
            setFormData({ ...formData, target_type: v, target_ids: [] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_videos">모든 활성 영상</SelectItem>
            <SelectItem value="by_channel">채널별 선택</SelectItem>
            <SelectItem value="by_keyword">키워드별 선택</SelectItem>
            <SelectItem value="specific_videos">특정 영상 선택</SelectItem>
          </SelectContent>
        </Select>

        {formData.target_type === "by_channel" && (
          <div className="space-y-2">
            <Label>채널 선택</Label>
            <ScrollArea className="h-32 border-2 border-foreground p-2">
              {channels.map((channel) => (
                <div key={channel.id} className="flex items-center gap-2 py-1">
                  <Checkbox
                    checked={formData.target_ids.includes(channel.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFormData({
                          ...formData,
                          target_ids: [...formData.target_ids, channel.id],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          target_ids: formData.target_ids.filter(
                            (id) => id !== channel.id
                          ),
                        });
                      }
                    }}
                  />
                  <span className="text-sm text-foreground">{channel.name}</span>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        {formData.target_type === "by_keyword" && (
          <div className="space-y-2">
            <Label>키워드 선택</Label>
            <ScrollArea className="h-32 border-2 border-foreground p-2">
              {keywords.map((kw) => (
                <div key={kw.id} className="flex items-center gap-2 py-1">
                  <Checkbox
                    checked={formData.target_ids.includes(kw.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFormData({
                          ...formData,
                          target_ids: [...formData.target_ids, kw.id],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          target_ids: formData.target_ids.filter(
                            (id) => id !== kw.id
                          ),
                        });
                      }
                    }}
                  />
                  <span className="text-sm text-foreground">{kw.keyword}</span>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        {formData.target_type === "specific_videos" && (
          <div className="space-y-2">
            <Label>영상 선택</Label>
            <ScrollArea className="h-32 border-2 border-foreground p-2">
              {videos.map((video) => (
                <div key={video.id} className="flex items-center gap-2 py-1">
                  <Checkbox
                    checked={formData.target_ids.includes(video.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFormData({
                          ...formData,
                          target_ids: [...formData.target_ids, video.id],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          target_ids: formData.target_ids.filter(
                            (id) => id !== video.id
                          ),
                        });
                      }
                    }}
                  />
                  <span className="text-sm text-foreground truncate">{video.title}</span>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>

      {/* 작업 설정 */}
      <div className="space-y-4">
        <Label>작업 설정</Label>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>우선순위</Label>
            <Select
              value={formData.priority}
              onValueChange={(v: "high" | "normal" | "low") => setFormData({ ...formData, priority: v })}
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
            <Label>배치 크기: {formData.batch_size}개</Label>
            <Slider
              value={[formData.batch_size]}
              onValueChange={([v]) => setFormData({ ...formData, batch_size: v })}
              min={10}
              max={500}
              step={10}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>최대 동시 실행: {formData.max_concurrent}개</Label>
          <Slider
            value={[formData.max_concurrent]}
            onValueChange={([v]) => setFormData({ ...formData, max_concurrent: v })}
            min={10}
            max={500}
            step={10}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="distribute"
            checked={formData.distribute_evenly}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, distribute_evenly: checked as boolean })
            }
          />
          <Label htmlFor="distribute">노드에 균등 분배</Label>
        </div>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-head font-bold text-foreground">스케줄러</h1>
            <p className="text-sm text-muted-foreground">
              자동 작업 스케줄을 관리합니다
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                새 스케줄
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>새 스케줄 생성</DialogTitle>
                <DialogDescription>
                  자동으로 실행될 작업 스케줄을 설정합니다
                </DialogDescription>
              </DialogHeader>
              <ScheduleForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={createSchedule} disabled={!formData.name.trim()}>
                  생성
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-4">
          <StatsCard label="전체 스케줄" value={stats.total} />
          <StatsCard variant="success" label="활성 스케줄" value={stats.active} />
          <StatsCard variant="info" label="총 실행 횟수" value={stats.totalRuns} />
        </div>

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="스케줄 검색..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* 테이블 */}
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">스케줄</TableHead>
                <TableHead>실행 주기</TableHead>
                <TableHead>대상</TableHead>
                <TableHead>다음 실행</TableHead>
                <TableHead>실행 횟수</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredSchedules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    등록된 스케줄이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                filteredSchedules.map((schedule) => {
                  const TypeIcon = scheduleTypeConfig[schedule.schedule_type]?.icon || Repeat;
                  const TargetIcon = targetTypeConfig[schedule.target_type]?.icon || Video;

                  return (
                    <TableRow key={schedule.id}>
                      {/* 스케줄 정보 */}
                      <TableCell>
                        <div>
                          <div className="font-bold text-foreground">{schedule.name}</div>
                          {schedule.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {schedule.description}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* 실행 주기 */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={`${scheduleTypeConfig[schedule.schedule_type]?.color || "bg-gray-400 text-gray-900 border-gray-900"} border-2 font-bold`}
                          >
                            <TypeIcon className="mr-1 h-3 w-3" />
                            {scheduleTypeConfig[schedule.schedule_type]?.label || schedule.schedule_type}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {schedule.schedule_type === "interval" &&
                            schedule.interval_minutes &&
                            `매 ${formatInterval(schedule.interval_minutes)}`}
                          {schedule.schedule_type === "cron" && (
                            <code className="text-foreground font-mono">{schedule.cron_expression}</code>
                          )}
                          {schedule.schedule_type === "once" && "1회"}
                        </div>
                      </TableCell>

                      {/* 대상 */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TargetIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">
                            {targetTypeConfig[schedule.target_type]?.label || schedule.target_type}
                            {schedule.target_ids && schedule.target_ids.length > 0 && (
                              <span className="text-muted-foreground">
                                {" "}
                                ({schedule.target_ids.length}개)
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>

                      {/* 다음 실행 */}
                      <TableCell>
                        {schedule.next_run_at ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="text-sm text-foreground">
                                {formatTimeAgo(schedule.next_run_at)}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {formatDateTime(schedule.next_run_at)}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>

                      {/* 실행 횟수 */}
                      <TableCell>
                        <div className="flex items-center gap-1 text-foreground">
                          <span className="font-bold">{schedule.run_count || 0}</span>
                          {schedule.last_run_at && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Clock className="h-3 w-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                마지막 실행: {formatDateTime(schedule.last_run_at)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>

                      {/* 상태 */}
                      <TableCell>
                        <Switch
                          checked={schedule.is_active}
                          onCheckedChange={(checked) =>
                            toggleSchedule(schedule.id, checked)
                          }
                        />
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
                            <DropdownMenuItem onClick={() => runNow(schedule)}>
                              <Play className="mr-2 h-4 w-4" />
                              지금 실행
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openHistoryDialog(schedule)}>
                              <History className="mr-2 h-4 w-4" />
                              실행 이력
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEditDialog(schedule)}>
                              <Edit className="mr-2 h-4 w-4" />
                              수정
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicateSchedule(schedule)}>
                              <Copy className="mr-2 h-4 w-4" />
                              복제
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-500"
                              onClick={() => deleteSchedule(schedule.id)}
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

        {/* 수정 다이얼로그 */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>스케줄 수정</DialogTitle>
            </DialogHeader>
            <ScheduleForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={updateSchedule}>저장</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 실행 이력 다이얼로그 */}
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>실행 이력</DialogTitle>
              <DialogDescription>{editingSchedule?.name}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px]">
              {scheduleRuns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  실행 이력이 없습니다
                </div>
              ) : (
                <div className="space-y-2">
                  {scheduleRuns.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center gap-4 p-3 border-2 border-foreground"
                    >
                      <div
                        className={`h-10 w-10 flex items-center justify-center border-2 ${
                          run.status === "completed"
                            ? "bg-green-100 dark:bg-green-900/30 border-green-600"
                            : run.status === "failed"
                            ? "bg-red-100 dark:bg-red-900/30 border-red-600"
                            : "bg-blue-100 dark:bg-blue-900/30 border-blue-600"
                        }`}
                      >
                        {run.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : run.status === "failed" ? (
                          <AlertCircle className="h-5 w-5 text-red-600" />
                        ) : (
                          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">
                            {formatDateTime(run.started_at)}
                          </span>
                          <Badge
                            variant={
                              run.status === "completed"
                                ? "default"
                                : run.status === "failed"
                                ? "destructive"
                                : "secondary"
                            }
                            className="border-2 font-bold"
                          >
                            {run.status === "completed"
                              ? "완료"
                              : run.status === "failed"
                              ? "실패"
                              : "실행중"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          생성: {run.tasks_created}개 / 완료: {run.tasks_completed}개
                          {run.tasks_failed > 0 && (
                            <span className="text-red-600 font-medium">
                              {" "}
                              / 실패: {run.tasks_failed}개
                            </span>
                          )}
                        </div>
                        {run.error_message && (
                          <div className="text-xs text-red-600 font-medium mt-1">
                            {run.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
