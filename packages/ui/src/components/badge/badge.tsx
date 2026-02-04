import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

/**
 * RetroUI 스타일 배지 variants
 */
const badgeVariants = cva(
  "inline-flex items-center font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-muted text-muted-foreground border-2 border-foreground",
        primary:
          "bg-primary text-primary-foreground border-2 border-foreground",
        secondary:
          "bg-secondary text-secondary-foreground border-2 border-foreground",
        destructive:
          "bg-destructive text-destructive-foreground border-2 border-foreground",
        outline:
          "bg-transparent text-foreground border-2 border-foreground",
        success:
          "bg-green-300 text-green-800 border-2 border-green-800",
        warning:
          "bg-yellow-300 text-yellow-800 border-2 border-yellow-800",
        info:
          "bg-blue-300 text-blue-800 border-2 border-blue-800",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        default: "px-2.5 py-1 text-sm",
        lg: "px-3 py-1.5 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge - RetroUI/NeoBrutalist 스타일 배지
 */
function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
