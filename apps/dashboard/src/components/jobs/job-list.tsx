'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PlayCircle,
  PauseCircle,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useSocketContext } from '@/contexts/socket-context';

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
  target_url: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  duration_sec: number;
  prob_like: number;
  prob_comment: number;
  target_type: 'all_devices' | 'percentage' | 'device_count';
  target_value: number;
  created_at: string;
  stats?: JobStats;
  total_assigned?: number;
}

interface JobListProps {
  onJobUpdated?: () => void;
}

export function JobList({ onJobUpdated }: JobListProps) {
  const { getSocket, isConnected } = useSocketContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) throw new Error('Failed to fetch jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Poll every 5 seconds
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Real-time job updates via Socket.io
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !isConnected) return;

    // Job progress updates
    const handleJobProgress = (data: {
      assignmentId: string;
      jobId: string;
      deviceId: string;
      progressPct: number;
    }) => {
      setJobs(prev => prev.map(job => {
        if (job.id === data.jobId && job.stats) {
          return {
            ...job,
            stats: {
              ...job.stats,
              running: Math.max(0, (job.stats.running || 0)),
            },
          };
        }
        return job;
      }));
    };

    // Job started
    const handleJobStarted = (data: {
      assignmentId: string;
      jobId: string;
      deviceId: string;
    }) => {
      setJobs(prev => prev.map(job => {
        if (job.id === data.jobId && job.stats) {
          return {
            ...job,
            stats: {
              ...job.stats,
              pending: Math.max(0, (job.stats.pending || 0) - 1),
              running: (job.stats.running || 0) + 1,
            },
          };
        }
        return job;
      }));
    };

    // Job completed
    const handleJobCompleted = (data: {
      assignmentId: string;
      jobId: string;
      deviceId: string;
    }) => {
      setJobs(prev => prev.map(job => {
        if (job.id === data.jobId && job.stats) {
          return {
            ...job,
            stats: {
              ...job.stats,
              running: Math.max(0, (job.stats.running || 0) - 1),
              completed: (job.stats.completed || 0) + 1,
            },
          };
        }
        return job;
      }));
    };

    // Job failed
    const handleJobFailed = (data: {
      assignmentId: string;
      jobId: string;
      deviceId: string;
      error: string;
    }) => {
      setJobs(prev => prev.map(job => {
        if (job.id === data.jobId && job.stats) {
          return {
            ...job,
            stats: {
              ...job.stats,
              running: Math.max(0, (job.stats.running || 0) - 1),
              failed: (job.stats.failed || 0) + 1,
            },
          };
        }
        return job;
      }));
    };

    // Job status update (pause/resume)
    const handleJobStatusUpdate = (data: {
      jobId: string;
      status: string;
    }) => {
      setJobs(prev => prev.map(job => {
        if (job.id === data.jobId) {
          return {
            ...job,
            status: data.status as Job['status'],
          };
        }
        return job;
      }));
    };

    socket.on('job:progress', handleJobProgress);
    socket.on('job:started', handleJobStarted);
    socket.on('job:completed', handleJobCompleted);
    socket.on('job:failed', handleJobFailed);
    socket.on('job:status:update', handleJobStatusUpdate);

    return () => {
      const socket = getSocket();
      if (socket) {
        socket.off('job:progress', handleJobProgress);
        socket.off('job:started', handleJobStarted);
        socket.off('job:completed', handleJobCompleted);
        socket.off('job:failed', handleJobFailed);
        socket.off('job:status:update', handleJobStatusUpdate);
      }
    };
  }, [getSocket, isConnected]);

  const toggleExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
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

      const data = await response.json();

      // Emit Socket.io event for real-time coordination with workers
      const socket = getSocket();
      if (socket && isConnected) {
        if (newStatus === 'paused') {
          socket.emit('job:pause', { jobId: job.id });
        } else {
          // Resume: get pending assignments to re-distribute
          const detailResponse = await fetch(`/api/jobs/${job.id}`);
          const detailData = await detailResponse.json();
          const pendingAssignments = (detailData.assignments || []).filter(
            (a: { status: string }) => a.status === 'pending'
          );

          socket.emit('job:resume', {
            jobId: job.id,
            assignments: pendingAssignments,
            job: data.job,
          });
        }
      }

      await fetchJobs();
      onJobUpdated?.();
    } catch (err) {
      console.error('Failed to pause/resume job:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (job: Job) => {
    if (!confirm(`"${job.title}" 작업을 삭제하시겠습니까?`)) return;

    setActionLoading(job.id);
    try {
      // Emit cancel event to workers first
      const socket = getSocket();
      if (socket && isConnected) {
        socket.emit('job:cancel', { jobId: job.id });
      }

      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete job');

      await fetchJobs();
      onJobUpdated?.();
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Loader2 className="h-4 w-4 text-green-500 animate-spin" />;
      case 'paused':
        return <PauseCircle className="h-4 w-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-zinc-500" />;
      default:
        return <Clock className="h-4 w-4 text-zinc-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400';
      case 'paused':
        return 'text-yellow-400';
      case 'completed':
        return 'text-blue-400';
      case 'cancelled':
        return 'text-zinc-400';
      default:
        return 'text-zinc-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-red-500/10 text-red-400">
        <AlertCircle className="h-4 w-4" />
        <span className="font-mono text-sm">{error}</span>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <PlayCircle className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
        <p className="font-mono text-sm text-zinc-500">No jobs created yet</p>
        <p className="font-mono text-xs text-zinc-600 mt-1">Create a new job to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const isExpanded = expandedJobs.has(job.id);
        const progress = getProgressPercent(job.stats, job.total_assigned);
        const isLoading = actionLoading === job.id;

        return (
          <div
            key={job.id}
            className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden"
          >
            {/* Job Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
              onClick={() => toggleExpand(job.id)}
            >
              <button className="p-0.5">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-500" />
                )}
              </button>

              {getStatusIcon(job.status)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white truncate">
                    {job.title}
                  </span>
                  <span className={cn('font-mono text-xs uppercase', getStatusColor(job.status))}>
                    {job.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className="font-mono text-[10px] text-zinc-500">
                    {job.total_assigned || 0} devices
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {progress}% complete
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-32 hidden sm:block">
                <Progress value={progress} className="h-1.5" />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {(job.status === 'active' || job.status === 'paused') && (
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
                )}
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

            {/* Expanded Details */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-2 border-t border-zinc-800 space-y-3">
                {/* URL */}
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">URL</span>
                  <p className="font-mono text-xs text-zinc-300 truncate mt-0.5">
                    {job.target_url}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <div className="p-2 rounded bg-zinc-800/50">
                    <span className="font-mono text-[10px] text-zinc-500 block">Pending</span>
                    <span className="font-mono text-sm text-white">{job.stats?.pending || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-800/50">
                    <span className="font-mono text-[10px] text-zinc-500 block">Running</span>
                    <span className="font-mono text-sm text-green-400">{job.stats?.running || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-800/50">
                    <span className="font-mono text-[10px] text-zinc-500 block">Completed</span>
                    <span className="font-mono text-sm text-blue-400">{job.stats?.completed || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-800/50">
                    <span className="font-mono text-[10px] text-zinc-500 block">Failed</span>
                    <span className="font-mono text-sm text-red-400">{job.stats?.failed || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-800/50">
                    <span className="font-mono text-[10px] text-zinc-500 block">Paused</span>
                    <span className="font-mono text-sm text-yellow-400">{job.stats?.paused || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-800/50">
                    <span className="font-mono text-[10px] text-zinc-500 block">Cancelled</span>
                    <span className="font-mono text-sm text-zinc-400">{job.stats?.cancelled || 0}</span>
                  </div>
                </div>

                {/* Settings */}
                <div className="flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="font-mono text-zinc-500">Duration:</span>
                    <span className="font-mono text-zinc-300 ml-1">{job.duration_sec}s</span>
                  </div>
                  <div>
                    <span className="font-mono text-zinc-500">Like:</span>
                    <span className="font-mono text-zinc-300 ml-1">{job.prob_like}%</span>
                  </div>
                  <div>
                    <span className="font-mono text-zinc-500">Comment:</span>
                    <span className="font-mono text-zinc-300 ml-1">{job.prob_comment}%</span>
                  </div>
                </div>

                {/* Created At */}
                <div className="text-xs">
                  <span className="font-mono text-zinc-500">Created:</span>
                  <span className="font-mono text-zinc-400 ml-1">
                    {new Date(job.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
