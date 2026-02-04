import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

/**
 * StatusIndicator 스타일 변형
 * Device Farm의 디바이스 상태를 시각적으로 표시
 */
const statusIndicatorVariants = cva(
  // 기본 스타일: 원형 점
  "inline-block rounded-full",
  {
    variants: {
      status: {
        idle: "bg-green-500",
        busy: "bg-blue-500",
        running: "bg-yellow-500",
        offline: "bg-gray-400",
        error: "bg-red-500",
      },
      size: {
        sm: "size-2",
        md: "size-3",
        lg: "size-4",
      },
      glow: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      // Glow 효과: 상태별 색상
      {
        status: "idle",
        glow: true,
        className: "status-glow-idle",
      },
      {
        status: "busy",
        glow: true,
        className: "status-glow-busy",
      },
      {
        status: "running",
        glow: true,
        className: "status-glow-running",
      },
      {
        status: "error",
        glow: true,
        className: "status-glow-error",
      },
      {
        status: "offline",
        glow: true,
        className: "status-glow-offline",
      },
    ],
    defaultVariants: {
      status: "offline",
      size: "md",
      glow: false,
    },
  }
);

export interface StatusIndicatorProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusIndicatorVariants> {
  /** 펄스 애니메이션 활성화 */
  pulse?: boolean;
}

/**
 * StatusIndicator 컴포넌트
 * 디바이스 상태를 시각적으로 표시하는 원형 인디케이터
 *
 * @example
 * // 기본 상태 점
 * <StatusIndicator status="idle" />
 *
 * // Glow 효과 추가
 * <StatusIndicator status="running" glow />
 *
 * // 펄스 애니메이션
 * <StatusIndicator status="error" pulse />
 *
 * // 라벨과 함께 사용
 * <div className="flex items-center gap-2">
 *   <StatusIndicator status="idle" glow />
 *   <span>Online</span>
 * </div>
 */
function StatusIndicator({
  className,
  status,
  size,
  glow,
  pulse,
  ...props
}: StatusIndicatorProps) {
  return (
    <span
      className={cn(
        statusIndicatorVariants({ status, size, glow }),
        pulse && "animate-pulse",
        className
      )}
      role="status"
      aria-label={`Status: ${status}`}
      {...props}
    />
  );
}

export { StatusIndicator, statusIndicatorVariants };
