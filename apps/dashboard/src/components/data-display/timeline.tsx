'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';

interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: LucideIcon;
  status?: 'success' | 'error' | 'warning' | 'info' | 'default';
}

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

const statusColors = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
  default: 'bg-muted-foreground',
};

export function Timeline({ items, className }: TimelineProps) {
  return (
    <div className={cn('relative space-y-4', className)}>
      {/* Vertical line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

      {items.map((item, index) => {
        const Icon = item.icon;
        const status = item.status || 'default';

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            className="relative pl-8"
          >
            {/* Dot / Icon */}
            <div
              className={cn(
                'absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full',
                statusColors[status]
              )}
            >
              {Icon ? (
                <Icon className="h-3 w-3 text-white" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>

            {/* Content */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <span className="text-xs text-muted-foreground">{item.timestamp}</span>
              </div>
              {item.description && (
                <p className="text-sm text-muted-foreground">{item.description}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
