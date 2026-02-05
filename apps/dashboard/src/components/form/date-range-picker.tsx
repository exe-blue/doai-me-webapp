'use client';

import { useState, useRef, useEffect } from 'react';
import { format, subDays, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DateRange {
  from: Date;
  to: Date;
}

interface Preset {
  label: string;
  range: DateRange;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  presets?: Preset[];
  placeholder?: string;
  className?: string;
}

const defaultPresets: Preset[] = [
  { label: '오늘', range: { from: new Date(), to: new Date() } },
  { label: '지난 7일', range: { from: subDays(new Date(), 6), to: new Date() } },
  { label: '지난 30일', range: { from: subDays(new Date(), 29), to: new Date() } },
  { label: '이번 주', range: { from: startOfWeek(new Date(), { locale: ko }), to: endOfWeek(new Date(), { locale: ko }) } },
  { label: '이번 달', range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
];

export function DateRangePicker({
  value,
  onChange,
  presets = defaultPresets,
  placeholder = '날짜 선택',
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selecting, setSelecting] = useState<'from' | 'to'>('from');
  const [tempRange, setTempRange] = useState<Partial<DateRange>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const displayValue = value
    ? `${format(value.from, 'yyyy.MM.dd', { locale: ko })} - ${format(value.to, 'yyyy.MM.dd', { locale: ko })}`
    : placeholder;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handleDateClick = (date: Date) => {
    if (selecting === 'from') {
      setTempRange({ from: date });
      setSelecting('to');
    } else {
      const from = tempRange.from!;
      const finalRange = date < from
        ? { from: date, to: from }
        : { from, to: date };
      onChange(finalRange);
      setTempRange({});
      setSelecting('from');
      setIsOpen(false);
    }
  };

  const handlePresetClick = (preset: Preset) => {
    onChange(preset.range);
    setIsOpen(false);
  };

  const isInRange = (date: Date) => {
    if (!value) return false;
    return date >= value.from && date <= value.to;
  };

  const isRangeStart = (date: Date) => {
    if (!value) return false;
    return date.toDateString() === value.from.toDateString();
  };

  const isRangeEnd = (date: Date) => {
    if (!value) return false;
    return date.toDateString() === value.to.toDateString();
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full justify-start text-left font-normal',
          !value && 'text-muted-foreground'
        )}
      >
        <Calendar className="mr-2 h-4 w-4" />
        {displayValue}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 rounded-md border bg-popover shadow-md p-4"
          >
            <div className="flex gap-4">
              {/* Presets */}
              <div className="space-y-1 border-r pr-4">
                {presets.map((preset, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handlePresetClick(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              {/* Calendar */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    {format(currentMonth, 'yyyy년 M월', { locale: ko })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
                  {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                    <div key={day} className="w-8">{day}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {getDaysInMonth(currentMonth).map((date, index) => {
                    if (!date) {
                      return <div key={`empty-${index}`} className="w-8 h-8" />;
                    }

                    const inRange = isInRange(date);
                    const isStart = isRangeStart(date);
                    const isEnd = isRangeEnd(date);
                    const isToday = date.toDateString() === new Date().toDateString();

                    return (
                      <button
                        key={date.toISOString()}
                        type="button"
                        onClick={() => handleDateClick(date)}
                        className={cn(
                          'w-8 h-8 text-sm rounded-md transition-colors',
                          'hover:bg-accent hover:text-accent-foreground',
                          inRange && 'bg-accent/50',
                          (isStart || isEnd) && 'bg-primary text-primary-foreground',
                          isToday && !inRange && 'border border-primary',
                        )}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
