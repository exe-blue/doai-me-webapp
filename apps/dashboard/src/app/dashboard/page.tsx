'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSocketContext } from '@/contexts/socket-context';
import {
  Monitor,
  Activity,
  PlayCircle,
  Wifi,
  WifiOff,
  TrendingUp,
  Smartphone,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  const { isConnected, devices } = useSocketContext();

  // Calculate stats
  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status !== 'offline').length;
    const busy = devices.filter(d => d.status === 'busy').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    const operationRate = total > 0 ? Math.round((online / total) * 100) : 0;

    // Group by PC
    const pcGroups = new Set(devices.map(d => d.pc_id));
    const activePCs = new Set(devices.filter(d => d.status !== 'offline').map(d => d.pc_id));

    return { total, online, busy, offline, operationRate, pcCount: pcGroups.size, activePCs: activePCs.size };
  }, [devices]);

  // Current active jobs (busy devices)
  const activeJobs = useMemo(() => {
    return devices.filter(d => d.status === 'busy');
  }, [devices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-head text-foreground">대시보드</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn(
              'inline-block h-2 w-2 rounded-full',
              isConnected
                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
            )} />
            <span className="font-mono text-xs text-muted-foreground">
              {isConnected ? '연결됨' : '연결 끊김'}
            </span>
          </div>
        </div>
      </div>

      {/* Bento Grid Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Operation Rate - Large Card */}
        <Card className="col-span-2 relative overflow-hidden">
          <CardContent className="p-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-green-500/10 to-transparent" />
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">가동률</span>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex items-end gap-2">
              <span className="font-mono text-5xl font-bold text-foreground">{stats.operationRate}</span>
              <span className="font-mono text-2xl text-muted-foreground mb-1">%</span>
            </div>
            <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                style={{ width: `${stats.operationRate}%` }}
              />
            </div>
            <p className="font-mono text-xs text-muted-foreground mt-2">
              {stats.online} / {stats.total} 기기 온라인
            </p>
          </CardContent>
        </Card>

        {/* Total Devices */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">총 기기</span>
              <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="font-mono text-3xl font-bold text-foreground">{stats.total}</span>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              {stats.pcCount}개 PC 연결됨
            </p>
          </CardContent>
        </Card>

        {/* Online Devices */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">작동중</span>
              <span className="inline-block h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            </div>
            <span className="font-mono text-3xl font-bold text-green-400">{stats.online}</span>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              {stats.activePCs}개 PC 활성
            </p>
          </CardContent>
        </Card>

        {/* Running Tasks */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">작업중</span>
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
            </div>
            <span className="font-mono text-3xl font-bold text-yellow-400">{stats.busy}</span>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              작업 실행중
            </p>
          </CardContent>
        </Card>

        {/* Offline Devices */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">오프라인</span>
              <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="font-mono text-3xl font-bold text-muted-foreground">{stats.offline}</span>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              연결 끊김
            </p>
          </CardContent>
        </Card>

        {/* Connection Status - Wide Card */}
        <Card className="col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">시스템 상태</span>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'inline-block h-3 w-3 rounded-full',
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                )} />
                <span className="font-mono text-sm text-foreground">
                  Socket.io: {isConnected ? '연결됨' : '연결 끊김'}
                </span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <span className={cn(
                  'inline-block h-3 w-3 rounded-full',
                  stats.online > 0 ? 'bg-green-500' : 'bg-yellow-500'
                )} />
                <span className="font-mono text-sm text-foreground">
                  워커: {stats.online > 0 ? '활성' : '대기중'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link href="/dashboard/nodes" className="group">
          <Card className="hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] transition-all cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-blue-500" />
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground">기기관리</h3>
                    <p className="font-mono text-[10px] text-muted-foreground">기기 제어 및 브로드캐스트</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/jobs" className="group">
          <Card className="hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] transition-all cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PlayCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground">작업관리</h3>
                    <p className="font-mono text-[10px] text-muted-foreground">작업 생성 및 관리</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/register" className="group">
          <Card className="hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] transition-all cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wifi className="h-5 w-5 text-purple-500" />
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground">작업등록</h3>
                    <p className="font-mono text-[10px] text-muted-foreground">채널/영상 등록</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Active Jobs Section */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-sm">
            <Activity className="h-4 w-4 text-muted-foreground" />
            진행중인 작업
          </CardTitle>
          <span className="font-mono text-xs text-muted-foreground">{activeJobs.length}개 실행중</span>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary mb-3" />
              <span className="font-mono text-xs text-muted-foreground">연결중...</span>
            </div>
          ) : activeJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <PlayCircle className="h-8 w-8 text-muted-foreground mb-3" />
              <span className="font-mono text-sm text-muted-foreground">진행중인 작업 없음</span>
              <span className="font-mono text-xs text-muted-foreground mt-1">
                작업을 등록하여 실행을 시작하세요
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {activeJobs.slice(0, 10).map((device, index) => (
                <div
                  key={device.id || index}
                  className="flex items-center justify-between px-3 py-2 rounded bg-card/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                    <span className="font-mono text-sm text-foreground">
                      {device.pc_id || device.serial_number?.slice(-6)}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">실행중</span>
                </div>
              ))}
              {activeJobs.length > 10 && (
                <p className="font-mono text-xs text-muted-foreground text-center pt-2">
                  + {activeJobs.length - 10}개 기기 더보기
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
