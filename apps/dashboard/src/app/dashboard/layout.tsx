'use client';

import { SocketProvider } from '@/contexts/socket-context';
import { SidebarProvider } from '@/components/layout/sidebar-context';
import { AppSidebar, type NavigationGroup } from '@/components/layout/app-sidebar';
import { Header } from '@/components/layout/header';
import {
  Home,
  Play,
  Video,
  Users,
  Search,
  Eye,
  Clock,
  Activity,
  Calendar,
  Smartphone,
  LayoutGrid,
  AlertTriangle,
  BarChart3,
  FileText,
  CheckCircle,
  Settings,
  Server,
  Cpu,
  UserPlus,
  PlusCircle,
  Globe,
  Bot,
} from 'lucide-react';
import Link from 'next/link';

const navigation: NavigationGroup[] = [
  {
    items: [
      { label: '홈', href: '/dashboard', icon: Home },
    ],
  },
  {
    items: [
      {
        label: '콘텐츠',
        href: '/dashboard/videos',
        icon: Play,
        children: [
          { label: '영상 목록', href: '/dashboard/videos', icon: Video },
          { label: '채널 목록', href: '/dashboard/channels', icon: Users },
          { label: '키워드', href: '/dashboard/keywords', icon: Search },
        ],
      },
    ],
  },
  {
    items: [
      {
        label: '시청관리',
        href: '/dashboard/watch',
        icon: Eye,
        children: [
          { label: '시청관리', href: '/dashboard/watch', icon: Eye },
          { label: '대기열', href: '/dashboard/queue', icon: Clock },
          { label: '진행 중', href: '/dashboard/running', icon: Activity },
          { label: '스케줄러', href: '/dashboard/schedules', icon: Calendar },
          { label: '시청 등록', href: '/dashboard/register', icon: PlusCircle },
        ],
      },
    ],
  },
  {
    items: [
      {
        label: '인프라',
        href: '/dashboard/devices',
        icon: Server,
        children: [
          { label: '기기 현황', href: '/dashboard/devices', icon: Smartphone },
          { label: '기기 이슈', href: '/dashboard/devices/issues', icon: AlertTriangle },
          { label: '온보딩', href: '/dashboard/onboarding', icon: UserPlus },
          { label: 'Workers', href: '/dashboard/workers', icon: Cpu },
          { label: '노드 관리', href: '/dashboard/nodes', icon: LayoutGrid },
        ],
      },
    ],
  },
  {
    items: [
      {
        label: '리포트',
        href: '/dashboard/reports/daily',
        icon: BarChart3,
        children: [
          { label: '진행 보기', href: '/dashboard/analytics', icon: Activity },
          { label: '일일 리포트', href: '/dashboard/reports/daily', icon: FileText },
          { label: '완료 내역', href: '/dashboard/reports/history', icon: CheckCircle },
        ],
      },
    ],
  },
  {
    items: [
      { label: '설정', href: '/dashboard/settings', icon: Settings },
    ],
  },
  {
    title: '기타',
    items: [
      { label: '기술 소개', href: '/tech', icon: Globe },
      { label: 'Why Not Bot', href: '/why-not-bot', icon: Bot },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SocketProvider>
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Sidebar */}
          <AppSidebar
            navigation={navigation}
            logo={
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="font-head text-lg font-bold text-sidebar-foreground">DoAi.Me</span>
              </Link>
            }
          />

          {/* Main content area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <Header
              showSearch={false}
              showNotifications={true}
            />

            {/* Page content */}
            <main id="main-content" className="flex-1 overflow-y-auto p-4 bg-background">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </SocketProvider>
  );
}
