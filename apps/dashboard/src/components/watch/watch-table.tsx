"use client";

import { useState } from "react";
import Link from "next/link";
import {
  WatchSession,
  WATCH_STATUS_LABELS,
  WATCH_STATUS_COLORS,
  REGISTRATION_METHOD_LABELS,
} from "@/lib/watch-types";
import {
  toggleWatchPriority,
  toggleWatchPause,
  deleteWatchSession,
} from "@/lib/watch-api";
import { WatchStatusModal } from "@/components/watch/watch-status-modal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Eye, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface WatchTableProps {
  sessions: WatchSession[];
  loading?: boolean;
  onRefresh: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}

export function WatchTable({ sessions, loading, onRefresh }: WatchTableProps) {
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<WatchSession | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<WatchSession | null>(
    null
  );
  const [actionLoading, setActionLoading] = useState<{
    [key: string]: boolean;
  }>({});

  const setLoading = (sessionId: string, isLoading: boolean) => {
    setActionLoading((prev) => ({ ...prev, [sessionId]: isLoading }));
  };

  const handlePriorityToggle = async (
    session: WatchSession,
    checked: boolean
  ) => {
    const loadingKey = `priority-${session.watch_id}`;
    setLoading(loadingKey, true);
    try {
      await toggleWatchPriority(session.id, checked);
      toast.success("우선순위가 업데이트되었습니다.");
      onRefresh();
    } catch (error) {
      toast.error("요청을 처리하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(loadingKey, false);
    }
  };

  const handlePauseToggle = async (session: WatchSession) => {
    const loadingKey = `pause-${session.watch_id}`;
    setLoading(loadingKey, true);
    try {
      const shouldPause = !session.paused;
      await toggleWatchPause(session.id, shouldPause);
      toast.success(
        shouldPause ? "시청이 일시정지되었습니다." : "시청이 재개되었습니다."
      );
      onRefresh();
    } catch (error) {
      toast.error("요청을 처리하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(loadingKey, false);
    }
  };

  const handleDeleteClick = (session: WatchSession) => {
    setSessionToDelete(session);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    const loadingKey = `delete-${sessionToDelete.watch_id}`;
    setLoading(loadingKey, true);
    try {
      await deleteWatchSession(sessionToDelete.id);
      toast.success("시청이 삭제되었습니다.");
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
      onRefresh();
    } catch (error) {
      toast.error("요청을 처리하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(loadingKey, false);
    }
  };

  const handleStatusClick = (session: WatchSession) => {
    setSelectedSession(session);
    setStatusModalOpen(true);
  };

  if (loading) {
    return (
      <div className="rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0px_0px] shadow-foreground overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  시청 고유번호
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  상태
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  영상
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  채널
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  등록방법
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  현재 시청중
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  우선순위
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  시작/생성일
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  액션
                </th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="border-t-2 border-foreground">
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-6 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-32" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-6 w-10" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-32" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0px_0px] shadow-foreground p-12 text-center">
        <h3 className="text-xl font-bold mb-2">아직 시청이 없습니다</h3>
        <p className="text-muted-foreground mb-6">
          새 시청을 생성하거나 영상을 등록하면 여기에서 진행 상태를 확인할 수
          있어요.
        </p>
        <Button asChild>
          <Link href="/dashboard/register">새 시청 만들기</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0px_0px] shadow-foreground overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  시청 고유번호
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  상태
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  영상
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  채널
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  등록방법
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  현재 시청중
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  우선순위
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  시작/생성일
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase">
                  액션
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const statusColor = WATCH_STATUS_COLORS[session.status];
                const isPauseLoading =
                  actionLoading[`pause-${session.watch_id}`];
                const isPriorityLoading =
                  actionLoading[`priority-${session.watch_id}`];
                const isDeleteLoading =
                  actionLoading[`delete-${session.watch_id}`];

                return (
                  <tr
                    key={session.watch_id}
                    className="border-t-2 border-foreground hover:bg-muted/30 transition-colors"
                  >
                    {/* 시청 고유번호 */}
                    <td className="px-4 py-3 text-sm">
                      <code className="font-mono text-xs">
                        {session.watch_id || "—"}
                      </code>
                    </td>

                    {/* 상태 */}
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex items-center rounded-md border-2 px-2 py-0.5 text-xs font-bold ${statusColor}`}
                      >
                        {WATCH_STATUS_LABELS[session.status]}
                      </span>
                    </td>

                    {/* 영상 */}
                    <td className="px-4 py-3 text-sm">
                      <div className="max-w-[200px]">
                        <div className="truncate font-medium">
                          {session.video_title || "제목 없음"}
                        </div>
                        <code className="text-xs text-muted-foreground font-mono">
                          {session.video_id}
                        </code>
                      </div>
                    </td>

                    {/* 채널 */}
                    <td className="px-4 py-3 text-sm">
                      {session.channel_handle ? (
                        <span className="text-muted-foreground">
                          @{session.channel_handle}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* 등록방법 */}
                    <td className="px-4 py-3 text-sm">
                      {REGISTRATION_METHOD_LABELS[
                        session.registration_method
                      ] || "직접 등록"}
                    </td>

                    {/* 현재 시청중 */}
                    <td className="px-4 py-3 text-sm">
                      {session.viewing_device_count !== undefined &&
                      session.node_count !== undefined ? (
                        <span className="text-xs">
                          디바이스 {session.viewing_device_count}대 / 노드{" "}
                          {session.node_count}개
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* 우선순위 */}
                    <td className="px-4 py-3 text-sm">
                      <Switch
                        checked={session.priority_enabled}
                        onCheckedChange={(checked) =>
                          handlePriorityToggle(session, checked)
                        }
                        disabled={isPriorityLoading}
                      />
                    </td>

                    {/* 시작/생성일 */}
                    <td className="px-4 py-3 text-sm">
                      <span className="text-xs">
                        {formatDate(session.started_at || session.created_at)}
                      </span>
                    </td>

                    {/* 액션 */}
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <Button
                          variant="noShadow"
                          size="sm"
                          onClick={() => handleStatusClick(session)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          시청 현황
                        </Button>
                        <Button
                          variant="noShadow"
                          size="sm"
                          onClick={() => handlePauseToggle(session)}
                          disabled={isPauseLoading}
                        >
                          {session.paused ? (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              재개
                            </>
                          ) : (
                            <>
                              <Pause className="h-4 w-4 mr-1" />
                              일시정지
                            </>
                          )}
                        </Button>
                        <Button
                          variant="noShadow"
                          size="sm"
                          onClick={() => handleDeleteClick(session)}
                          disabled={isDeleteLoading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Watch Status Modal */}
      <WatchStatusModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        sessionId={selectedSession?.id || null}
        sessionTitle={selectedSession?.video_title}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>시청을 삭제할까요?</DialogTitle>
            <DialogDescription>
              삭제하면 복구할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={
                sessionToDelete
                  ? actionLoading[`delete-${sessionToDelete.watch_id}`]
                  : false
              }
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
