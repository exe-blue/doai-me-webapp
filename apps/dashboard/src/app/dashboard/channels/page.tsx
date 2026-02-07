"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  MoreHorizontal,
  ExternalLink,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  Users,
  Bell,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
import { WatchSettingsReadonly } from "@/components/watch-settings/watch-settings-readonly";

interface Channel {
  id: string;
  name: string;
  handle: string;
  profile_url: string;
  banner_url: string;
  subscriber_count: string;
  video_count: number;
  auto_collect: boolean;
  push_status: 'active' | 'pending' | 'expired' | 'none';
  push_expires_at: string | null;
  last_collected_at: string | null;
  default_watch_duration_sec: number;
  default_prob_like: number;
  default_prob_comment: number;
  default_prob_subscribe: number;
  status: "active" | "paused" | "archived";
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ChannelVideo {
  id: string;
  title: string;
  thumbnail_url: string;
  completed_views: number;
  target_views: number;
  status: string;
}

const statusColors: Record<string, string> = {
  active: "bg-green-400 text-green-900 border-green-900",
  paused: "bg-yellow-400 text-yellow-900 border-yellow-900",
  archived: "bg-gray-400 text-gray-900 border-gray-900",
};

const statusLabels: Record<string, string> = {
  active: "활성",
  paused: "일시정지",
  archived: "보관",
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

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [channelVideos, setChannelVideos] = useState<ChannelVideo[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // 새 채널 등록 폼
  const [newChannel, setNewChannel] = useState({
    url: "",
    auto_collect: true,
  });

  useEffect(() => {
    fetchChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function fetchChannels() {
    setLoading(true);
    try {
      let query = supabase
        .from("channels")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("채널 목록 로드 실패:", error);
      } else {
        setChannels(data || []);
      }
    } catch (err) {
      console.error("채널 목록 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }

  // YouTube URL에서 Channel ID 또는 Handle 추출
  function extractChannelInfo(url: string): { type: "id" | "handle"; value: string } | null {
    // @handle 형식
    const handleMatch = url.match(/(?:youtube\.com\/@|^@)([a-zA-Z0-9_-]+)/);
    if (handleMatch) return { type: "handle", value: handleMatch[1] };

    // /channel/UC... 형식
    const channelMatch = url.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) return { type: "id", value: channelMatch[1] };

    // /c/CustomName 형식
    const customMatch = url.match(/youtube\.com\/c\/([a-zA-Z0-9_-]+)/);
    if (customMatch) return { type: "handle", value: customMatch[1] };

    // 직접 ID 입력 (UC로 시작)
    if (url.startsWith("UC") && url.length > 20) {
      return { type: "id", value: url };
    }

    // @handle 직접 입력
    if (url.startsWith("@")) {
      return { type: "handle", value: url.slice(1) };
    }

    return null;
  }

  async function handleAddChannel() {
    const channelInfo = extractChannelInfo(newChannel.url);
    if (!channelInfo) {
      alert("올바른 YouTube 채널 URL을 입력해주세요");
      return;
    }

    try {
      // Use real channel ID if available, otherwise use handle as identifier
      // Note: For handle-based entries, a backend resolver should be used to fetch the real channel ID
      const channelId = channelInfo.type === "id" ? channelInfo.value : null;
      const channelHandle = channelInfo.value;
      
      const { error } = await supabase.from("channels").insert({
        // Only set id if we have a real YouTube channel ID (starts with UC)
        ...(channelId ? { id: channelId } : {}),
        name: channelHandle,
        handle: channelHandle,
        auto_collect: newChannel.auto_collect,
        status: "active",
      });

      if (error) {
        if (error.code === "23505") {
          alert("이미 등록된 채널입니다");
        } else {
          alert("채널 등록에 실패했습니다: " + error.message);
        }
        return;
      }

      setIsAddDialogOpen(false);
      setNewChannel({
        url: "",
        auto_collect: true,
      });
      fetchChannels();
    } catch {
      alert("채널 등록에 실패했습니다");
    }
  }

  async function updateChannelStatus(channelId: string, status: Channel["status"]) {
    const { error } = await supabase
      .from("channels")
      .update({ status })
      .eq("id", channelId);

    if (error) {
      console.error("상태 변경 실패:", error);
    } else {
      fetchChannels();
    }
  }

  async function toggleAutoCollect(channelId: string, autoCollect: boolean) {
    const { error } = await supabase
      .from("channels")
      .update({ auto_collect: autoCollect })
      .eq("id", channelId);

    if (error) {
      console.error("자동 수집 설정 변경 실패:", error);
    } else {
      fetchChannels();
    }
  }

  const [collecting, setCollecting] = useState<string | null>(null);

  async function collectChannelVideos(channelId: string) {
    setCollecting(channelId);
    try {
      const res = await fetch(`/api/channels/${channelId}/collect`, { method: "POST" });
      const result = await res.json();
      if (result.success) {
        alert(result.data.message);
        fetchChannels();
      } else {
        alert(result.error?.message || "수집에 실패했습니다");
      }
    } catch {
      alert("수집 중 오류가 발생했습니다");
    } finally {
      setCollecting(null);
    }
  }

  async function openChannelDetail(channel: Channel) {
    setSelectedChannel(channel);
    setIsDetailOpen(true);

    // 채널의 등록된 영상 목록 가져오기
    const { data, error } = await supabase
      .from("videos")
      .select("id, title, thumbnail_url, completed_views, target_views, status")
      .eq("channel_id", channel.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("채널 영상 로드 실패:", error);
      setChannelVideos([]);
      return;
    }

    setChannelVideos(data || []);
  }

  async function deleteChannel(channelId: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("channels").delete().eq("id", channelId);

    if (error) {
      console.error("삭제 실패:", error);
    } else {
      fetchChannels();
    }
  }

  const filteredChannels = channels.filter(
    (c) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.handle?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 통계
  const stats = {
    total: channels.length,
    active: channels.filter((c) => c.status === "active").length,
    autoCollect: channels.filter((c) => c.auto_collect).length,
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-head text-foreground">채널 목록</h1>
          <p className="text-sm text-muted-foreground">
            모니터링할 YouTube 채널을 관리합니다
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              채널 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>새 채널 등록</DialogTitle>
              <DialogDescription>
                모니터링할 YouTube 채널을 등록합니다
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* YouTube 채널 URL */}
              <div className="space-y-2">
                <Label>YouTube 채널 URL</Label>
                <Input
                  placeholder="https://youtube.com/@channel 또는 채널 ID"
                  value={newChannel.url}
                  onChange={(e) =>
                    setNewChannel({ ...newChannel, url: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  @핸들, /channel/UC..., /c/이름 형식 모두 지원
                </p>
              </div>

              {/* 자동 수집 */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <Label>자동 영상 수집</Label>
                  <p className="text-xs text-muted-foreground">
                    새 영상이 업로드되면 자동으로 등록합니다
                  </p>
                </div>
                <Switch
                  checked={newChannel.auto_collect}
                  onCheckedChange={(checked) =>
                    setNewChannel({ ...newChannel, auto_collect: checked })
                  }
                />
              </div>

              {/* 글로벌 기본값 표시 */}
              <WatchSettingsReadonly />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddChannel} disabled={!newChannel.url}>
                등록
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <StatsCard label="전체 채널" value={stats.total} />
        <StatsCard variant="success" label="활성 채널" value={stats.active} />
        <StatsCard variant="info" label="자동 수집" value={stats.autoCollect} />
      </div>

      {/* 필터 & 검색 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="채널명, 핸들 검색..."
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
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="paused">일시정지</SelectItem>
            <SelectItem value="archived">보관</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">채널</TableHead>
              <TableHead>구독자</TableHead>
              <TableHead>자동 수집</TableHead>
              <TableHead>알림</TableHead>
              <TableHead>마지막 수집</TableHead>
              <TableHead>상태</TableHead>
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
            ) : filteredChannels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  등록된 채널이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filteredChannels.map((channel) => (
                <TableRow
                  key={channel.id}
                  className="cursor-pointer"
                  onClick={() => openChannelDetail(channel)}
                >
                  {/* 채널 정보 */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {channel.profile_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={channel.profile_url}
                          alt={channel.name}
                          className="h-10 w-10 rounded-full object-cover bg-muted border-2 border-foreground"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted border-2 border-foreground">
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-foreground truncate">{channel.name}</div>
                        <div className="text-xs text-muted-foreground">
                          @{channel.handle}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* 구독자 */}
                  <TableCell className="text-muted-foreground">
                    {channel.subscriber_count || "-"}
                  </TableCell>

                  {/* 자동 수집 */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={channel.auto_collect}
                      onCheckedChange={(checked) =>
                        toggleAutoCollect(channel.id, checked)
                      }
                    />
                  </TableCell>

                  {/* 푸시 알림 상태 */}
                  <TableCell>
                    {(() => {
                      const ps = channel.push_status || 'none';
                      const pushStyles: Record<string, string> = {
                        active: 'bg-green-400 text-green-900 border-green-900',
                        pending: 'bg-yellow-400 text-yellow-900 border-yellow-900',
                        expired: 'bg-red-400 text-red-900 border-red-900',
                        none: 'bg-gray-300 text-gray-700 border-gray-700',
                      };
                      const pushLabels: Record<string, string> = {
                        active: 'PUSH 활성',
                        pending: '대기중',
                        expired: '만료',
                        none: '미설정',
                      };
                      return (
                        <Badge className={`${pushStyles[ps]} border-2 font-bold text-[10px]`}>
                          {pushLabels[ps]}
                        </Badge>
                      );
                    })()}
                  </TableCell>

                  {/* 마지막 수집 */}
                  <TableCell className="text-muted-foreground">
                    {channel.last_collected_at
                      ? formatTimeAgo(channel.last_collected_at)
                      : "수집 전"}
                  </TableCell>

                  {/* 상태 */}
                  <TableCell>
                    <Badge
                      className={`${statusColors[channel.status]} border-2 font-bold`}
                    >
                      {statusLabels[channel.status]}
                    </Badge>
                  </TableCell>

                  {/* 액션 */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
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
                              `https://youtube.com/channel/${channel.id}`,
                              "_blank"
                            )
                          }
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          YouTube에서 보기
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={collecting === channel.id}
                          onClick={() => collectChannelVideos(channel.id)}
                        >
                          <RefreshCw className={`mr-2 h-4 w-4 ${collecting === channel.id ? 'animate-spin' : ''}`} />
                          {collecting === channel.id ? '수집중...' : '지금 수집'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {channel.status === "active" ? (
                          <DropdownMenuItem
                            onClick={() => updateChannelStatus(channel.id, "paused")}
                          >
                            <Pause className="mr-2 h-4 w-4" />
                            일시정지
                          </DropdownMenuItem>
                        ) : channel.status === "paused" ? (
                          <DropdownMenuItem
                            onClick={() => updateChannelStatus(channel.id, "active")}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            활성화
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-500"
                          onClick={() => deleteChannel(channel.id)}
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

      {/* 채널 상세 Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="w-[500px] sm:max-w-[500px]">
          {selectedChannel && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-4">
                  {selectedChannel.profile_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={selectedChannel.profile_url}
                      alt={selectedChannel.name}
                      className="h-16 w-16 rounded-full object-cover bg-muted"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <SheetTitle>{selectedChannel.name}</SheetTitle>
                    <SheetDescription>@{selectedChannel.handle}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <Tabs defaultValue="videos" className="mt-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="videos">등록된 영상</TabsTrigger>
                  <TabsTrigger value="settings">설정</TabsTrigger>
                </TabsList>

                <TabsContent value="videos" className="mt-4 space-y-4">
                  {channelVideos.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      등록된 영상이 없습니다
                    </div>
                  ) : (
                    channelVideos.map((video) => (
                      <div
                        key={video.id}
                        className="flex items-center gap-3 rounded-lg border border-border p-3"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={video.thumbnail_url || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                          alt={video.title}
                          className="h-12 w-20 rounded object-cover bg-muted"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {video.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {video.completed_views}/{video.target_views} 완료
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {video.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="settings" className="mt-4 space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">자동 수집</div>
                        <div className="text-xs text-muted-foreground">
                          새 영상 업로드 시 자동 등록
                        </div>
                      </div>
                      <Switch
                        checked={selectedChannel.auto_collect}
                        onCheckedChange={(checked) =>
                          toggleAutoCollect(selectedChannel.id, checked)
                        }
                      />
                    </div>

                    {/* Push notification status */}
                    <div className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium text-foreground">Push 알림</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-muted-foreground">상태</div>
                        <div className="text-foreground">
                          {{
                            active: 'PUSH 활성',
                            pending: '대기중',
                            expired: '만료',
                            none: '미설정',
                          }[selectedChannel.push_status || 'none']}
                        </div>
                        {selectedChannel.push_expires_at && (
                          <>
                            <div className="text-muted-foreground">만료일</div>
                            <div className="text-foreground">
                              {new Date(selectedChannel.push_expires_at).toLocaleDateString('ko-KR')}
                            </div>
                          </>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={() => alert('WebSub 연동 필요')}
                      >
                        <Bell className="h-3 w-3 mr-1.5" />
                        알림 갱신
                      </Button>
                    </div>

                    {/* Watch settings readonly */}
                    <WatchSettingsReadonly />

                    <div className="rounded-lg border border-border p-4 space-y-2">
                      <div className="text-sm font-medium text-foreground">채널 정보</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-muted-foreground">구독자</div>
                        <div className="text-foreground">{selectedChannel.subscriber_count || "-"}</div>
                        <div className="text-muted-foreground">영상 수</div>
                        <div className="text-foreground">{selectedChannel.video_count || 0}개</div>
                        <div className="text-muted-foreground">마지막 수집</div>
                        <div className="text-foreground">
                          {selectedChannel.last_collected_at
                            ? formatTimeAgo(selectedChannel.last_collected_at)
                            : "수집 전"}
                        </div>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      disabled={collecting === selectedChannel.id}
                      onClick={() => collectChannelVideos(selectedChannel.id)}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${collecting === selectedChannel.id ? 'animate-spin' : ''}`} />
                      {collecting === selectedChannel.id ? '수집중...' : '지금 영상 수집'}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
