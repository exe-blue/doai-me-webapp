'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  PlayCircle,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Timer,
  History,
  Terminal,
  ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSocketContext } from '@/contexts/socket-context';
import { JobCreateModal, type CreateJobResponse } from '@/components/jobs/job-create-modal';
import { JobCard, type Job } from '@/components/jobs/job-card';
import { LogDrawer } from '@/components/jobs/log-drawer';
import { cn } from '@/lib/utils';

// =============================================
// Types
// =============================================

interface JobProgress {
  jobId: string;
  progressPercent: number;
  currentStep: number;
  totalSteps: number;
  deviceSerial?: string;
  status?: string;
  startedAt?: number;
}

// 페이지네이션 상수
const HISTORY_PAGE_SIZE = 10;

// =============================================
// 유틸리티 함수
// =============================================

/**
 * YouTube 영상 ID 추출
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&?/]+)/,
    /youtube\.com\/shorts\/([^&?/]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * 시간 포맷팅 (초 -> MM:SS)
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// =============================================
// Main Component
// =============================================

export default function JobsPage() {
  const { isConnected, devices, socket } = useSocketContext();
  
  // 모달 상태
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [selectedJobForLogs, setSelectedJobForLogs] = useState<Job | null>(null);
  
  // 작업 데이터
  const [jobs, setJobs] = useState<Job[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // 실시간 프로그레스 상태
  const [jobProgressMap, setJobProgressMap] = useState<Record<string, JobProgress>>({});
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});
  
  // 히스토리 페이지네이션
  const [historyPage, setHistoryPage] = useState(1);

  const idleDevices = devices.filter(d => d.status === 'idle');

  // =============================================
  // Data Fetching
  // =============================================

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  }, []);

  const fetchCompletedJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs?status=completed&limit=100');
      const data = await response.json();
      setCompletedJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch completed jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchCompletedJobs();
    const interval = setInterval(() => {
      fetchJobs();
      fetchCompletedJobs();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs, fetchCompletedJobs]);

  // =============================================
  // Socket.io Real-time Updates
  // =============================================

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleJobProgress = (data: JobProgress) => {
      setJobProgressMap(prev => ({
        ...prev,
        [data.jobId]: { ...data, startedAt: data.startedAt || prev[data.jobId]?.startedAt },
      }));
    };

    const handleJobCompleted = () => {
      fetchJobs();
      fetchCompletedJobs();
    };

    const handleJobStarted = (data: { jobId: string }) => {
      setJobProgressMap(prev => ({
        ...prev,
        [data.jobId]: {
          jobId: data.jobId,
          progressPercent: 0,
          currentStep: 0,
          totalSteps: 12,
          status: 'running',
          startedAt: Date.now(),
        },
      }));
      setElapsedTimes(prev => ({ ...prev, [data.jobId]: 0 }));
    };

    socket.on('job:progress', handleJobProgress);
    socket.on('job:completed', handleJobCompleted);
    socket.on('job:failed', handleJobCompleted);
    socket.on('job:started', handleJobStarted);

    return () => {
      socket.off('job:progress', handleJobProgress);
      socket.off('job:completed', handleJobCompleted);
      socket.off('job:failed', handleJobCompleted);
      socket.off('job:started', handleJobStarted);
    };
  }, [socket, isConnected, fetchJobs, fetchCompletedJobs]);

  // Elapsed time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTimes(prev => {
        const updated = { ...prev };
        Object.keys(jobProgressMap).forEach(jobId => {
          if (jobProgressMap[jobId]?.startedAt) {
            updated[jobId] = Math.floor((Date.now() - jobProgressMap[jobId].startedAt!) / 1000);
          }
        });
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [jobProgressMap]);

  // =============================================
  // Queue Processing
  // =============================================

  // 현재 실행 중인 작업 (Running) - 맨 아래에 표시됨
  const runningJob = useMemo(() => 
    jobs.find(j => j.status === 'active' && j.stats && j.stats.running > 0),
    [jobs]
  );

  // 대기 중인 작업 (Pending) - 위에서 아래로 쌓임
  const pendingJobs = useMemo(() => 
    jobs
      .filter(j => j !== runningJob)
      .sort((a, b) => {
        // Priority DESC, then created_at ASC
        if (a.priority !== b.priority) return a.priority ? -1 : 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }),
    [jobs, runningJob]
  );

  // 히스토리 페이지네이션
  const historyTotalPages = Math.ceil(completedJobs.length / HISTORY_PAGE_SIZE);
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return completedJobs.slice(start, start + HISTORY_PAGE_SIZE);
  }, [completedJobs, historyPage]);

  // =============================================
  // Event Handlers
  // =============================================

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchJobs(), fetchCompletedJobs()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleJobCreated = (response: CreateJobResponse) => {
    toast.success(`작업 생성: ${response.job.title}`);
    fetchJobs();
    if (isConnected && socket && response.assignments.length > 0) {
      socket.emit('job:distribute', {
        assignments: response.assignments,
        job: response.job,
      });
    }
  };

  const handleTogglePriority = async (job: Job) => {
    setActionLoading(job.id);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: !job.priority }),
      });
      if (!response.ok) throw new Error('Failed to update priority');
      toast.success(job.priority ? '우선순위 해제' : '우선순위 설정');
      await fetchJobs();
    } catch (err) {
      console.error('Failed to toggle priority:', err);
      toast.error('우선순위 변경 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePauseResume = async (job: Job) => {
    setActionLoading(job.id);
    try {
      const newStatus = job.status === 'active' ? 'paused' : 'active';
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error('Failed to update job');
      if (socket && isConnected) {
        socket.emit(newStatus === 'paused' ? 'job:pause' : 'job:resume', { jobId: job.id });
      }
      await fetchJobs();
    } catch (err) {
      console.error('Failed to pause/resume job:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (job: Job) => {
    if (!confirm(`"${job.display_name || job.title}" 작업을 삭제하시겠습니까?`)) return;
    setActionLoading(job.id);
    try {
      if (socket && isConnected) {
        socket.emit('job:cancel', { jobId: job.id });
      }
      const response = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete job');
      await fetchJobs();
    } catch (err) {
      console.error('Failed to delete job:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // 작업에 할당된 디바이스 ID 조회 (실시간 진행 정보 또는 디바이스 목록에서 조회)
  const getDeviceIdForJob = useCallback((job: Job): string | undefined => {
    // 1. 실시간 진행 정보에서 deviceSerial로 조회
    const progress = jobProgressMap[job.id];
    if (progress?.deviceSerial) {
      // devices 목록에서 serial로 device id 찾기
      const device = devices.find(d => d.serial_number === progress.deviceSerial);
      if (device) return device.id;
    }
    
    // 2. 실행 중인 작업의 경우, busy 상태인 디바이스 중 첫 번째 반환
    // (다수 디바이스가 동시 실행 중인 경우 첫 번째만 표시 - 추후 개선 가능)
    if (job.stats?.running && job.stats.running > 0) {
      // 현재 busy 중인 디바이스 찾기 (busy = 작업 실행 중)
      const busyDevice = devices.find(d => d.status === 'busy');
      if (busyDevice) return busyDevice.id;
    }
    
    return undefined;
  }, [jobProgressMap, devices]);

  const handleOpenLogs = useCallback((job: Job) => {
    setSelectedJobForLogs(job);
    setLogDrawerOpen(true);
  }, []);

  const handleCloseLogs = useCallback(() => {
    setLogDrawerOpen(false);
    setSelectedJobForLogs(null);
  }, []);

  // =============================================
  // Render
  // =============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ================================================== */}
      {/* Header */}
      {/* ================================================== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono font-bold text-foreground">작업 타임라인</h1>
          <div className="flex items-center gap-2 mt-2">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                isConnected
                  ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                  : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
              )}
            />
            <span className="font-mono text-xs text-zinc-400">
              대기: {idleDevices.length}대 | 온라인: {devices.filter(d => d.status !== 'offline').length}대
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="font-mono text-xs"
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', isRefreshing && 'animate-spin')} />
            새로고침
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="font-mono text-xs bg-green-600 hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            새 작업
          </Button>
        </div>
      </div>

      {/* ================================================== */}
      {/* Section: Queue (Vertical Stack Timeline) */}
      {/* Running at bottom, Pending stacked above */}
      {/* ================================================== */}
      <div className="rounded-lg border border-zinc-800 bg-black/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="font-mono text-sm font-bold text-white">작업 큐</span>
            <span className="font-mono text-xs text-zinc-500">
              ({jobs.length}개 {runningJob ? '• 1개 실행중' : ''})
            </span>
          </div>
          <div className="flex items-center gap-1 text-zinc-500">
            <ArrowDown className="h-3 w-3" />
            <span className="font-mono text-[10px]">실행 방향</span>
          </div>
        </div>

        {/* Queue Content - flex-col-reverse로 Running이 아래에 오도록 */}
        <div className="p-3 min-h-[200px]">
          {jobs.length === 0 ? (
            // Empty State
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <PlayCircle className="h-12 w-12 text-zinc-700 mb-4" />
              <p className="font-mono text-sm text-zinc-400 mb-1">대기 중인 작업 없음</p>
              <p className="font-mono text-xs text-zinc-600">새 작업을 등록하세요</p>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2">
              {/* Running Job (맨 아래에 표시) */}
              {runningJob && (
                <JobCard
                  key={runningJob.id}
                  job={runningJob}
                  isRunning={true}
                  progress={jobProgressMap[runningJob.id]}
                  elapsedSeconds={elapsedTimes[runningJob.id] || 0}
                  isLoading={actionLoading === runningJob.id}
                  onPauseResume={handlePauseResume}
                  onDelete={handleDelete}
                  onOpenLogs={handleOpenLogs}
                />
              )}

              {/* Pending Jobs (Running 위에 역순으로 쌓임 - 가장 먼저 실행될 것이 아래) */}
              {[...pendingJobs].reverse().map((job, index) => (
                <JobCard
                  key={job.id}
                  job={job}
                  queuePosition={pendingJobs.length - index}
                  totalInQueue={pendingJobs.length}
                  isRunning={false}
                  progress={jobProgressMap[job.id]}
                  isLoading={actionLoading === job.id}
                  onPauseResume={handlePauseResume}
                  onDelete={handleDelete}
                  onTogglePriority={handleTogglePriority}
                  onOpenLogs={handleOpenLogs}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ================================================== */}
      {/* Section: Execution History (Compact Table) */}
      {/* ================================================== */}
      {completedJobs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-black/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-3">
              <History className="h-4 w-4 text-blue-500" />
              <span className="font-mono text-sm font-bold text-white">실행 기록</span>
              <span className="font-mono text-xs text-zinc-500">({completedJobs.length}개)</span>
            </div>
            
            {/* Pagination Controls */}
            {historyTotalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-mono text-xs text-zinc-400">
                  {historyPage} / {historyTotalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={historyPage === historyTotalPages}
                  onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Compact History Table */}
          <div className="divide-y divide-zinc-800/50">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-zinc-900/30 text-[10px] font-mono text-zinc-500 uppercase">
              <div className="col-span-1">상태</div>
              <div className="col-span-5">작업</div>
              <div className="col-span-3">시간</div>
              <div className="col-span-2">결과</div>
              <div className="col-span-1"></div>
            </div>

            {/* Rows */}
            {paginatedHistory.map((job) => {
              const videoId = extractVideoId(job.target_url);
              const thumbnailUrl = videoId
                ? `https://img.youtube.com/vi/${videoId}/default.jpg`
                : null;
              const successRate = job.stats && job.total_assigned
                ? Math.round((job.stats.completed / job.total_assigned) * 100)
                : 0;
              const isSuccess = successRate >= 80;

              return (
                <div
                  key={job.id}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-zinc-900/30 transition-colors"
                >
                  {/* Status Icon */}
                  <div className="col-span-1">
                    {isSuccess ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>

                  {/* Job Info: Thumbnail + ID + Title */}
                  <div className="col-span-5 flex items-center gap-2 min-w-0">
                    {/* Small Thumbnail */}
                    <div className="shrink-0 w-10 h-7 rounded overflow-hidden bg-zinc-800">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PlayCircle className="h-3 w-3 text-zinc-600" />
                        </div>
                      )}
                    </div>
                    
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-white truncate">
                        {job.display_name || job.title}
                      </p>
                      {job.title !== job.display_name && (
                        <p className="font-mono text-[9px] text-zinc-500 truncate">
                          {job.title}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Timing: Started / Duration */}
                  <div className="col-span-3">
                    <p className="font-mono text-[10px] text-zinc-400">
                      {new Date(job.created_at).toLocaleString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {job.duration_sec}초
                    </p>
                  </div>

                  {/* Result: Views / Likes */}
                  <div className="col-span-2">
                    <p className="font-mono text-[10px]">
                      <span className="text-green-400">{job.stats?.completed || 0}</span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-zinc-400">{job.total_assigned || 0}</span>
                    </p>
                    {(job.stats?.failed || 0) > 0 && (
                      <p className="font-mono text-[9px] text-red-400">
                        {job.stats?.failed} fail
                      </p>
                    )}
                  </div>

                  {/* Action: View Logs */}
                  <div className="col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-zinc-800"
                      onClick={() => handleOpenLogs(job)}
                      title="로그 보기"
                    >
                      <Terminal className="h-3 w-3 text-green-500" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* Modals & Drawers */}
      {/* ================================================== */}
      <JobCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onJobCreated={handleJobCreated}
        idleDeviceCount={idleDevices.length}
      />

      <LogDrawer
        open={logDrawerOpen}
        onClose={handleCloseLogs}
        jobId={selectedJobForLogs?.id}
        jobTitle={selectedJobForLogs?.display_name || selectedJobForLogs?.title}
        deviceId={selectedJobForLogs ? getDeviceIdForJob(selectedJobForLogs) : undefined}
      />
    </div>
  );
}
