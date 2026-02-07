"use client";

import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoginButton } from '@/components/auth/login-button';
import { WarpBackground } from '@/components/ui/warp-background';
import { useSocket } from '@/hooks/use-socket';
import { Loader } from '@packages/ui';
import Link from 'next/link';
import Image from 'next/image';
import {
  Home,
  Video,
  Users,
  Search,
  Clock,
  Activity,
  Calendar,
  Smartphone,
  AlertTriangle,
  UserPlus,
  Cpu,
  LayoutGrid,
  FileText,
  CheckCircle,
  ScrollText,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface BentoLink {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  busy: number;
  error: number;
}

const menuLinks: BentoLink[] = [
  { title: '홈', href: '/dashboard', icon: Home, description: '대시보드 홈으로 이동' },
  { title: '영상 목록', href: '/dashboard/videos', icon: Video, description: '등록된 영상 관리' },
  { title: '채널 목록', href: '/dashboard/channels', icon: Users, description: '채널 관리 및 조회' },
  { title: '키워드', href: '/dashboard/keywords', icon: Search, description: '키워드 검색 관리' },
  { title: '대기열', href: '/dashboard/queue', icon: Clock, description: '작업 대기열 확인' },
  { title: '진행 중', href: '/dashboard/running', icon: Activity, description: '실행 중인 작업 모니터링' },
  { title: '스케줄러', href: '/dashboard/schedules', icon: Calendar, description: '작업 스케줄 관리' },
  { title: '기기 현황', href: '/dashboard/devices', icon: Smartphone, description: '디바이스 상태 확인' },
  { title: '기기 이슈', href: '/dashboard/devices/issues', icon: AlertTriangle, description: '기기 오류 및 이슈 추적' },
  { title: '온보딩', href: '/dashboard/onboarding', icon: UserPlus, description: '새 기기 등록' },
  { title: 'Workers', href: '/dashboard/workers', icon: Cpu, description: '워커 인스턴스 관리' },
  { title: '노드 관리', href: '/dashboard/nodes', icon: LayoutGrid, description: '노드 구성 관리' },
  { title: '일일 리포트', href: '/dashboard/reports/daily', icon: FileText, description: '일일 실행 리포트' },
  { title: '완료 내역', href: '/dashboard/reports/history', icon: CheckCircle, description: '완료된 작업 내역' },
  { title: '로그', href: '/dashboard/logs', icon: ScrollText, description: '시스템 로그 조회' },
  { title: '설정', href: '/dashboard/settings', icon: Settings, description: '시스템 설정' },
];

const placeholderCount = 4;

export default function BentoPage() {
  const { isConnected } = useSocket();
  const [deviceStats, setDeviceStats] = useState<DeviceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDeviceStats() {
      try {
        const response = await fetch('/api/devices/overview?limit=1000');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.stats) {
            setDeviceStats(data.data.stats);
          }
        }
      } catch (error) {
        console.error('Failed to fetch device stats:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDeviceStats();
  }, []);

  const stats = [
    {
      label: '디바이스',
      value: deviceStats?.total?.toString() || '0',
      isLoading,
    },
    { label: '네트워크', value: '독립형' },
    { label: '에이전트', value: 'AI' },
    {
      label: '상태',
      value: isConnected ? 'Active' : 'Error',
      isStatus: true,
    },
  ];

  return (
    <WarpBackground
      className="flex min-h-screen flex-col items-center justify-center border-0 bg-background p-4 sm:p-6 lg:p-10"
      beamsPerSide={4}
      beamSize={5}
      beamDelayMax={3}
      beamDuration={4}
    >
      {/* Top toolbar */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <ThemeToggle />
        <LoginButton />
      </div>

      <div className="flex w-full max-w-6xl flex-col gap-5 lg:flex-row">
        {/* Left Sidebar - Profile / Branding */}
        <aside className="flex w-full flex-col gap-5 lg:w-[320px] lg:shrink-0">
          {/* Brand Card */}
          <div className="flex flex-col items-center gap-4 rounded-md border-2 border-border bg-card p-6 shadow-[4px_4px_0px_0px] shadow-border">
            <div className="flex h-24 w-24 items-center justify-center rounded-md border-2 border-border bg-primary shadow-[2px_2px_0px_0px] shadow-border">
              <Image
                src="/logo-icon.svg"
                alt="DoAi.Me"
                width={64}
                height={64}
                className="h-16 w-16"
              />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                DoAi.Me
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                AI가 스스로 콘텐츠를 소비하는 세계
              </p>
            </div>
            <div className="w-full border-t-2 border-border pt-4">
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                600대의 물리적 디바이스가 독립된 네트워크에서 콘텐츠를 탐험합니다.
                봇이 아닌, 디지털 존재로서.
              </p>
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="rounded-md border-2 border-border bg-card p-4 shadow-[4px_4px_0px_0px] shadow-border">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Quick Stats
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded border-2 border-border bg-background p-2 text-center"
                >
                  <div className={`text-lg font-bold flex items-center justify-center min-h-[1.75rem] ${
                    stat.isStatus
                      ? (stat.value === 'Active' ? 'text-green-500' : 'text-destructive')
                      : 'text-primary'
                  }`}>
                    {stat.isLoading ? (
                      <Loader count={3} duration={0.4} delayStep={80} />
                    ) : (
                      stat.value
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Right Grid - Bento Links */}
        <main className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Menu Item Cards */}
          {menuLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col gap-3 rounded-md border-2 border-border bg-card p-5 shadow-[4px_4px_0px_0px] shadow-border transition-all duration-200 hover:-translate-y-0.5 hover:translate-x-0.5 hover:shadow-[2px_2px_0px_0px] hover:shadow-border active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded border-2 border-border bg-primary text-primary-foreground shadow-[2px_2px_0px_0px] shadow-border transition-all group-hover:shadow-none">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">{link.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {link.description}
                  </p>
                </div>
              </Link>
            );
          })}

          {/* "To Be Continued" Placeholder Cards */}
          {Array.from({ length: placeholderCount }).map((_, i) => (
            <div
              key={`placeholder-${i}`}
              className="group flex flex-col gap-3 rounded-md border-2 border-border bg-card p-5 shadow-[4px_4px_0px_0px] shadow-border opacity-60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded border-2 border-border bg-muted text-muted-foreground shadow-[2px_2px_0px_0px] shadow-border">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-muted-foreground">WAIT</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  to be continued...
                </p>
              </div>
            </div>
          ))}
        </main>
      </div>
    </WarpBackground>
  );
}
