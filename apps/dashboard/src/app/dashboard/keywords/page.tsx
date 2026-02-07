"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Hash,
  Clock,
  TrendingUp,
  Edit,
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
  Label,
  Slider,
  Textarea,
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

interface Keyword {
  id: number;
  keyword: string;
  category: string | null;
  is_active: boolean;
  collect_interval_hours: number;
  max_results: number;
  discovered_count: number;
  used_count: number;
  last_collected_at: string | null;
  min_views: number;
  min_duration_sec: number;
  max_duration_sec: number;
  exclude_keywords: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

const categoryOptions = [
  { value: "tech", label: "테크" },
  { value: "music", label: "음악" },
  { value: "game", label: "게임" },
  { value: "entertainment", label: "엔터테인먼트" },
  { value: "education", label: "교육" },
  { value: "lifestyle", label: "라이프스타일" },
  { value: "news", label: "뉴스" },
  { value: "sports", label: "스포츠" },
  { value: "auto", label: "자동생성" },
  { value: "other", label: "기타" },
];

const categoryColors: Record<string, string> = {
  tech: "bg-blue-400 text-blue-900 border-blue-900",
  music: "bg-purple-400 text-purple-900 border-purple-900",
  game: "bg-green-400 text-green-900 border-green-900",
  entertainment: "bg-pink-400 text-pink-900 border-pink-900",
  education: "bg-yellow-400 text-yellow-900 border-yellow-900",
  lifestyle: "bg-orange-400 text-orange-900 border-orange-900",
  news: "bg-red-400 text-red-900 border-red-900",
  sports: "bg-cyan-400 text-cyan-900 border-cyan-900",
  auto: "bg-gray-400 text-gray-900 border-gray-900",
  other: "bg-gray-400 text-gray-900 border-gray-900",
};

// 시간 포맷 함수
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Handle future dates
  if (diffMs < 0) {
    return "예정됨";
  }

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
  return `${Math.floor(seconds / 3600)}시간`;
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<Keyword | null>(null);

  // 새 키워드 등록 폼
  const [newKeyword, setNewKeyword] = useState({
    keyword: "",
    category: "other",
    is_active: true,
    collect_interval_hours: 12,
    max_results: 10,
    min_views: 0,
    min_duration_sec: 30,
    max_duration_sec: 3600,
    exclude_keywords: "",
  });

  // 대량 등록 모드
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkKeywords, setBulkKeywords] = useState("");

  useEffect(() => {
    fetchKeywords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  async function fetchKeywords() {
    setLoading(true);
    try {
      let query = supabase
        .from("keywords")
        .select("*")
        .order("created_at", { ascending: false });

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("키워드 목록 로드 실패:", error);
      } else {
        setKeywords(data || []);
      }
    } catch (err) {
      console.error("키워드 목록 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddKeyword() {
    if (!newKeyword.keyword.trim()) {
      alert("키워드를 입력해주세요");
      return;
    }

    const excludeArr = newKeyword.exclude_keywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k);

    const { error } = await supabase.from("keywords").insert({
      keyword: newKeyword.keyword.trim(),
      category: newKeyword.category,
      is_active: newKeyword.is_active,
      collect_interval_hours: newKeyword.collect_interval_hours,
      max_results: newKeyword.max_results,
      min_views: newKeyword.min_views,
      min_duration_sec: newKeyword.min_duration_sec,
      max_duration_sec: newKeyword.max_duration_sec,
      exclude_keywords: excludeArr,
    });

    if (error) {
      if (error.code === "23505") {
        alert("이미 등록된 키워드입니다");
      } else {
        alert("키워드 등록에 실패했습니다: " + error.message);
      }
      return;
    }

    setIsAddDialogOpen(false);
    resetNewKeywordForm();
    fetchKeywords();
  }

  async function handleBulkAdd() {
    const keywordList = bulkKeywords
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k);

    if (keywordList.length === 0) {
      alert("키워드를 입력해주세요");
      return;
    }

    const insertData = keywordList.map((keyword) => ({
      keyword,
      category: newKeyword.category,
      is_active: true,
      collect_interval_hours: newKeyword.collect_interval_hours,
      max_results: newKeyword.max_results,
      min_views: newKeyword.min_views,
      min_duration_sec: newKeyword.min_duration_sec,
      max_duration_sec: newKeyword.max_duration_sec,
      exclude_keywords: [],
    }));

    const { data, error } = await supabase
      .from("keywords")
      .upsert(insertData, { onConflict: "keyword", ignoreDuplicates: true })
      .select();

    if (error) {
      alert("대량 등록에 실패했습니다: " + error.message);
      return;
    }

    alert(`${data?.length || 0}개의 키워드가 등록되었습니다`);
    setIsAddDialogOpen(false);
    setBulkKeywords("");
    setIsBulkMode(false);
    resetNewKeywordForm();
    fetchKeywords();
  }

  function resetNewKeywordForm() {
    setNewKeyword({
      keyword: "",
      category: "other",
      is_active: true,
      collect_interval_hours: 12,
      max_results: 10,
      min_views: 0,
      min_duration_sec: 30,
      max_duration_sec: 3600,
      exclude_keywords: "",
    });
  }

  async function handleEditKeyword() {
    if (!editingKeyword) return;

    const excludeArr =
      typeof editingKeyword.exclude_keywords === "string"
        ? (editingKeyword.exclude_keywords as unknown as string)
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k)
        : editingKeyword.exclude_keywords;

    const { error } = await supabase
      .from("keywords")
      .update({
        keyword: editingKeyword.keyword,
        category: editingKeyword.category,
        collect_interval_hours: editingKeyword.collect_interval_hours,
        max_results: editingKeyword.max_results,
        min_views: editingKeyword.min_views,
        min_duration_sec: editingKeyword.min_duration_sec,
        max_duration_sec: editingKeyword.max_duration_sec,
        exclude_keywords: excludeArr,
      })
      .eq("id", editingKeyword.id);

    if (error) {
      alert("수정에 실패했습니다: " + error.message);
      return;
    }

    setIsEditDialogOpen(false);
    setEditingKeyword(null);
    fetchKeywords();
  }

  async function toggleKeywordActive(id: number, isActive: boolean) {
    const { error } = await supabase
      .from("keywords")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      console.error("상태 변경 실패:", error);
      alert(`키워드 상태 변경에 실패했습니다: ${error.message}`);
    } else {
      fetchKeywords();
    }
  }

  const [collectingId, setCollectingId] = useState<number | null>(null);

  async function collectKeyword(id: number, _keyword: string) {
    setCollectingId(id);
    try {
      const res = await fetch(`/api/keywords/${id}/collect`, { method: "POST" });
      const result = await res.json();
      if (result.success) {
        alert(result.data.message);
        fetchKeywords();
      } else {
        alert(result.error?.message || "수집에 실패했습니다");
      }
    } catch {
      alert("수집 중 오류가 발생했습니다");
    } finally {
      setCollectingId(null);
    }
  }

  async function deleteKeyword(id: number) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("keywords").delete().eq("id", id);

    if (error) {
      console.error("삭제 실패:", error);
      alert(`키워드 삭제에 실패했습니다: ${error.message}`);
    } else {
      fetchKeywords();
    }
  }

  function openEditDialog(keyword: Keyword) {
    setEditingKeyword({
      ...keyword,
      exclude_keywords: keyword.exclude_keywords || [],
    });
    setIsEditDialogOpen(true);
  }

  const filteredKeywords = keywords.filter((k) =>
    k.keyword.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 통계
  const stats = {
    total: keywords.length,
    active: keywords.filter((k) => k.is_active).length,
    totalDiscovered: keywords.reduce((sum, k) => sum + (k.discovered_count || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-head text-foreground">키워드 관리</h1>
          <p className="text-sm text-muted-foreground">
            YouTube 검색에 사용할 키워드를 관리합니다
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              키워드 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>새 키워드 등록</DialogTitle>
              <DialogDescription>
                YouTube에서 검색할 키워드를 등록합니다
              </DialogDescription>
            </DialogHeader>

            {/* 모드 전환 탭 */}
            <div className="flex gap-2 border-b border-border pb-2">
              <Button
                variant={isBulkMode ? "ghost" : "secondary"}
                size="sm"
                onClick={() => setIsBulkMode(false)}
              >
                단일 등록
              </Button>
              <Button
                variant={isBulkMode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setIsBulkMode(true)}
              >
                대량 등록
              </Button>
            </div>

            <div className="grid gap-4 py-4">
              {isBulkMode ? (
                /* 대량 등록 모드 */
                <>
                  <div className="space-y-2">
                    <Label>키워드 목록 (줄바꿈으로 구분)</Label>
                    <Textarea
                      placeholder={`아이폰16\n갤럭시 S25\n맥북 프로 M4\n...`}
                      value={bulkKeywords}
                      onChange={(e) => setBulkKeywords(e.target.value)}
                      rows={8}
                    />
                    <p className="text-xs text-muted-foreground">
                      {bulkKeywords.split("\n").filter((k) => k.trim()).length}개
                      키워드
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>카테고리</Label>
                    <Select
                      value={newKeyword.category}
                      onValueChange={(v) =>
                        setNewKeyword({ ...newKeyword, category: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                /* 단일 등록 모드 */
                <>
                  <div className="space-y-2">
                    <Label>키워드</Label>
                    <Input
                      placeholder="검색할 키워드 입력"
                      value={newKeyword.keyword}
                      onChange={(e) =>
                        setNewKeyword({ ...newKeyword, keyword: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>카테고리</Label>
                    <Select
                      value={newKeyword.category}
                      onValueChange={(v) =>
                        setNewKeyword({ ...newKeyword, category: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>수집 주기: {newKeyword.collect_interval_hours}시간</Label>
                      <Slider
                        value={[newKeyword.collect_interval_hours]}
                        onValueChange={([v]) =>
                          setNewKeyword({ ...newKeyword, collect_interval_hours: v })
                        }
                        min={1}
                        max={72}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>최대 수집: {newKeyword.max_results}개</Label>
                      <Slider
                        value={[newKeyword.max_results]}
                        onValueChange={([v]) =>
                          setNewKeyword({ ...newKeyword, max_results: v })
                        }
                        min={5}
                        max={50}
                        step={5}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <h4 className="font-medium font-head text-foreground">필터링 조건</h4>

                    <div className="space-y-2">
                      <Label>최소 조회수: {newKeyword.min_views.toLocaleString()}</Label>
                      <Slider
                        value={[newKeyword.min_views]}
                        onValueChange={([v]) =>
                          setNewKeyword({ ...newKeyword, min_views: v })
                        }
                        min={0}
                        max={100000}
                        step={1000}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>최소 길이: {formatDuration(newKeyword.min_duration_sec)}</Label>
                        <Slider
                          value={[newKeyword.min_duration_sec]}
                          onValueChange={([v]) =>
                            setNewKeyword({ ...newKeyword, min_duration_sec: v })
                          }
                          min={0}
                          max={600}
                          step={30}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>최대 길이: {formatDuration(newKeyword.max_duration_sec)}</Label>
                        <Slider
                          value={[newKeyword.max_duration_sec]}
                          onValueChange={([v]) =>
                            setNewKeyword({ ...newKeyword, max_duration_sec: v })
                          }
                          min={60}
                          max={7200}
                          step={60}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>제외할 키워드 (쉼표로 구분)</Label>
                      <Input
                        placeholder="광고, 홍보, Shorts"
                        value={newKeyword.exclude_keywords}
                        onChange={(e) =>
                          setNewKeyword({
                            ...newKeyword,
                            exclude_keywords: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={isBulkMode ? handleBulkAdd : handleAddKeyword}>
                {isBulkMode ? "대량 등록" : "등록"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <StatsCard label="전체 키워드" value={stats.total} />
        <StatsCard variant="success" label="활성 키워드" value={stats.active} />
        <StatsCard variant="info" label="총 발견 영상" value={stats.totalDiscovered.toLocaleString()} />
      </div>

      {/* 필터 & 검색 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="키워드 검색..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {categoryOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">키워드</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>수집 주기</TableHead>
              <TableHead>발견 영상</TableHead>
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
            ) : filteredKeywords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  등록된 키워드가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filteredKeywords.map((keyword) => (
                <TableRow key={keyword.id}>
                  {/* 키워드 */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="font-bold text-foreground">{keyword.keyword}</span>
                    </div>
                    {keyword.exclude_keywords?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {keyword.exclude_keywords.slice(0, 3).map((ex, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            <X className="mr-1 h-2 w-2" />
                            {ex}
                          </Badge>
                        ))}
                        {keyword.exclude_keywords.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{keyword.exclude_keywords.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* 카테고리 */}
                  <TableCell>
                    {keyword.category ? (
                      <Badge
                        className={`${categoryColors[keyword.category] || "bg-gray-400 text-gray-900 border-gray-900"} border-2 font-bold`}
                      >
                        {categoryOptions.find((o) => o.value === keyword.category)?.label ||
                          keyword.category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* 수집 주기 */}
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {keyword.collect_interval_hours}시간
                    </div>
                    <div className="text-xs text-muted-foreground">
                      최대 {keyword.max_results}개
                    </div>
                  </TableCell>

                  {/* 발견 영상 */}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="font-bold text-foreground">
                        {(keyword.discovered_count || 0).toLocaleString()}
                      </span>
                    </div>
                  </TableCell>

                  {/* 마지막 수집 */}
                  <TableCell className="text-muted-foreground">
                    {keyword.last_collected_at
                      ? formatTimeAgo(keyword.last_collected_at)
                      : "수집 전"}
                  </TableCell>

                  {/* 상태 */}
                  <TableCell>
                    <Switch
                      checked={keyword.is_active}
                      onCheckedChange={(checked) =>
                        toggleKeywordActive(keyword.id, checked)
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
                        <DropdownMenuItem
                          disabled={collectingId === keyword.id}
                          onClick={() => collectKeyword(keyword.id, keyword.keyword)}
                        >
                          <RefreshCw className={`mr-2 h-4 w-4 ${collectingId === keyword.id ? 'animate-spin' : ''}`} />
                          {collectingId === keyword.id ? '수집중...' : '지금 수집'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(keyword)}>
                          <Edit className="mr-2 h-4 w-4" />
                          수정
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-500"
                          onClick={() => deleteKeyword(keyword.id)}
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

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>키워드 수정</DialogTitle>
            <DialogDescription>키워드 설정을 수정합니다</DialogDescription>
          </DialogHeader>
          {editingKeyword && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>키워드</Label>
                <Input
                  value={editingKeyword.keyword}
                  onChange={(e) =>
                    setEditingKeyword({ ...editingKeyword, keyword: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>카테고리</Label>
                <Select
                  value={editingKeyword.category || "other"}
                  onValueChange={(v) =>
                    setEditingKeyword({ ...editingKeyword, category: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>수집 주기: {editingKeyword.collect_interval_hours}시간</Label>
                  <Slider
                    value={[editingKeyword.collect_interval_hours]}
                    onValueChange={([v]) =>
                      setEditingKeyword({ ...editingKeyword, collect_interval_hours: v })
                    }
                    min={1}
                    max={72}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>최대 수집: {editingKeyword.max_results}개</Label>
                  <Slider
                    value={[editingKeyword.max_results]}
                    onValueChange={([v]) =>
                      setEditingKeyword({ ...editingKeyword, max_results: v })
                    }
                    min={5}
                    max={50}
                    step={5}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-border p-4">
                <h4 className="font-medium font-head text-foreground">필터링 조건</h4>

                <div className="space-y-2">
                  <Label>최소 조회수: {editingKeyword.min_views.toLocaleString()}</Label>
                  <Slider
                    value={[editingKeyword.min_views]}
                    onValueChange={([v]) =>
                      setEditingKeyword({ ...editingKeyword, min_views: v })
                    }
                    min={0}
                    max={100000}
                    step={1000}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>최소 길이: {formatDuration(editingKeyword.min_duration_sec)}</Label>
                    <Slider
                      value={[editingKeyword.min_duration_sec]}
                      onValueChange={([v]) =>
                        setEditingKeyword({ ...editingKeyword, min_duration_sec: v })
                      }
                      min={0}
                      max={600}
                      step={30}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>최대 길이: {formatDuration(editingKeyword.max_duration_sec)}</Label>
                    <Slider
                      value={[editingKeyword.max_duration_sec]}
                      onValueChange={([v]) =>
                        setEditingKeyword({ ...editingKeyword, max_duration_sec: v })
                      }
                      min={60}
                      max={7200}
                      step={60}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>제외할 키워드 (쉼표로 구분)</Label>
                  <Input
                    placeholder="광고, 홍보, Shorts"
                    value={
                      Array.isArray(editingKeyword.exclude_keywords)
                        ? editingKeyword.exclude_keywords.join(", ")
                        : String(editingKeyword.exclude_keywords || "")
                    }
                    onChange={(e) =>
                      setEditingKeyword({
                        ...editingKeyword,
                        exclude_keywords: e.target.value.split(",").map(k => k.trim()).filter(k => k),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleEditKeyword}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
