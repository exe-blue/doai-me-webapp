'use client';

import {
  Bar,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ChartBarProps {
  data: { name: string; value: number; [key: string]: string | number }[];
  title?: string;
  description?: string;
  height?: number;
  color?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  dataKey?: string;
  horizontal?: boolean;
  className?: string;
}

export function ChartBar({
  data,
  title,
  description,
  height = 300,
  color = 'hsl(var(--chart-2))',
  showGrid = true,
  showTooltip = true,
  showXAxis = true,
  showYAxis = true,
  dataKey = 'value',
  horizontal = false,
  className,
}: ChartBarProps) {
  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        )}
        {showXAxis && (
          horizontal ? (
            <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          ) : (
            <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          )
        )}
        {showYAxis && (
          horizontal ? (
            <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
          ) : (
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          )
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
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
      </RechartsBarChart>
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
