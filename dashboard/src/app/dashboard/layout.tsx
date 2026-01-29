'use client';

import { SocketProvider } from '@/contexts/socket-context';
import { SidebarProvider } from '@/components/layout/sidebar-context';
import { AppSidebar, type NavigationGroup } from '@/components/layout/app-sidebar';
import { Header } from '@/components/layout/header';
import {
  LayoutDashboard,
  Monitor,
  PlayCircle,
  PlusCircle,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

const navigation: NavigationGroup[] = [
  {
    title: '메뉴',
    items: [
      { label: '대시보드', href: '/dashboard', icon: LayoutDashboard },
      { label: '기기관리', href: '/dashboard/nodes', icon: Monitor },
      { label: '작업관리', href: '/dashboard/jobs', icon: PlayCircle },
      { label: '작업등록', href: '/dashboard/register', icon: PlusCircle },
    ],
  },
  {
    title: '시스템',
    items: [
      { label: '설정', href: '/dashboard/settings', icon: Settings },
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
        <div className="flex h-screen overflow-hidden bg-black dark:bg-zinc-950">
          {/* Sidebar */}
          <AppSidebar
            navigation={navigation}
            logo={
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-white">DoAi.Me</span>
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
            <main id="main-content" className="flex-1 overflow-y-auto p-4 bg-zinc-950">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </SocketProvider>
  );
}
