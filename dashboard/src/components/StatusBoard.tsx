'use client';

import { useEffect, useState } from 'react';
import { supabase, type JobAssignment, type Job } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface StatusBoardProps {
  refreshTrigger?: number;
}

export function StatusBoard({ refreshTrigger }: StatusBoardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<Record<string, JobAssignment[]>>({});
  const [deviceCount, setDeviceCount] = useState(0);

  // 초기 데이터 로드
  useEffect(() => {
    loadJobs();
    loadDeviceCount();
  }, [refreshTrigger]);

  // Realtime 구독
  useEffect(() => {
    const channel = supabase
      .channel('assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_assignments'
        },
        (payload) => {
          console.log('Realtime update:', payload);
          if (payload.new && typeof payload.new === 'object' && 'job_id' in payload.new) {
            loadAssignmentsForJob(payload.new.job_id as string);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDeviceCount = async () => {
    const { count } = await supabase
      .from('devices')
      .select('*', { count: 'exact', head: true });
    setDeviceCount(count || 0);
  };

  const loadJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Jobs 로드 실패:', error);
      return;
    }

    setJobs(data || []);

    for (const job of data || []) {
      loadAssignmentsForJob(job.id);
    }
  };

  const loadAssignmentsForJob = async (jobId: string) => {
    const { data, error } = await supabase
      .from('job_assignments')
      .select('*')
      .eq('job_id', jobId)
      .order('assigned_at', { ascending: true });

    if (error) {
      console.error('Assignments 로드 실패:', error);
      return;
    }

    setAssignments(prev => ({
      ...prev,
      [jobId]: data || []
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-400';
      case 'running': return 'bg-green-500 animate-pulse';
      case 'completed': return 'bg-blue-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  const getJobStats = (jobAssignments: JobAssignment[]) => {
    const total = jobAssignments.length;
    const pending = jobAssignments.filter(a => a.status === 'pending').length;
    const running = jobAssignments.filter(a => a.status === 'running').length;
    const completed = jobAssignments.filter(a => a.status === 'completed').length;
    const failed = jobAssignments.filter(a => a.status === 'failed').length;
    
    return { total, pending, running, completed, failed };
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>📊 실시간 상태 보드</CardTitle>
        <CardDescription>
          연결된 기기: {deviceCount}대 | 작업 진행 상황을 실시간으로 확인합니다
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {jobs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            등록된 작업이 없습니다
          </p>
        ) : (
          jobs.map(job => {
            const jobAssignments = assignments[job.id] || [];
            const stats = getJobStats(jobAssignments);
            
            return (
              <div key={job.id} className="border rounded-lg p-4 space-y-4">
                {/* Job 헤더 */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm">
                      {job.title}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate max-w-xs">
                      {job.target_url}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      시청: {job.duration_min_pct}%-{job.duration_max_pct}% | 좋아요: {job.prob_like}%
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p>완료: {stats.completed}/{stats.total}</p>
                    <p className="text-muted-foreground">
                      {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
                    </p>
                  </div>
                </div>

                {/* 상태 통계 */}
                <div className="flex gap-2 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    대기: {stats.pending}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    실행: {stats.running}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    완료: {stats.completed}
                  </span>
                  {stats.failed > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      실패: {stats.failed}
                    </span>
                  )}
                </div>

                {/* 셀 그리드 (최대 100개) */}
                <div className="grid grid-cols-10 gap-1">
                  {jobAssignments.slice(0, 100).map((assignment) => (
                    <div
                      key={assignment.id}
                      className={`w-full aspect-square rounded-sm ${getStatusColor(assignment.status)} transition-colors duration-300`}
                      title={`${assignment.device_id}: ${assignment.status} (${assignment.progress_pct}%)`}
                    />
                  ))}
                  {/* 빈 셀 채우기 */}
                  {Array.from({ length: Math.max(0, Math.min(100, deviceCount) - jobAssignments.length) }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="w-full aspect-square rounded-sm bg-gray-200"
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
