'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  PlayCircle,
  Plus,
  RefreshCw,
  PauseCircle,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Trash2,
  AlertCircle,
  Zap,
  Timer,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSocketContext } from '@/contexts/socket-context';
import { JobCreateModal, type CreateJobResponse } from '@/components/jobs/job-create-modal';
import { cn } from '@/lib/utils';

interface JobStats {
  pending: number;
  paused: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

interface Job {
  id: string;
  title: string;
  display_name?: string;
  target_url: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  duration_sec: number;
  prob_like: number;
  prob_comment: number;
  created_at: string;
  priority?: boolean;
  stats?: JobStats;
  total_assigned?: number;
}

export default function JobsPage() {
  const { isConnected, devices, socket } = useSocketContext();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const idleDevices = devices.filter(d => d.status === 'idle');

  // Fetch active/paused jobs
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  }, []);

  // Fetch completed jobs for history
  const fetchCompletedJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs?status=completed');
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

  // Socket.io real-time updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleJobProgress = () => fetchJobs();
    const handleJobCompleted = () => {
      fetchJobs();
      fetchCompletedJobs();
    };

    socket.on('job:progress', handleJobProgress);
    socket.on('job:completed', handleJobCompleted);
    socket.on('job:failed', handleJobCompleted);

    return () => {
      socket.off('job:progress', handleJobProgress);
      socket.off('job:completed', handleJobCompleted);
      socket.off('job:failed', handleJobCompleted);
    };
  }, [socket, isConnected, fetchJobs, fetchCompletedJobs]);

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

  // Toggle priority
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

  // Pause/Resume job
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
        if (newStatus === 'paused') {
          socket.emit('job:pause', { jobId: job.id });
        } else {
          socket.emit('job:resume', { jobId: job.id });
        }
      }

      await fetchJobs();
    } catch (err) {
      console.error('Failed to pause/resume job:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete job
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

  const getProgressPercent = (stats: JobStats | undefined, total: number | undefined) => {
    if (!stats || !total || total === 0) return 0;
    return Math.round(((stats.completed + stats.failed) / total) * 100);
  };

  // Separate active running job from queue
  const activeJob = jobs.find(j => j.status === 'active' && j.stats && j.stats.running > 0);
  const queueJobs = jobs.filter(j => j !== activeJob);

  // Estimate completion time
  const getEstimatedTime = (job: Job) => {
    if (!job.stats || !job.total_assigned) return '계산 중...';
    const remaining = job.total_assigned - (job.stats.completed + job.stats.failed);
    const avgTimePerDevice = job.duration_sec + 10; // buffer
    const runningDevices = Math.max(1, job.stats.running);
    const estimatedSeconds = (remaining * avgTimePerDevice) / runningDevices;

    if (estimatedSeconds < 60) return `약 ${Math.ceil(estimatedSeconds)}초`;
    if (estimatedSeconds < 3600) return `약 ${Math.ceil(estimatedSeconds / 60)}분`;
    return `약 ${Math.ceil(estimatedSeconds / 3600)}시간`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono font-bold text-foreground">작업관리</h1>
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
              {idleDevices.length}대 대기중 | {devices.filter(d => d.status !== 'offline').length}대 온라인
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
      {/* Section A: Active Running (Hero Section) */}
      {/* ================================================== */}
      {activeJob && (
        <div className="rounded-lg border-2 border-green-500/50 bg-gradient-to-br from-green-500/10 via-black to-black overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <Loader2 className="h-6 w-6 text-green-500 animate-spin" />
                <div className="absolute inset-0 h-6 w-6 bg-green-500/20 rounded-full animate-ping" />
              </div>
              <span className="font-mono text-xs text-green-400 uppercase tracking-wider">
                현재 진행 중
              </span>
            </div>

            {/* Job Name with Blink Effect */}
            <h2 className="font-mono text-2xl font-bold text-white mb-4 animate-pulse">
              {activeJob.display_name || activeJob.title}
            </h2>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm text-zinc-400">진행률</span>
                <span className="font-mono text-lg text-green-400 font-bold">
                  {getProgressPercent(activeJob.stats, activeJob.total_assigned)}%
                  <span className="text-sm text-zinc-500 ml-2">
                    ({activeJob.stats?.completed || 0}/{activeJob.total_assigned || 0}회)
                  </span>
                </span>
              </div>
              <Progress
                value={getProgressPercent(activeJob.stats, activeJob.total_assigned)}
                className="h-3 bg-zinc-800"
              />
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                <div>
                  <p className="font-mono text-xs text-zinc-500">투입 리소스</p>
                  <p className="font-mono text-sm text-white">
                    P01: <span className="text-blue-400">{activeJob.stats?.running || 0}</span>/{activeJob.total_assigned}대
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-yellow-400" />
                <div>
                  <p className="font-mono text-xs text-zinc-500">예상 종료</p>
                  <p className="font-mono text-sm text-yellow-400">
                    {getEstimatedTime(activeJob)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-400" />
                <div>
                  <p className="font-mono text-xs text-zinc-500">시청 시간</p>
                  <p className="font-mono text-sm text-white">{activeJob.duration_sec}초</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-800">
              <Button
                size="sm"
                variant="outline"
                className="font-mono text-xs"
                onClick={() => handlePauseResume(activeJob)}
                disabled={actionLoading === activeJob.id}
              >
                {actionLoading === activeJob.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <PauseCircle className="h-4 w-4 text-yellow-500 mr-1" />
                )}
                일시정지
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* No Active Job */}
      {!activeJob && jobs.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <PlayCircle className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
          <p className="font-mono text-lg text-zinc-400 mb-2">진행 중인 작업 없음</p>
          <p className="font-mono text-xs text-zinc-600">새 작업을 등록하여 시작하세요</p>
        </div>
      )}

      {/* ================================================== */}
      {/* Section B: Job Queue (Timeline) */}
      {/* ================================================== */}
      {queueJobs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="font-mono text-sm font-bold text-white">대기열</span>
              <span className="font-mono text-xs text-zinc-500">({queueJobs.length}개)</span>
            </div>
          </div>

          <div className="divide-y divide-zinc-800">
            {queueJobs.map((job, index) => {
              const progress = getProgressPercent(job.stats, job.total_assigned);
              const isLoading = actionLoading === job.id;

              return (
                <div
                  key={job.id}
                  className={cn(
                    'px-4 py-3 transition-colors',
                    job.priority && 'bg-yellow-500/5 border-l-2 border-l-yellow-500'
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Queue Position */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                      <span className="font-mono text-xs text-zinc-400">
                        {job.priority ? <Zap className="h-4 w-4 text-yellow-500" /> : index + 1}
                      </span>
                    </div>

                    {/* Job Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-white truncate">
                          {job.display_name || job.title}
                        </span>
                        {job.status === 'paused' && (
                          <span className="font-mono text-[10px] text-yellow-400 bg-yellow-500/20 px-1.5 py-0.5 rounded">
                            PAUSED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-mono text-[10px] text-zinc-500">
                          {job.total_assigned || 0}대 할당
                        </span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {progress}% 완료
                        </span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="w-24 hidden sm:block">
                      <Progress value={progress} className="h-1.5" />
                    </div>

                    {/* Priority Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-500">우선</span>
                      <Switch
                        checked={job.priority || false}
                        onCheckedChange={() => handleTogglePriority(job)}
                        disabled={isLoading}
                        className="data-[state=checked]:bg-yellow-500"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        disabled={isLoading}
                        onClick={() => handlePauseResume(job)}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : job.status === 'active' ? (
                          <PauseCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <PlayCircle className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        disabled={isLoading}
                        onClick={() => handleDelete(job)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* Section C: History (Accordion) */}
      {/* ================================================== */}
      {completedJobs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              <span className="font-mono text-sm font-bold text-white">완료 기록</span>
              <span className="font-mono text-xs text-zinc-500">({completedJobs.length}개)</span>
            </div>
          </div>

          <div className="divide-y divide-zinc-800">
            {completedJobs.slice(0, 10).map((job) => {
              const isExpanded = expandedHistory.has(job.id);
              const successRate = job.stats && job.total_assigned
                ? Math.round((job.stats.completed / job.total_assigned) * 100)
                : 0;

              return (
                <div key={job.id}>
                  {/* Accordion Header */}
                  <div
                    className="px-4 py-3 cursor-pointer hover:bg-zinc-900/50 transition-colors"
                    onClick={() => {
                      setExpandedHistory(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(job.id)) {
                          newSet.delete(job.id);
                        } else {
                          newSet.add(job.id);
                        }
                        return newSet;
                      });
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-500" />
                      )}

                      <CheckCircle2 className="h-4 w-4 text-blue-500" />

                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm text-zinc-300 truncate">
                          {job.display_name || job.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono">
                        <span className="text-green-400">{job.stats?.completed || 0} 성공</span>
                        <span className="text-red-400">{job.stats?.failed || 0} 실패</span>
                        <span className="text-zinc-500">
                          {new Date(job.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 bg-zinc-900/30">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-2 rounded bg-zinc-800/50">
                          <span className="font-mono text-[10px] text-zinc-500 block">총 할당</span>
                          <span className="font-mono text-sm text-white">{job.total_assigned || 0}대</span>
                        </div>
                        <div className="p-2 rounded bg-zinc-800/50">
                          <span className="font-mono text-[10px] text-zinc-500 block">성공</span>
                          <span className="font-mono text-sm text-green-400">{job.stats?.completed || 0}</span>
                        </div>
                        <div className="p-2 rounded bg-zinc-800/50">
                          <span className="font-mono text-[10px] text-zinc-500 block">실패</span>
                          <span className="font-mono text-sm text-red-400">{job.stats?.failed || 0}</span>
                        </div>
                        <div className="p-2 rounded bg-zinc-800/50">
                          <span className="font-mono text-[10px] text-zinc-500 block">성공률</span>
                          <span className="font-mono text-sm text-blue-400">{successRate}%</span>
                        </div>
                      </div>
                      <div className="mt-3 text-xs font-mono text-zinc-500">
                        URL: <span className="text-zinc-400 truncate">{job.target_url}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Job Modal */}
      <JobCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onJobCreated={handleJobCreated}
        idleDeviceCount={idleDevices.length}
      />
    </div>
  );
}
