'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ChartAreaProps {
  data: { name: string; value: number; [key: string]: string | number }[];
  title?: string;
  description?: string;
  height?: number;
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  dataKey?: string;
  className?: string;
}

export function ChartArea({
  data,
  title,
  description,
  height = 300,
  color = 'hsl(var(--chart-1))',
  gradientFrom = 'hsl(var(--chart-1) / 0.3)',
  gradientTo = 'hsl(var(--chart-1) / 0)',
  showGrid = true,
  showTooltip = true,
  showXAxis = true,
  showYAxis = true,
  dataKey = 'value',
  className,
}: ChartAreaProps) {
  const gradientId = `gradient-${useId()}`;

  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={gradientFrom} />
            <stop offset="95%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        )}
        {showXAxis && (
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            className="text-muted-foreground"
          />
        )}
        {showYAxis && (
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            className="text-muted-foreground"
          />
        )}
        {showTooltip && (
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              borderRadius: 'var(--radius)',
              color: 'hsl(var(--popover-foreground))',
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  );

  if (title || description) {
    return (
      <Card className={className}>
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{chart}</CardContent>
      </Card>
    );
  }

  return <div className={className}>{chart}</div>;
}
