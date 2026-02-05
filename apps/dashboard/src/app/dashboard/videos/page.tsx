"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  MoreHorizontal,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  ThumbsUp,
  MessageSquare,
  UserPlus,
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
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";

interface Video {
  id: string;
  title: string;
  channel_id: string;
  channel_name: string;
  thumbnail_url: string;
  video_duration_sec: number;
  target_views: number;
  completed_views: number;
  failed_views: number;
  watch_duration_sec: number;
  watch_duration_min_pct: number;
  watch_duration_max_pct: number;
  prob_like: number;
  prob_comment: number;
  prob_subscribe: number;
  status: "active" | "paused" | "completed" | "archived";
  priority: "urgent" | "high" | "normal" | "low";
  search_keyword: string;
  tags: string[];
  created_at: string;
}

const statusColors: Record<string, string> = {
  active: "bg-green-400 text-green-900 border-green-900",
  paused: "bg-yellow-400 text-yellow-900 border-yellow-900",
  completed: "bg-blue-400 text-blue-900 border-blue-900",
  archived: "bg-gray-400 text-gray-900 border-gray-900",
};

const statusLabels: Record<string, string> = {
  active: "진행중",
  paused: "일시정지",
  completed: "완료",
  archived: "보관",
};

const priorityColors: Record<string, string> = {
  urgent: "bg-red-400 text-red-900 border-red-900",
  high: "bg-orange-400 text-orange-900 border-orange-900",
  normal: "bg-blue-400 text-blue-900 border-blue-900",
  low: "bg-gray-400 text-gray-900 border-gray-900",
};

const priorityLabels: Record<string, string> = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // 새 영상 등록 폼
  const [newVideo, setNewVideo] = useState({
    url: "",
    target_views: 100,
    watch_duration_sec: 60,
    prob_like: 0,
    prob_comment: 0,
    prob_subscribe: 0,
    priority: "normal" as "urgent" | "high" | "normal" | "low",
    search_keyword: "",
  });

  useEffect(() => {
    fetchVideos();
  }, [statusFilter]);

  async function fetchVideos() {
    setLoading(true);
    try {
      let query = supabase
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("영상 목록 로드 실패:", error);
      } else {
        setVideos(data || []);
      }
    } catch (err) {
      console.error("영상 목록 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }

  // YouTube URL에서 Video ID 추출
  function extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/, // 직접 ID 입력
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  async function handleAddVideo() {
    const videoId = extractVideoId(newVideo.url);
    if (!videoId) {
      alert("올바른 YouTube URL을 입력해주세요");
      return;
    }

    try {
      const { error } = await supabase.from("videos").insert({
        id: videoId,
        title: "영상 정보 로딩 중...",
        thumbnail_url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        target_views: newVideo.target_views,
        watch_duration_sec: newVideo.watch_duration_sec,
        prob_like: newVideo.prob_like,
        prob_comment: newVideo.prob_comment,
        prob_subscribe: newVideo.prob_subscribe,
        priority: newVideo.priority,
        search_keyword: newVideo.search_keyword || null, // 빈 값이면 트리거가 자동 채움
        status: "active",
      });

      if (error) {
        if (error.code === "23505") {
          alert("이미 등록된 영상입니다");
        } else {
          alert("영상 등록에 실패했습니다: " + error.message);
        }
        return;
      }

      setIsAddDialogOpen(false);
      setNewVideo({
        url: "",
        target_views: 100,
        watch_duration_sec: 60,
        prob_like: 0,
        prob_comment: 0,
        prob_subscribe: 0,
        priority: "normal",
        search_keyword: "",
      });
      fetchVideos();
    } catch (err) {
      console.error("Failed to register video:", err);
      alert("영상 등록에 실패했습니다");
    }
  }

  async function updateVideoStatus(videoId: string, status: Video["status"]) {
    const { error } = await supabase
      .from("videos")
      .update({ status })
      .eq("id", videoId);

    if (error) {
      console.error("상태 변경 실패:", error);
    } else {
      fetchVideos();
    }
  }

  async function deleteVideo(videoId: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("videos").delete().eq("id", videoId);

    if (error) {
      console.error("삭제 실패:", error);
    } else {
      fetchVideos();
    }
  }

  const filteredVideos = videos.filter(
    (v) =>
      v.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.channel_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.search_keyword?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 통계
  const stats = {
    total: videos.length,
    active: videos.filter((v) => v.status === "active").length,
    completed: videos.filter((v) => v.status === "completed").length,
    totalTarget: videos.reduce((sum, v) => sum + (v.target_views || 0), 0),
    totalCompleted: videos.reduce((sum, v) => sum + (v.completed_views || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">영상 목록</h1>
          <p className="text-sm text-muted-foreground">
            시청할 YouTube 영상을 관리합니다
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              영상 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>새 영상 등록</DialogTitle>
              <DialogDescription>
                시청할 YouTube 영상을 등록합니다
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* YouTube URL */}
              <div className="space-y-2">
                <Label>YouTube URL</Label>
                <Input
                  placeholder="https://youtube.com/watch?v=... 또는 영상 ID"
                  value={newVideo.url}
                  onChange={(e) =>
                    setNewVideo({ ...newVideo, url: e.target.value })
                  }
                />
              </div>

              {/* 검색 키워드 */}
              <div className="space-y-2">
                <Label>검색 키워드 (선택)</Label>
                <Input
                  placeholder="비워두면 제목에서 자동 추출"
                  value={newVideo.search_keyword}
                  onChange={(e) =>
                    setNewVideo({ ...newVideo, search_keyword: e.target.value })
                  }
                />
                <p className="text-xs text-zinc-500">
                  디바이스가 YouTube에서 검색할 키워드입니다. 비워두면 제목에서 #해시태그를 제외하고 자동 추출됩니다.
                </p>
              </div>

              {/* 목표 시청 횟수 */}
              <div className="space-y-2">
                <Label>목표 시청 횟수: {newVideo.target_views}회</Label>
                <Slider
                  value={[newVideo.target_views]}
                  onValueChange={([v]) =>
                    setNewVideo({ ...newVideo, target_views: v })
                  }
                  min={10}
                  max={1000}
                  step={10}
                />
              </div>

              {/* 시청 시간 */}
              <div className="space-y-2">
                <Label>시청 시간: {newVideo.watch_duration_sec}초</Label>
                <Slider
                  value={[newVideo.watch_duration_sec]}
                  onValueChange={([v]) =>
                    setNewVideo({ ...newVideo, watch_duration_sec: v })
                  }
                  min={30}
                  max={600}
                  step={10}
                />
              </div>

              {/* 우선순위 */}
              <div className="space-y-2">
                <Label>우선순위</Label>
                <Select
                  value={newVideo.priority}
                  onValueChange={(v: "urgent" | "high" | "normal" | "low") =>
                    setNewVideo({ ...newVideo, priority: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">🔴 긴급</SelectItem>
                    <SelectItem value="high">🟠 높음</SelectItem>
                    <SelectItem value="normal">🔵 보통</SelectItem>
                    <SelectItem value="low">⚪ 낮음</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 행동 확률 */}
              <div className="space-y-4 rounded-lg border border-zinc-700 p-4">
                <h4 className="font-medium text-white">행동 확률 (%)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-zinc-400">
                      <ThumbsUp className="h-3 w-3" /> 좋아요
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newVideo.prob_like}
                      onChange={(e) =>
                        setNewVideo({
                          ...newVideo,
                          prob_like: Math.min(100, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-zinc-400">
                      <MessageSquare className="h-3 w-3" /> 댓글
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newVideo.prob_comment}
                      onChange={(e) =>
                        setNewVideo({
                          ...newVideo,
                          prob_comment: Math.min(100, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-zinc-400">
                      <UserPlus className="h-3 w-3" /> 구독
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newVideo.prob_subscribe}
                      onChange={(e) =>
                        setNewVideo({
                          ...newVideo,
                          prob_subscribe: Math.min(100, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddVideo} disabled={!newVideo.url}>
                등록
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">전체 영상</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">진행중</div>
          <div className="text-2xl font-bold text-green-500">{stats.active}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">완료</div>
          <div className="text-2xl font-bold text-blue-500">{stats.completed}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-sm text-zinc-400">전체 진행률</div>
          <div className="text-2xl font-bold text-white">
            {stats.totalTarget > 0
              ? Math.round((stats.totalCompleted / stats.totalTarget) * 100)
              : 0}
            %
          </div>
        </div>
      </div>

      {/* 필터 & 검색 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="영상 제목, 채널명, 키워드 검색..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">진행중</SelectItem>
            <SelectItem value="paused">일시정지</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
            <SelectItem value="archived">보관</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">영상</TableHead>
              <TableHead>검색 키워드</TableHead>
              <TableHead>진행률</TableHead>
              <TableHead>시청시간</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>우선순위</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  로딩중...
                </TableCell>
              </TableRow>
            ) : filteredVideos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  등록된 영상이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filteredVideos.map((video) => (
                <TableRow key={video.id}>
                  {/* 영상 정보 */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={video.thumbnail_url || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                        alt={video.title}
                        className="h-12 w-20 object-cover bg-muted border-2 border-foreground"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-foreground truncate">{video.title || video.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {video.channel_name || "Unknown Channel"}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* 검색 키워드 */}
                  <TableCell>
                    <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
                      {video.search_keyword || "-"}
                    </span>
                  </TableCell>

                  {/* 진행률 */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={((video.completed_views || 0) / (video.target_views || 1)) * 100}
                        className="w-20 h-3"
                      />
                      <span className="text-sm text-muted-foreground">
                        {video.completed_views || 0}/{video.target_views || 0}
                      </span>
                    </div>
                  </TableCell>

                  {/* 시청 시간 */}
                  <TableCell className="text-muted-foreground">{video.watch_duration_sec || 60}초</TableCell>

                  {/* 상태 */}
                  <TableCell>
                    <Badge
                      className={`${statusColors[video.status]} border-2 font-bold`}
                    >
                      {statusLabels[video.status]}
                    </Badge>
                  </TableCell>

                  {/* 우선순위 */}
                  <TableCell>
                    <Badge
                      className={`${priorityColors[video.priority]} border-2 font-bold`}
                    >
                      {priorityLabels[video.priority]}
                    </Badge>
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
                        <DropdownMenuItem
                          onClick={() =>
                            window.open(
                              `https://youtube.com/watch?v=${video.id}`,
                              "_blank"
                            )
                          }
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          YouTube에서 보기
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {video.status === "active" ? (
                          <DropdownMenuItem
                            onClick={() => updateVideoStatus(video.id, "paused")}
                          >
                            <Pause className="mr-2 h-4 w-4" />
                            일시정지
                          </DropdownMenuItem>
                        ) : video.status === "paused" ? (
                          <DropdownMenuItem
                            onClick={() => updateVideoStatus(video.id, "active")}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            재개
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => updateVideoStatus(video.id, "archived")}
                        >
                          보관으로 이동
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-500"
                          onClick={() => deleteVideo(video.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
