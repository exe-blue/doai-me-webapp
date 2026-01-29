'use client';

import { useEffect, useState } from 'react';
import { supabase, type JobAssignment, type Job, type Device } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface StatusBoardProps {
  refreshTrigger?: number;
}

interface AssignmentWithDevice extends JobAssignment {
  device?: Device;
}

export function StatusBoard({ refreshTrigger }: StatusBoardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AssignmentWithDevice[]>>({});
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [deviceCount, setDeviceCount] = useState(0);
  const [hoveredAssignment, setHoveredAssignment] = useState<AssignmentWithDevice | null>(null);

  // 초기 데이터 로드 (devices를 먼저 로드한 후 jobs/assignments 로드)
  useEffect(() => {
    const loadData = async () => {
      await loadDevices();
      await loadJobs();
    };
    loadData();
  }, [refreshTrigger]);

  // Realtime 구독
  useEffect(() => {
    const channel = supabase
      .channel('assignments-realtime')
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

  const loadDevices = async () => {
    const { data, error, count } = await supabase
      .from('devices')
      .select('*', { count: 'exact' });
    
    // 에러 처리: 에러 발생 시 안전한 기본값 설정
    if (error) {
      console.error('Devices 로드 실패:', error);
      setDevices({});
      setDeviceCount(0);
      return;
    }
    
    if (data) {
      const deviceMap: Record<string, Device> = {};
      data.forEach(d => {
        deviceMap[d.id] = d;
      });
      setDevices(deviceMap);
      setDeviceCount(count || data.length);
    } else {
      setDevices({});
      setDeviceCount(0);
    }
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

    // 디바이스 정보 매핑
    const assignmentsWithDevice = (data || []).map(a => ({
      ...a,
      device: devices[a.device_id]
    }));

    setAssignments(prev => ({
      ...prev,
      [jobId]: assignmentsWithDevice
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-400 hover:bg-gray-500';
      case 'running': return 'bg-green-500 hover:bg-green-600 animate-pulse';
      case 'completed': return 'bg-blue-500 hover:bg-blue-600';
      case 'failed': return 'bg-red-500 hover:bg-red-600';
      default: return 'bg-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '대기';
      case 'running': return '실행중';
      case 'completed': return '완료';
      case 'failed': return '실패';
      default: return status;
    }
  };

  const getJobStats = (jobAssignments: AssignmentWithDevice[]) => {
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
          연결된 기기: <span className="font-semibold text-green-600">{deviceCount}대</span> | 
          셀 위에 마우스를 올려 상세 정보를 확인하세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 호버 정보 표시 영역 */}
        {hoveredAssignment && (
          <div className="p-4 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-lg border-2 border-dashed">
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded ${getStatusColor(hoveredAssignment.status)}`}></div>
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">PC:</span>
                  <span className="ml-2 font-medium">{hoveredAssignment.device?.pc_id || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">그룹:</span>
                  <span className="ml-2 font-medium">{hoveredAssignment.device?.group_id || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Serial:</span>
                  <span className="ml-2 font-mono text-xs">{hoveredAssignment.device?.serial_number?.substring(0, 12) || 'Unknown'}...</span>
                </div>
                <div>
                  <span className="text-muted-foreground">상태:</span>
                  <Badge className={`ml-2 ${
                    hoveredAssignment.status === 'completed' ? 'bg-blue-500' :
                    hoveredAssignment.status === 'running' ? 'bg-green-500' :
                    hoveredAssignment.status === 'failed' ? 'bg-red-500' : 'bg-gray-500'
                  }`}>
                    {getStatusText(hoveredAssignment.status)} ({hoveredAssignment.progress_pct}%)
                  </Badge>
                </div>
              </div>
            </div>
            {/* 액션 결과 */}
            {(hoveredAssignment.did_like || hoveredAssignment.did_comment || hoveredAssignment.did_playlist) && (
              <div className="mt-3 pt-3 border-t flex gap-3">
                {hoveredAssignment.did_like && <Badge variant="outline" className="text-red-500 border-red-300">❤️ 좋아요</Badge>}
                {hoveredAssignment.did_comment && <Badge variant="outline" className="text-blue-500 border-blue-300">💬 댓글</Badge>}
                {hoveredAssignment.did_playlist && <Badge variant="outline" className="text-green-500 border-green-300">📁 저장</Badge>}
              </div>
            )}
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-4xl mb-4">📭</div>
            <p>등록된 작업이 없습니다</p>
            <p className="text-sm mt-1">왼쪽에서 새 작업을 생성하세요</p>
          </div>
        ) : (
          jobs.map(job => {
            const jobAssignments = assignments[job.id] || [];
            const stats = getJobStats(jobAssignments);
            
            return (
              <div key={job.id} className="border rounded-xl p-5 space-y-4 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950">
                {/* Job 헤더 */}
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">
                      {job.title}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {job.target_url}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        ⏱️ {job.duration_min_pct}-{job.duration_max_pct}%
                      </Badge>
                      <Badge variant="outline" className="text-xs text-red-500 border-red-200">
                        ❤️ {job.prob_like}%
                      </Badge>
                      <Badge variant="outline" className="text-xs text-blue-500 border-blue-200">
                        💬 {job.prob_comment}%
                      </Badge>
                      <Badge variant="outline" className="text-xs text-green-500 border-green-200">
                        📁 {job.prob_playlist}%
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold">
                      {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stats.completed}/{stats.total} 완료
                    </div>
                  </div>
                </div>

                {/* 상태 통계 바 */}
                <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-200">
                  {stats.completed > 0 && (
                    <div 
                      className="bg-blue-500 transition-all duration-500"
                      style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                    />
                  )}
                  {stats.running > 0 && (
                    <div 
                      className="bg-green-500 animate-pulse transition-all duration-500"
                      style={{ width: `${(stats.running / stats.total) * 100}%` }}
                    />
                  )}
                  {stats.failed > 0 && (
                    <div 
                      className="bg-red-500 transition-all duration-500"
                      style={{ width: `${(stats.failed / stats.total) * 100}%` }}
                    />
                  )}
                </div>

                {/* 상태 레전드 */}
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                    대기: {stats.pending}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                    실행: {stats.running}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    완료: {stats.completed}
                  </span>
                  {stats.failed > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                      실패: {stats.failed}
                    </span>
                  )}
                </div>

                {/* 셀 그리드 (10x10 = 100개) */}
                <div className="grid grid-cols-10 gap-1">
                  {jobAssignments.slice(0, 100).map((assignment) => (
                    <div
                      key={assignment.id}
                      className={`aspect-square rounded-sm cursor-pointer transition-all duration-200 ${getStatusColor(assignment.status)} hover:scale-110 hover:shadow-lg hover:z-10`}
                      onMouseEnter={() => setHoveredAssignment({ ...assignment, device: devices[assignment.device_id] })}
                      onMouseLeave={() => setHoveredAssignment(null)}
                    />
                  ))}
                  {/* 빈 셀 채우기 */}
                  {Array.from({ length: Math.max(0, Math.min(100, deviceCount) - jobAssignments.length) }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="aspect-square rounded-sm bg-gray-200 dark:bg-gray-800"
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
