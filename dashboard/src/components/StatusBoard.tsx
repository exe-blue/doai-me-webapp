'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, type JobAssignment, type Job, type Device, type ScrcpyCommand } from '@/lib/supabase';
import { computeHealthStatus, getHealthIndicator } from '@/lib/healthStatus';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Monitor, Loader2, Check, X } from 'lucide-react';

interface StatusBoardProps {
  refreshTrigger?: number;
}

interface AssignmentWithDevice extends JobAssignment {
  device?: Device;
}

// Scrcpy 버튼 상태 타입
type ScrcpyButtonState = 'idle' | 'loading' | 'success' | 'error';

export function StatusBoard({ refreshTrigger }: StatusBoardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AssignmentWithDevice[]>>({});
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [deviceCount, setDeviceCount] = useState(0);
  const [hoveredAssignment, setHoveredAssignment] = useState<AssignmentWithDevice | null>(null);
  const [hoveredDevice, setHoveredDevice] = useState<Device | null>(null);

  // Scrcpy 버튼 상태 (device_id -> state)
  const [scrcpyStates, setScrcpyStates] = useState<Record<string, ScrcpyButtonState>>({});
  const [pendingScrcpyCommands, setPendingScrcpyCommands] = useState<Record<string, string>>({});

  // 로드 에러 상태
  const [loadError, setLoadError] = useState<string | null>(null);

  // 초기 데이터 로드 (에러 핸들링 추가)
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadError(null);
        await loadDevices();
        await loadJobs();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '데이터 로드 실패';
        console.error('[StatusBoard] 초기 데이터 로드 실패:', error);
        setLoadError(errorMessage);
      }
    };
    loadData();
  }, [refreshTrigger]);

  // Realtime 구독: job_assignments + devices + scrcpy_commands
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    let retryTimer: NodeJS.Timeout | null = null;

    const channel = supabase
      .channel('statusboard-realtime')
      // job_assignments 변경 감지
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_assignments' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'job_id' in payload.new) {
            loadAssignmentsForJob(payload.new.job_id as string);
          }
        }
      )
      // devices 변경 감지 (health_status 업데이트)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'devices' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            const updated = payload.new as Device;
            setDevices(prev => ({ ...prev, [updated.id]: updated }));
          }
        }
      )
      // scrcpy_commands 변경 감지
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scrcpy_commands' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const cmd = payload.new as ScrcpyCommand;
            handleScrcpyCommandUpdate(cmd);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          retryCount = 0;
          console.log('[StatusBoard] Realtime 구독 성공');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[StatusBoard] Realtime 구독 ${status}:`, err);
          retryCount++;
          if (retryCount <= maxRetries) {
            const delay = Math.pow(2, retryCount - 1) * 1000;
            console.log(`[StatusBoard] ${delay}ms 후 재시도 (${retryCount}/${maxRetries})`);
            retryTimer = setTimeout(() => {
              supabase.removeChannel(channel);
            }, delay);
          } else {
            console.error('[StatusBoard] Realtime 최대 재시도 초과 - 실시간 업데이트 비활성화');
            // 사용자에게 알림 (선택적)
            setLoadError('실시간 업데이트 연결 실패. 새로고침이 필요합니다.');
          }
        }
      });

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Scrcpy 명령 상태 업데이트 핸들러
  const handleScrcpyCommandUpdate = useCallback((cmd: ScrcpyCommand) => {
    // pending commands에서 device_id 찾기
    const deviceId = Object.entries(pendingScrcpyCommands).find(
      ([, cmdId]) => cmdId === cmd.id
    )?.[0];

    if (!deviceId) return;

    if (cmd.status === 'completed') {
      setScrcpyStates(prev => ({ ...prev, [deviceId]: 'success' }));
      // 3초 후 idle로 복귀
      setTimeout(() => {
        setScrcpyStates(prev => ({ ...prev, [deviceId]: 'idle' }));
        setPendingScrcpyCommands(prev => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
      }, 3000);
    } else if (cmd.status === 'failed' || cmd.status === 'timeout') {
      setScrcpyStates(prev => ({ ...prev, [deviceId]: 'error' }));
      setTimeout(() => {
        setScrcpyStates(prev => ({ ...prev, [deviceId]: 'idle' }));
        setPendingScrcpyCommands(prev => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
      }, 3000);
    }
  }, [pendingScrcpyCommands]);

  const loadDevices = async () => {
    const { data, error, count } = await supabase
      .from('devices')
      .select('*', { count: 'exact' });

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

    // N+1 쿼리 방지: 병렬로 모든 assignments 로드
    await Promise.all((data || []).map(job => loadAssignmentsForJob(job.id)));
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

    const assignmentsWithDevice = (data || []).map(a => ({
      ...a,
      device: devices[a.device_id]
    }));

    setAssignments(prev => ({
      ...prev,
      [jobId]: assignmentsWithDevice
    }));
  };

  // Scrcpy 트리거 함수
  const triggerScrcpy = async (device: Device) => {
    if (scrcpyStates[device.id] === 'loading') return;

    setScrcpyStates(prev => ({ ...prev, [device.id]: 'loading' }));

    const { data, error } = await supabase
      .from('scrcpy_commands')
      .insert({
        device_id: device.id,
        pc_id: device.pc_id,
        command_type: 'scrcpy_start',
        options: { maxSize: 800, maxFps: 30 }
      })
      .select('id')
      .single();

    if (error) {
      console.error('Scrcpy 명령 생성 실패:', error);
      setScrcpyStates(prev => ({ ...prev, [device.id]: 'error' }));
      setTimeout(() => {
        setScrcpyStates(prev => ({ ...prev, [device.id]: 'idle' }));
      }, 3000);
      return;
    }

    if (data) {
      setPendingScrcpyCommands(prev => ({ ...prev, [device.id]: data.id }));
    }
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

  // 기기 건강 상태 통계
  const getHealthStats = () => {
    const deviceList = Object.values(devices);
    return {
      total: deviceList.length,
      healthy: deviceList.filter(d => computeHealthStatus(d) === 'healthy').length,
      zombie: deviceList.filter(d => computeHealthStatus(d) === 'zombie').length,
      offline: deviceList.filter(d => computeHealthStatus(d) === 'offline').length
    };
  };

  const healthStats = getHealthStats();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>📊 실시간 상태 보드</CardTitle>
        <CardDescription className="flex flex-wrap gap-4 items-center">
          <span>연결된 기기: <span className="font-semibold text-green-600">{deviceCount}대</span></span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            정상: {healthStats.healthy}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            무응답: {healthStats.zombie}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
            오프라인: {healthStats.offline}
          </span>
        </CardDescription>
        {loadError && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
            ⚠️ {loadError}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 호버 정보 표시 영역 */}
        {(hoveredAssignment || hoveredDevice) && (
          <div className="p-4 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-lg border-2 border-dashed">
            <div className="flex items-center gap-4">
              {hoveredAssignment ? (
                <>
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
                </>
              ) : hoveredDevice && (
                <>
                  {(() => {
                    const health = computeHealthStatus(hoveredDevice);
                    const indicator = getHealthIndicator(health);
                    return (
                      <>
                        <div className={`w-8 h-8 rounded ${indicator.bgColor} ${indicator.animation}`}></div>
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">PC:</span>
                            <span className="ml-2 font-medium">{hoveredDevice.pc_id}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">그룹:</span>
                            <span className="ml-2 font-medium">{hoveredDevice.group_id}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Serial:</span>
                            <span className="ml-2 font-mono text-xs">{hoveredDevice.serial_number?.substring(0, 12)}...</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">건강:</span>
                            <Badge className={`ml-2 ${indicator.bgColor}`}>{indicator.label}</Badge>
                          </div>
                          <div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={health === 'offline' || scrcpyStates[hoveredDevice.id] === 'loading'}
                              onClick={() => triggerScrcpy(hoveredDevice)}
                              className="h-7"
                            >
                              {scrcpyStates[hoveredDevice.id] === 'loading' ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : scrcpyStates[hoveredDevice.id] === 'success' ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : scrcpyStates[hoveredDevice.id] === 'error' ? (
                                <X className="w-3 h-3 text-red-500" />
                              ) : (
                                <Monitor className="w-3 h-3" />
                              )}
                              <span className="ml-1">화면</span>
                            </Button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
            {/* 액션 결과 */}
            {hoveredAssignment && (hoveredAssignment.did_like || hoveredAssignment.did_comment || hoveredAssignment.did_playlist) && (
              <div className="mt-3 pt-3 border-t flex gap-3">
                {hoveredAssignment.did_like && <Badge variant="outline" className="text-red-500 border-red-300">❤️ 좋아요</Badge>}
                {hoveredAssignment.did_comment && <Badge variant="outline" className="text-blue-500 border-blue-300">💬 댓글</Badge>}
                {hoveredAssignment.did_playlist && <Badge variant="outline" className="text-green-500 border-green-300">📁 저장</Badge>}
              </div>
            )}
          </div>
        )}

        {/* 기기 건강 상태 그리드 (10x10) */}
        <div className="border rounded-xl p-4 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            기기 연결 상태
          </h4>
          <div className="grid grid-cols-10 gap-1">
            {Object.values(devices).slice(0, 100).map((device) => {
              const health = computeHealthStatus(device);
              const indicator = getHealthIndicator(health);
              const scrcpyState = scrcpyStates[device.id] || 'idle';

              return (
                <div
                  key={device.id}
                  className={`aspect-square rounded-sm cursor-pointer transition-all duration-200 ${indicator.bgColor} ${indicator.animation} hover:scale-110 hover:shadow-lg hover:z-10 relative`}
                  onMouseEnter={() => { setHoveredDevice(device); setHoveredAssignment(null); }}
                  onMouseLeave={() => setHoveredDevice(null)}
                  onClick={() => health !== 'offline' && triggerScrcpy(device)}
                >
                  {scrcpyState === 'loading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-sm">
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    </div>
                  )}
                  {scrcpyState === 'success' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-600/50 rounded-sm">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

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
                        ⏱️ {job.duration_min_pct ?? '-'}-{job.duration_max_pct ?? '-'}%
                      </Badge>
                      <Badge variant="outline" className="text-xs text-red-500 border-red-200">
                        ❤️ {job.like_probability ?? '-'}%
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
                      onMouseEnter={() => { setHoveredAssignment({ ...assignment, device: devices[assignment.device_id] }); setHoveredDevice(null); }}
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
