"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WatchTable } from "@/components/watch/watch-table";
import { fetchWatchSessions } from "@/lib/watch-api";
import type { WatchSession } from "@/lib/watch-types";
import { Eye, PlusCircle, Search, AlertCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@packages/ui";

export default function WatchPage() {
  const [sessions, setSessions] = useState<WatchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const pageSize = 20;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWatchSessions({
        page,
        pageSize,
        status: statusFilter,
        search: search.trim() || undefined,
      });
      setSessions(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err) {
      setError("시청 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      toast.error("시청 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const statusFilters = [
    { value: "all", label: "전체" },
    { value: "active", label: "진행중" },
    { value: "paused", label: "일시정지" },
    { value: "pending", label: "대기열" },
    { value: "completed", label: "완료" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-head font-bold text-foreground flex items-center gap-2">
            <Eye className="h-6 w-6 text-primary" />
            시청관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            등록된 시청의 진행 상태를 관리합니다
          </p>
        </div>
        <Link href="/dashboard/register">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 border-2 border-foreground shadow-[3px_3px_0px_0px] shadow-foreground font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <PlusCircle className="h-4 w-4 mr-2" />
            새 시청
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter pills */}
        <div className="flex gap-1.5">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md border-2 border-foreground transition-colors ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground shadow-[2px_2px_0px_0px] shadow-foreground"
                  : "bg-card text-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="영상 제목, 채널 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); loadData(); } }}
            className="pl-9 border-2 border-foreground"
          />
        </div>
      </div>

      {/* Error State */}
      {error && !loading && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/20 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-foreground font-bold">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData} className="mt-3 border-2 border-foreground">
            <RefreshCw className="h-4 w-4 mr-1" />
            다시 시도
          </Button>
        </div>
      )}

      {/* Table */}
      {!error && (
        <WatchTable
          sessions={sessions}
          loading={loading}
          onRefresh={loadData}
        />
      )}

      {/* Pagination */}
      {!error && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            총 <span className="font-bold text-foreground">{total}</span>건
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setPage(pageNum)}
                      isActive={page === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
