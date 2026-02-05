"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Play,
  Video,
  Users,
  Search,
  ListTodo,
  Clock,
  Activity,
  Calendar,
  Smartphone,
  LayoutGrid,
  AlertTriangle,
  BarChart3,
  FileText,
  CheckCircle,
  ScrollText,
  Settings,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
깃을커커import { useState, useEffect } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface MenuItem {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  children?: {
    title: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

const menuItems: MenuItem[] = [
  {
    title: "홈",
    icon: Home,
    href: "/dashboard",
  },
  {
    title: "콘텐츠",
    icon: Play,
    children: [
      { title: "영상 목록", href: "/dashboard/videos", icon: Video },
      { title: "채널 목록", href: "/dashboard/channels", icon: Users },
      { title: "키워드", href: "/dashboard/keywords", icon: Search },
    ],
  },
  {
    title: "작업",
    icon: ListTodo,
    children: [
      { title: "대기열", href: "/dashboard/queue", icon: Clock },
      { title: "진행 중", href: "/dashboard/running", icon: Activity },
      { title: "스케줄러", href: "/dashboard/schedules", icon: Calendar },
    ],
  },
  {
    title: "디바이스",
    icon: Smartphone,
    children: [
      { title: "전체 현황", href: "/dashboard/devices", icon: LayoutGrid },
      { title: "문제 기기", href: "/dashboard/devices/issues", icon: AlertTriangle },
    ],
  },
  {
    title: "리포트",
    icon: BarChart3,
    children: [
      { title: "일일 리포트", href: "/dashboard/reports/daily", icon: FileText },
      { title: "완료 내역", href: "/dashboard/reports/history", icon: CheckCircle },
    ],
  },
  {
    title: "로그",
    icon: ScrollText,
    href: "/dashboard/logs",
  },
  {
    title: "설정",
    icon: Settings,
    href: "/dashboard/settings",
  },
];

interface NavItemProps {
  item: MenuItem;
}

function NavItem({ item }: NavItemProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(() =>
    item.children?.some((child) => pathname.startsWith(child.href)) ?? false
  );
  // 현재 경로가 자식 메뉴에 포함되면 열림 상태로 업데이트
  useEffect(() => {
    if (item.children) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOpen(item.children.some((child) => pathname.startsWith(child.href)));
    }
  }, [pathname, item.children]);

  const isActive = item.href
    ? pathname === item.href
    : item.children?.some((child) => pathname.startsWith(child.href));

  // 단일 링크 메뉴
  if (item.href) {
    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <item.icon className="h-4 w-4" />
        {item.title}
      </Link>
    );
  }

  // 자식 메뉴가 있는 경우
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <div className="flex items-center gap-3">
          <item.icon className="h-4 w-4" />
          {item.title}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 pt-1">
        <div className="flex flex-col gap-1 border-l border-border pl-3">
          {item.children?.map((child) => {
            const isChildActive = pathname === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isChildActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <child.icon className="h-4 w-4" />
                {child.title}
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AppSidebarProps {
  connectedDevices?: number;
  maxDevices?: number;
  todayCompleted?: number;
}

export function AppSidebar({ 
  connectedDevices = 0, 
  maxDevices = 500, 
  todayCompleted = 0 
}: AppSidebarProps) {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-background">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Play className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">DoAi.Me</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-4">
        {menuItems.map((item) => (
          <NavItem key={item.title} item={item} />
        ))}
      </nav>

      {/* Footer Stats */}
      <div className="absolute bottom-0 left-0 right-0 border-t p-4">
        <div className="rounded-lg bg-muted p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">연결된 디바이스</span>
            <span className="font-mono font-semibold text-green-500">
              {connectedDevices}/{maxDevices}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">오늘 완료</span>
            <span className="font-mono font-semibold">{todayCompleted.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
