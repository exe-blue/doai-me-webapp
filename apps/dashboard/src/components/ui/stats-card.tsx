import * as React from "react";
import { cn } from "@/lib/utils";

const variantStyles = {
  default: "border-foreground shadow-foreground",
  success: "border-green-600 shadow-green-600",
  warning: "border-yellow-600 shadow-yellow-600",
  danger: "border-red-600 shadow-red-600",
  info: "border-blue-600 shadow-blue-600",
  muted: "border-muted-foreground shadow-muted-foreground",
} as const;

const valueColors = {
  default: "text-foreground",
  success: "text-green-600",
  warning: "text-yellow-600",
  danger: "text-red-600",
  info: "text-blue-600",
  muted: "text-muted-foreground",
} as const;

const iconColors = {
  default: "text-muted-foreground",
  success: "text-green-600",
  warning: "text-yellow-600",
  danger: "text-red-600",
  info: "text-blue-600",
  muted: "text-muted-foreground",
} as const;

type StatsCardVariant = keyof typeof variantStyles;

interface StatsCardProps extends React.ComponentProps<"div"> {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  variant?: StatsCardVariant;
}

function StatsCard({
  label,
  value,
  icon,
  variant = "default",
  className,
  ...props
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "border-2 bg-card shadow-[4px_4px_0px_0px] p-4",
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className={cn("text-2xl font-bold", valueColors[variant])}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
        </div>
        {icon && <div className={iconColors[variant]}>{icon}</div>}
      </div>
    </div>
  );
}

export { StatsCard, type StatsCardProps, type StatsCardVariant };
