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
          <h1 className="text-xl font-mono font-bold text-foreground">대시보드</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={cn(
              'h-2 w-2 rounded-full',
              isConnected
                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
            )} />
            <span className="font-mono text-xs text-zinc-400">
              {isConnected ? '연결됨' : '연결 끊김'}
            </span>
          </div>
        </div>
      </div>

      {/* Bento Grid Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Operation Rate - Large Card */}
        <div className="col-span-2 rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-green-500/10 to-transparent" />
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">가동률</span>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <div className="flex items-end gap-2">
            <span className="font-mono text-5xl font-bold text-white">{stats.operationRate}</span>
            <span className="font-mono text-2xl text-zinc-500 mb-1">%</span>
          </div>
          <div className="mt-4 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${stats.operationRate}%` }}
            />
          </div>
          <p className="font-mono text-xs text-zinc-500 mt-2">
            {stats.online} / {stats.total} 기기 온라인
          </p>
        </div>

        {/* Total Devices */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">총 기기</span>
            <Monitor className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <span className="font-mono text-3xl font-bold text-white">{stats.total}</span>
          <p className="font-mono text-[10px] text-zinc-600 mt-1">
            {stats.pcCount}개 PC 연결됨
          </p>
        </div>

        {/* Online Devices */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">작동중</span>
            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          </div>
          <span className="font-mono text-3xl font-bold text-green-400">{stats.online}</span>
          <p className="font-mono text-[10px] text-zinc-600 mt-1">
            {stats.activePCs}개 PC 활성
          </p>
        </div>

        {/* Running Tasks */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">작업중</span>
            <div className="h-2 w-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
          </div>
          <span className="font-mono text-3xl font-bold text-yellow-400">{stats.busy}</span>
          <p className="font-mono text-[10px] text-zinc-600 mt-1">
            작업 실행중
          </p>
        </div>

        {/* Offline Devices */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">오프라인</span>
            <WifiOff className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <span className="font-mono text-3xl font-bold text-zinc-500">{stats.offline}</span>
          <p className="font-mono text-[10px] text-zinc-600 mt-1">
            연결 끊김
          </p>
        </div>

        {/* Connection Status - Wide Card */}
        <div className="col-span-2 rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] text-zinc-500 uppercase">시스템 상태</span>
            <Activity className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                'h-3 w-3 rounded-full',
                isConnected ? 'bg-green-500' : 'bg-red-500'
              )} />
              <span className="font-mono text-sm text-zinc-300">
                Socket.io: {isConnected ? '연결됨' : '연결 끊김'}
              </span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-2">
              <div className={cn(
                'h-3 w-3 rounded-full',
                stats.online > 0 ? 'bg-green-500' : 'bg-yellow-500'
              )} />
              <span className="font-mono text-sm text-zinc-300">
                워커: {stats.online > 0 ? '활성' : '대기중'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link href="/dashboard/nodes" className="group">
          <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-4 hover:border-zinc-700 hover:bg-zinc-900 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-blue-500" />
                <div>
                  <h3 className="font-mono text-sm font-bold text-white">기기관리</h3>
                  <p className="font-mono text-[10px] text-zinc-500">기기 제어 및 브로드캐스트</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
          </div>
        </Link>

        <Link href="/dashboard/jobs" className="group">
          <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-4 hover:border-zinc-700 hover:bg-zinc-900 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PlayCircle className="h-5 w-5 text-green-500" />
                <div>
                  <h3 className="font-mono text-sm font-bold text-white">작업관리</h3>
                  <p className="font-mono text-[10px] text-zinc-500">작업 생성 및 관리</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
          </div>
        </Link>

        <Link href="/dashboard/register" className="group">
          <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 p-4 hover:border-zinc-700 hover:bg-zinc-900 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wifi className="h-5 w-5 text-purple-500" />
                <div>
                  <h3 className="font-mono text-sm font-bold text-white">작업등록</h3>
                  <p className="font-mono text-[10px] text-zinc-500">채널/영상 등록</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
          </div>
        </Link>
      </div>

      {/* Active Jobs Section */}
      <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-zinc-500" />
            <span className="font-mono text-sm font-bold text-white">진행중인 작업</span>
          </div>
          <span className="font-mono text-xs text-zinc-500">{activeJobs.length}개 실행중</span>
        </div>
        <div className="p-4">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary mb-3" />
              <span className="font-mono text-xs text-zinc-500">연결중...</span>
            </div>
          ) : activeJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <PlayCircle className="h-8 w-8 text-zinc-600 mb-3" />
              <span className="font-mono text-sm text-zinc-500">진행중인 작업 없음</span>
              <span className="font-mono text-xs text-zinc-600 mt-1">
                작업을 등록하여 실행을 시작하세요
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {activeJobs.slice(0, 10).map((device, index) => (
                <div
                  key={device.id || index}
                  className="flex items-center justify-between px-3 py-2 rounded bg-zinc-900/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                    <span className="font-mono text-sm text-white">
                      {device.pc_id || device.serial_number?.slice(-6)}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-zinc-500">실행중</span>
                </div>
              ))}
              {activeJobs.length > 10 && (
                <p className="font-mono text-xs text-zinc-600 text-center pt-2">
                  + {activeJobs.length - 10}개 기기 더보기
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
