'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface MarqueeProps {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  vertical?: boolean;
  repeat?: number;
  duration?: number;
  gap?: number;
}

export function Marquee({
  children,
  className,
  reverse = false,
  pauseOnHover = false,
  vertical = false,
  repeat = 4,
  duration = 40,
  gap = 16,
}: MarqueeProps) {
  return (
    <div
      className={cn(
        'group flex overflow-hidden',
        vertical ? 'flex-col' : 'flex-row',
        className
      )}
      style={{
        '--duration': `${duration}s`,
        '--gap': `${gap}px`,
      } as React.CSSProperties}
    >
      {Array.from({ length: repeat }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex shrink-0',
            vertical ? 'flex-col' : 'flex-row',
            vertical
              ? reverse
                ? 'animate-marquee-vertical [animation-direction:reverse]'
                : 'animate-marquee-vertical'
              : reverse
                ? 'animate-marquee [animation-direction:reverse]'
                : 'animate-marquee',
            pauseOnHover && 'group-hover:[animation-play-state:paused]'
          )}
          style={{ gap: `var(--gap)` }}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
