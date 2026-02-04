import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

const skeletonVariants = cva(
  "border-2 border-foreground",
  {
    variants: {
      variant: {
        default: "bg-muted animate-pulse",
        loader: "bg-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

/**
 * Skeleton - RetroUI/NeoBrutalist 스타일 스켈레톤 로더
 */
function Skeleton({ className, variant, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(skeletonVariants({ variant }), className)}
      {...props}
    />
  );
}

/**
 * Loader - RetroUI 스타일 바운스 로더
 */
interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  count?: number;
  duration?: number;
  delayStep?: number;
}

function Loader({
  className,
  count = 3,
  duration = 0.5,
  delayStep = 100,
  ...props
}: LoaderProps) {
  return (
    <div className={cn("flex gap-1", className)} {...props}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-3 w-3 bg-primary border-2 border-foreground animate-bounce"
          style={{
            animationDuration: `${duration}s`,
            animationDelay: `${i * delayStep}ms`,
          }}
        />
      ))}
    </div>
  );
}

export { Skeleton, Loader };
