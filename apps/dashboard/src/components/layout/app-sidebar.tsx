'use client';

import { cn } from '@/lib/utils';
import { useSidebar } from './sidebar-context';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronLeft, ChevronRight, ChevronDown, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
  children?: NavigationItem[];
}

export interface NavigationGroup {
  title?: string;
  items: NavigationItem[];
}

interface AppSidebarProps {
  navigation: NavigationGroup[];
  logo?: React.ReactNode;
  footer?: React.ReactNode;
}

export function AppSidebar({ navigation, logo, footer }: AppSidebarProps) {
  const { isCollapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    navigation.forEach(group => {
      group.items.forEach(item => {
        if (item.children?.some(child => pathname.startsWith(child.href))) {
          initial.add(item.label);
        }
      });
    });
    return initial;
  });
  // 현재 경로에 맞는 메뉴 자동 확장
  useEffect(() => {
    const newExpanded = new Set<string>();
    navigation.forEach(group => {
      group.items.forEach(item => {
        if (item.children?.some(child => pathname.startsWith(child.href))) {
          newExpanded.add(item.label);
        }
      });
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedItems(newExpanded);
  }, [pathname, navigation]);

  const toggleExpanded = (label: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const renderNavItem = (item: NavigationItem, depth = 0) => {
    const isActive = pathname === item.href || 
                     (item.children && item.children.some(c => pathname === c.href));
    const isExpanded = expandedItems.has(item.label);
    const hasChildren = item.children && item.children.length > 0;
    const Icon = item.icon;

    // 서브메뉴가 있는 경우
    if (hasChildren) {
      return (
        <div key={`${item.label}-${item.href ?? 'group'}`}>
          <button
            onClick={() => toggleExpanded(item.label)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'hover:bg-primary/20 hover:text-sidebar-foreground',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              isActive ? 'bg-primary text-primary-foreground font-bold' : 'text-sidebar-foreground',
              isCollapsed && 'justify-center px-2'
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary-foreground')} />
            <AnimatePresence mode="wait">
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 truncate text-left"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
            {!isCollapsed && (
              <ChevronDown 
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )} 
              />
            )}
          </button>
          
          <AnimatePresence>
            {isExpanded && !isCollapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
                  {item.children!.map(child => renderNavItem(child, depth + 1))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    // 일반 링크
    const linkContent = (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          isActive
            ? depth > 0
              ? 'bg-primary/20 text-foreground font-bold border-l-2 border-primary'
              : 'bg-primary text-primary-foreground font-bold'
            : '',
          isCollapsed && 'justify-center px-2',
          depth > 0 && 'py-1.5 text-sm'
        )}
      >
        <Icon className={cn(
          'shrink-0',
          isActive && (depth > 0 ? 'text-primary' : 'text-primary-foreground'),
          depth === 0 ? 'h-5 w-5' : 'h-4 w-4'
        )} />
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 truncate"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
        {!isCollapsed && item.badge !== undefined && (
          <span className="ml-auto rounded border-2 border-foreground bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {item.badge}
          </span>
        )}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.label}
            {item.badge !== undefined && (
              <span className="rounded border-2 border-foreground bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {item.badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={item.href}>{linkContent}</div>;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 64 : 256 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={cn(
          'relative flex h-screen flex-col border-r border-sidebar-border bg-sidebar',
          'overflow-hidden'
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center border-b border-sidebar-border px-3">
          <AnimatePresence mode="wait">
            {!isCollapsed && logo && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 overflow-hidden"
              >
                {logo}
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="ml-auto h-8 w-8 shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 overflow-y-auto p-2">
          {navigation.map((group, groupIndex) => (
            <div key={`group-${groupIndex}-${group.title ?? 'untitled'}`} className="space-y-1">
              {group.title && !isCollapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  {group.title}
                </motion.p>
              )}
              {group.items.map((item, itemIndex) => (
                <div key={`${groupIndex}-${itemIndex}-${item.href ?? item.label}`}>
                  {renderNavItem(item)}
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        {footer && (
          <div className="border-t border-sidebar-border p-2">
            {footer}
          </div>
        )}
      </motion.aside>
    </TooltipProvider>
  );
}
